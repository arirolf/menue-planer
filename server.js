import express from 'express';
import cookieParser from 'cookie-parser';
import { db } from './db.js';
import {
  checkLogin,
  createSession,
  deleteSession,
  deleteUserSessions,
  requireAuth,
  requireAdmin,
  cleanupSessions,
  hashPassword,
  generatePassword,
  USERNAME_PATTERN,
  SESSION_COOKIE,
} from './auth.js';

cleanupSessions();

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// ---------- Helpers ----------

function validateRecipe(body) {
  const { name, time_range, difficulty, ingredients = [] } = body;
  if (!name || typeof name !== 'string' || !name.trim()) return 'Name is required';
  if (!Number.isInteger(time_range) || time_range < 1 || time_range > 6) return 'time_range must be 1-6';
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 3) return 'difficulty must be 1-3';
  if (!Array.isArray(ingredients)) return 'ingredients must be a list';
  for (const ing of ingredients) {
    if (!ing || typeof ing.name !== 'string' || !ing.name.trim()) {
      return 'Every ingredient needs a name';
    }
  }
  return null;
}

function getIngredients(recipeId) {
  return db
    .prepare('SELECT name, amount FROM ingredients WHERE recipe_id = ? ORDER BY id')
    .all(recipeId);
}

function saveIngredients(recipeId, ingredients) {
  const insert = db.prepare(
    'INSERT INTO ingredients (recipe_id, name, amount) VALUES (?, ?, ?)'
  );
  for (const ing of ingredients) {
    insert.run(recipeId, ing.name.trim(), ing.amount ?? null);
  }
}

// ---------- Auth (public) ----------

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = checkLogin(username.trim().toLowerCase(), password);
  if (!user) return res.status(401).json({ error: 'Wrong username or password' });

  const { token, expiresAt } = createSession(user.id);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(expiresAt),
  });
  res.json({
    id: user.id,
    username: user.username,
    language: user.language,
    is_admin: user.is_admin === 1,
  });
});

// ---------- Everything below requires a login ----------

app.use('/api', requireAuth);

app.get('/api/auth/me', (req, res) => {
  res.json(req.user);
});

app.post('/api/auth/logout', (req, res) => {
  deleteSession(req.cookies[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE);
  res.status(204).end();
});

// ---------- Recipes ----------

app.get('/api/recipes', (req, res) => {
  const recipes = db
    .prepare('SELECT * FROM recipes ORDER BY name COLLATE NOCASE')
    .all();
  res.json(recipes);
});

// IMPORTANT: must come BEFORE /api/recipes/:id
app.get('/api/recipes/random', (req, res) => {
  const maxTime = Number(req.query.max_time) || 6;
  const maxDifficulty = Number(req.query.max_difficulty) || 3;

  const recipe = db
    .prepare(`
      SELECT * FROM recipes
      WHERE time_range <= ? AND difficulty <= ?
      ORDER BY RANDOM() LIMIT 1
    `)
    .get(maxTime, maxDifficulty);

  if (!recipe) return res.status(404).json({ error: 'No matching recipe' });
  recipe.ingredients = getIngredients(recipe.id);
  res.json(recipe);
});

app.get('/api/recipes/:id', (req, res) => {
  const recipe = db
    .prepare('SELECT * FROM recipes WHERE id = ?')
    .get(Number(req.params.id));

  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
  recipe.ingredients = getIngredients(recipe.id);
  res.json(recipe);
});

app.post('/api/recipes', (req, res) => {
  const error = validateRecipe(req.body ?? {});
  if (error) return res.status(400).json({ error });

  const { name, time_range, difficulty, ingredients = [] } = req.body;

  db.exec('BEGIN');
  try {
    const result = db
      .prepare('INSERT INTO recipes (name, time_range, difficulty, created_by) VALUES (?, ?, ?, ?)')
      .run(name.trim(), time_range, difficulty, req.user.id);
    const recipeId = Number(result.lastInsertRowid);
    saveIngredients(recipeId, ingredients);
    db.exec('COMMIT');
    res.status(201).json({ id: recipeId });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'Could not save recipe' });
  }
});

app.put('/api/recipes/:id', (req, res) => {
  const id = Number(req.params.id);
  const error = validateRecipe(req.body ?? {});
  if (error) return res.status(400).json({ error });

  const exists = db.prepare('SELECT id FROM recipes WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ error: 'Recipe not found' });

  const { name, time_range, difficulty, ingredients = [] } = req.body;

  db.exec('BEGIN');
  try {
    db.prepare('UPDATE recipes SET name = ?, time_range = ?, difficulty = ? WHERE id = ?')
      .run(name.trim(), time_range, difficulty, id);
    db.prepare('DELETE FROM ingredients WHERE recipe_id = ?').run(id);
    saveIngredients(id, ingredients);
    db.exec('COMMIT');
    res.json({ id });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'Could not update recipe' });
  }
});

app.delete('/api/recipes/:id', (req, res) => {
  const result = db
    .prepare('DELETE FROM recipes WHERE id = ?')
    .run(Number(req.params.id));

  if (result.changes === 0) return res.status(404).json({ error: 'Recipe not found' });
  res.status(204).end();
});

// ---------- Admin ----------

app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = db
    .prepare('SELECT id, username, language, is_admin, created_at FROM users ORDER BY username')
    .all();
  res.json(users.map((u) => ({ ...u, is_admin: u.is_admin === 1 })));
});

app.post('/api/admin/users', requireAdmin, (req, res) => {
  const { username, is_admin = false } = req.body ?? {};
  if (typeof username !== 'string') {
    return res.status(400).json({ error: 'Username required' });
  }

  const clean = username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(clean)) {
    return res.status(400).json({ error: 'Username: 2-30 characters, only a-z, 0-9, _ and -' });
  }
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(clean)) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const password = generatePassword();
  const r = db
    .prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)')
    .run(clean, hashPassword(password), is_admin ? 1 : 0);
  res.status(201).json({ id: Number(r.lastInsertRowid), username: clean, password });
});

app.post('/api/admin/users/:id/reset-password', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'User not found' });
  }

  const password = generatePassword();
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), id);
  deleteUserSessions(id);
  res.json({ password });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) {
    return res.status(400).json({ error: "You can't delete yourself" });
  }

  const r = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ error: 'User not found' });
  res.status(204).end();
});

const PORT = process.env.PORT || 4100;

app.listen(PORT, () => {
  console.log(`Menu app running on http://localhost:${PORT}`);
});