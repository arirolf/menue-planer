import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import { db, transaction } from './db.js';
import listsRouter, { validUserIds } from './lists.js';
import shopRouter, { nameKey, setTag, tagMap } from './shop.js';
import calendarsRouter, { adminRouter as adminCalendarsRouter } from './calendars.js';
import { PRESET_SERVINGS } from './shared/scale.js';
import {
  checkLogin,
  getSessionUser,
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
// Behind a reverse proxy (Caddy, Nginx, Cloudflare Tunnel …) on the same machine
// or Docker network, trust its X-Forwarded-Proto so req.secure knows about HTTPS
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal');
app.use(express.json());
app.use(cookieParser());

// Serve the built Svelte app (web/dist)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The installed Android app colors the phone's bottom bar from the manifest's
// theme_color (the page can't change it), so each user gets their frame color here.
// Must come before express.static, which would serve the plain file.
app.get('/manifest.webmanifest', (req, res, next) => {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'web', 'dist', 'manifest.webmanifest'), 'utf8'));
  } catch {
    return next();
  }
  const user = getSessionUser(req.cookies[SESSION_COOKIE]);
  if (user) manifest.theme_color = user.color_frame ?? user.color_main ?? manifest.theme_color;
  res.set('Cache-Control', 'no-cache').type('application/manifest+json').send(JSON.stringify(manifest));
});

app.use(express.static(path.join(__dirname, 'web', 'dist')));

// Optional "not checked yet" flag on recipes, off unless RECIPE_CHECKS=1
const RECIPE_CHECKS = ['1', 'true'].includes(String(process.env.RECIPE_CHECKS).toLowerCase());

// ---------- Helpers ----------

function validateRecipe(body) {
  const { name, time_range, difficulty, ingredients = [] } = body;
  if (!name || typeof name !== 'string' || !name.trim()) return 'Name is required';
  if (!Number.isInteger(time_range) || time_range < 1 || time_range > 6) return 'time_range must be 1-6';
  // 4 = "Sonntagsessen": takes all day, for special occasions
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 4) return 'difficulty must be 1-4';
  if (!Array.isArray(ingredients)) return 'ingredients must be a list';
  if (body.notes != null && (typeof body.notes !== 'string' || body.notes.length > 2000)) {
    return 'notes must be text (max 2000 characters)';
  }
  if (body.checked !== undefined && typeof body.checked !== 'boolean') return 'checked must be true or false';
  for (const ing of ingredients) {
    if (!ing || typeof ing.name !== 'string' || !ing.name.trim()) {
      return 'Every ingredient needs a name';
    }
    for (const key of ['amount', ...PRESET_SERVINGS.map((n) => `amount_${n}`)]) {
      if (ing[key] != null && typeof ing[key] !== 'string') return `${key} must be text`;
    }
    // Optional: undefined keeps the remembered category, null forgets it
    const cat = ing.category_id;
    if (cat !== undefined && cat !== null
        && (!Number.isInteger(cat) || !db.prepare('SELECT id FROM item_categories WHERE id = ?').get(cat))) {
      return 'category_id must be an existing category or null';
    }
  }
  return null;
}

// category_id is the remembered category for the ingredient's name (shared with shopping lists)
function getIngredients(recipeId) {
  const tags = tagMap();
  return db
    .prepare('SELECT name, amount, amount_6, amount_8 FROM ingredients WHERE recipe_id = ? ORDER BY id')
    .all(recipeId)
    .map((ing) => ({ ...ing, category_id: tags.get(nameKey(ing.name)) ?? null }));
}

// SQLite stores checked as 0/1, the app gets a real boolean
function publicRecipe(r) {
  return { ...r, checked: r.checked === 1 };
}

// Empty text counts as "not set"
function cleanAmount(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

// amount_6 / amount_8 are only stored when someone typed them in by hand
function saveIngredients(recipeId, ingredients) {
  const insert = db.prepare(
    'INSERT INTO ingredients (recipe_id, name, amount, amount_6, amount_8) VALUES (?, ?, ?, ?, ?)'
  );
  for (const ing of ingredients) {
    insert.run(
      recipeId,
      ing.name.trim(),
      cleanAmount(ing.amount),
      cleanAmount(ing.amount_6),
      cleanAmount(ing.amount_8)
    );
    // The category isn't stored on the ingredient but remembered per name,
    // so the item is sorted right when it lands on a shopping list
    if (ing.category_id !== undefined) setTag(ing.name, ing.category_id);
  }
}

// What the web app gets to know about the logged-in user
function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    language: u.language,
    is_admin: u.is_admin === 1,
    color_main: u.color_main ?? null,
    color_secondary: u.color_secondary ?? null,
    color_frame: u.color_frame ?? null,
    open_main_list: u.open_main_list === 1,
    recipe_checks: RECIPE_CHECKS,
  };
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
    // Secure on HTTPS; plain http (e.g. http://192.168.1.10:4100 at home) still works
    secure: req.secure,
    expires: new Date(expiresAt),
  });
  res.json(publicUser(user));
});

// ---------- Everything below requires a login ----------

app.use('/api', requireAuth);

app.get('/api/auth/me', (req, res) => {
  res.json({ ...req.user, recipe_checks: RECIPE_CHECKS });
});

// Personal settings of the logged-in user. Only the fields sent get changed.
const LANGUAGES = ['de', 'en'];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

app.patch('/api/auth/me', (req, res) => {
  const body = req.body ?? {};
  const changes = {};

  if (body.language !== undefined) {
    if (!LANGUAGES.includes(body.language)) {
      return res.status(400).json({ error: 'language must be de or en' });
    }
    changes.language = body.language;
  }
  // null = back to the default color
  for (const key of ['color_main', 'color_secondary', 'color_frame']) {
    if (body[key] === undefined) continue;
    if (body[key] !== null && !HEX_COLOR.test(body[key])) {
      return res.status(400).json({ error: `${key} must be like #ff6b35 or null` });
    }
    changes[key] = body[key]?.toLowerCase() ?? null;
  }

  if (body.open_main_list !== undefined) {
    if (typeof body.open_main_list !== 'boolean') {
      return res.status(400).json({ error: 'open_main_list must be true or false' });
    }
    changes.open_main_list = body.open_main_list ? 1 : 0;
  }

  // Column names come from the fixed list above, never from the request
  for (const [key, value] of Object.entries(changes)) {
    db.prepare(`UPDATE users SET ${key} = ? WHERE id = ?`).run(value, req.user.id);
  }

  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)));
});

app.post('/api/auth/logout', (req, res) => {
  deleteSession(req.cookies[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE);
  res.status(204).end();
});

// All usernames, for the share picker
app.get('/api/users', (req, res) => {
  res.json(db.prepare('SELECT id, username FROM users ORDER BY username').all());
});

// All shopping list routes live in lists.js
app.use('/api/lists', listsRouter);
app.use('/api', shopRouter);
app.use('/api/calendars', calendarsRouter);
app.use('/api/admin/calendars', adminCalendarsRouter);

// ---------- Recipes ----------

// All recipes, including ingredient names and who doesn't like them
app.get('/api/recipes', (req, res) => {
  const recipes = db
    .prepare('SELECT * FROM recipes ORDER BY name COLLATE NOCASE')
    .all();
  const ingredients = db
    .prepare('SELECT recipe_id, name FROM ingredients ORDER BY id')
    .all();
  const dislikes = db
    .prepare(`
      SELECT d.recipe_id, u.id AS user_id, u.username
      FROM recipe_dislikes d
      JOIN users u ON u.id = d.user_id
      ORDER BY u.username
    `)
    .all();

  res.json(
    recipes.map((r) => {
      const forRecipe = dislikes.filter((d) => d.recipe_id === r.id);
      return {
        ...publicRecipe(r),
        ingredients: ingredients.filter((i) => i.recipe_id === r.id).map((i) => i.name),
        disliked_by: forRecipe.map((d) => d.username),
        disliked_by_ids: forRecipe.map((d) => d.user_id),
        disliked_by_me: forRecipe.some((d) => d.user_id === req.user.id),
      };
    })
  );
});

// One random recipe, filtered by time, difficulty and who is eating.
// Without filters every recipe can come up, Sonntagsessen (4) included.
// IMPORTANT: must come BEFORE /api/recipes/:id
app.get('/api/recipes/random', (req, res) => {
  const maxTime = Number(req.query.max_time) || 6;
  const maxDifficulty = Number(req.query.max_difficulty) || 4;

  // "?eaters=1,3" -> [1, 3]
  const eaters = String(req.query.eaters ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 50);

  // Skip recipes that anyone eating doesn't like
  const placeholders = eaters.map(() => '?').join(', ');
  const dislikeFilter = eaters.length
    ? `AND NOT EXISTS (
         SELECT 1 FROM recipe_dislikes d
         WHERE d.recipe_id = recipes.id AND d.user_id IN (${placeholders})
       )`
    : '';

  const recipe = db
    .prepare(`
      SELECT * FROM recipes
      WHERE time_range <= ? AND difficulty <= ?
      ${dislikeFilter}
      ORDER BY RANDOM() LIMIT 1
    `)
    .get(maxTime, maxDifficulty, ...eaters);

  if (!recipe) return res.status(404).json({ error: 'No matching recipe' });
  res.json({ ...publicRecipe(recipe), ingredients: getIngredients(recipe.id) });
});

// Flag / unflag "I don't like this" for the logged-in user
app.put('/api/recipes/:id/dislike', (req, res) => {
  const id = Number(req.params.id);
  if (typeof req.body?.dislike !== 'boolean') {
    return res.status(400).json({ error: 'dislike must be true or false' });
  }
  if (!db.prepare('SELECT id FROM recipes WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Recipe not found' });
  }

  if (req.body.dislike) {
    db.prepare('INSERT OR IGNORE INTO recipe_dislikes (user_id, recipe_id) VALUES (?, ?)')
      .run(req.user.id, id);
  } else {
    db.prepare('DELETE FROM recipe_dislikes WHERE user_id = ? AND recipe_id = ?')
      .run(req.user.id, id);
  }
  res.json({ ok: true });
});

// Mark a recipe as checked (gone through, typed in right) or not
app.put('/api/recipes/:id/checked', (req, res) => {
  if (!RECIPE_CHECKS) return res.status(404).json({ error: 'Not found' });
  if (typeof req.body?.checked !== 'boolean') {
    return res.status(400).json({ error: 'checked must be true or false' });
  }
  const result = db
    .prepare('UPDATE recipes SET checked = ? WHERE id = ?')
    .run(req.body.checked ? 1 : 0, Number(req.params.id));
  if (result.changes === 0) return res.status(404).json({ error: 'Recipe not found' });
  res.json({ ok: true });
});

app.get('/api/recipes/:id', (req, res) => {
  const recipe = db
    .prepare('SELECT * FROM recipes WHERE id = ?')
    .get(Number(req.params.id));

  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
  res.json({ ...publicRecipe(recipe), ingredients: getIngredients(recipe.id) });
});

app.post('/api/recipes', (req, res) => {
  const error = validateRecipe(req.body ?? {});
  if (error) return res.status(400).json({ error });

  const { name, time_range, difficulty, ingredients = [], notes, checked = false } = req.body;

  try {
    const id = transaction(() => {
      const result = db
        .prepare(`
          INSERT INTO recipes (name, time_range, difficulty, notes, checked, created_by)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(name.trim(), time_range, difficulty, notes?.trim() || null, checked ? 1 : 0, req.user.id);
      const recipeId = Number(result.lastInsertRowid);
      saveIngredients(recipeId, ingredients);
      return recipeId;
    });
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: 'Could not save recipe' });
  }
});

app.put('/api/recipes/:id', (req, res) => {
  const id = Number(req.params.id);
  const error = validateRecipe(req.body ?? {});
  if (error) return res.status(400).json({ error });

  const exists = db.prepare('SELECT id FROM recipes WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ error: 'Recipe not found' });

  const { name, time_range, difficulty, ingredients = [], notes, checked } = req.body;

  try {
    transaction(() => {
      db.prepare('UPDATE recipes SET name = ?, time_range = ?, difficulty = ? WHERE id = ?')
        .run(name.trim(), time_range, difficulty, id);
      // Both optional: left out = keep what's there
      if (notes !== undefined) db.prepare('UPDATE recipes SET notes = ? WHERE id = ?').run(notes?.trim() || null, id);
      if (checked !== undefined) db.prepare('UPDATE recipes SET checked = ? WHERE id = ?').run(checked ? 1 : 0, id);
      db.prepare('DELETE FROM ingredients WHERE recipe_id = ?').run(id);
      saveIngredients(id, ingredients);
    });
    res.json({ id });
  } catch (err) {
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

// ---------- Admin: users ----------

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

// ---------- Admin: households ----------

app.get('/api/admin/households', requireAdmin, (req, res) => {
  const households = db
    .prepare('SELECT id, name FROM households ORDER BY name COLLATE NOCASE')
    .all();
  const members = db
    .prepare(`
      SELECT hm.household_id, u.id, u.username FROM household_members hm
      JOIN users u ON u.id = hm.user_id ORDER BY u.username
    `)
    .all();

  res.json(
    households.map((h) => ({
      ...h,
      members: members
        .filter((m) => m.household_id === h.id)
        .map(({ id, username }) => ({ id, username })),
    }))
  );
});

app.post('/api/admin/households', requireAdmin, (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const id = transaction(() => {
    const r = db.prepare('INSERT INTO households (name) VALUES (?)').run(name);
    const householdId = Number(r.lastInsertRowid);
    db.prepare('INSERT INTO shopping_lists (name, household_id) VALUES (?, ?)').run(name, householdId);
    return householdId;
  });
  res.status(201).json({ id });
});

app.patch('/api/admin/households/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const changes = transaction(() => {
    const r = db.prepare('UPDATE households SET name = ? WHERE id = ?').run(name, id);
    db.prepare('UPDATE shopping_lists SET name = ? WHERE household_id = ?').run(name, id);
    return r.changes;
  });
  if (changes === 0) return res.status(404).json({ error: 'Household not found' });
  res.json({ ok: true });
});

app.delete('/api/admin/households/:id', requireAdmin, (req, res) => {
  const r = db.prepare('DELETE FROM households WHERE id = ?').run(Number(req.params.id));
  if (r.changes === 0) return res.status(404).json({ error: 'Household not found' });
  res.status(204).end();
});

app.put('/api/admin/households/:id/members', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM households WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Household not found' });
  }
  const ids = validUserIds(req.body?.user_ids);
  if (!ids) return res.status(400).json({ error: 'user_ids must be a list of existing users' });

  transaction(() => {
    db.prepare('DELETE FROM household_members WHERE household_id = ?').run(id);
    const insert = db.prepare('INSERT INTO household_members (household_id, user_id) VALUES (?, ?)');
    for (const userId of ids) insert.run(id, userId);
  });
  res.json({ ok: true });
});

// ---------- First start: create an admin ----------

if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0) {
  const username = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    console.error('ADMIN_USERNAME: 2-30 characters, only a-z, 0-9, _ and -');
    process.exit(1);
  }
  const password = process.env.ADMIN_PASSWORD || generatePassword();
  db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)')
    .run(username, hashPassword(password));
  console.log('==================================================');
  console.log(`First start: created admin "${username}"`);
  if (!process.env.ADMIN_PASSWORD) console.log(`Password: ${password}`);
  console.log('Log in and add more users in the Admin tab.');
  console.log('==================================================');
}

// ---------- Start ----------

const PORT = process.env.PORT || 4100;

app.listen(PORT, () => {
  console.log(`Menu app running on http://localhost:${PORT}`);
});