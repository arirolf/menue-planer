import express from 'express';
import { db, transaction } from './db.js';
import { BASE_SERVINGS, amountFor, isValidServings } from './shared/scale.js';
import { isValidDate } from './calendars.js';

const router = express.Router();

// ---------- Helpers ----------

// Checks a list of user ids: only whole numbers, all must exist
export function validUserIds(ids) {
  if (!Array.isArray(ids) || !ids.every(Number.isInteger)) return null;
  const unique = [...new Set(ids)];
  const exists = db.prepare('SELECT id FROM users WHERE id = ?');
  return unique.every((id) => exists.get(id)) ? unique : null;
}

const LIST_SELECT = `
  SELECT l.id, l.name, l.owner_id, l.household_id,
         u.username AS owner_name,
         (SELECT COUNT(*) FROM list_items i WHERE i.list_id = l.id AND i.checked = 0) AS open_count
  FROM shopping_lists l
  LEFT JOIN users u ON u.id = l.owner_id
`;

// A user may see a list if they own it, it's shared with them,
// or it belongs to one of their households
const ACCESS = `(
  l.owner_id = ?
  OR EXISTS (SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = ?)
  OR EXISTS (SELECT 1 FROM household_members hm
             WHERE hm.household_id = l.household_id AND hm.user_id = ?)
)`;

// Middleware: loads the list and checks access
function loadList(req, res, next) {
  const uid = req.user.id;
  const list = db
    .prepare(`${LIST_SELECT} WHERE l.id = ? AND ${ACCESS}`)
    .get(Number(req.params.id), uid, uid, uid);

  // 404 instead of 403: don't even reveal that the list exists
  if (!list) return res.status(404).json({ error: 'List not found' });
  req.list = list;
  next();
}

function requireOwner(req, res, next) {
  if (req.list.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the owner can do that' });
  }
  next();
}

// ---------- Lists ----------

// All lists I can see: household lists first, then personal ones
router.get('/', (req, res) => {
  const uid = req.user.id;
  const lists = db
    .prepare(`${LIST_SELECT} WHERE ${ACCESS} ORDER BY l.household_id IS NULL, l.name COLLATE NOCASE`)
    .all(uid, uid, uid);
  res.json(lists);
});

// Create a personal list
router.post('/', (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const r = db
    .prepare('INSERT INTO shopping_lists (name, owner_id) VALUES (?, ?)')
    .run(name, req.user.id);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

// One list including items and members
router.get('/:id', loadList, (req, res) => {
  const list = req.list;

  list.items = db
    .prepare(`
      SELECT id, name, amount, checked, recipe_name, planned_date, servings
      FROM list_items WHERE list_id = ? ORDER BY checked, id
    `)
    .all(list.id)
    .map((item) => ({ ...item, checked: item.checked === 1 }));

  list.members = list.household_id
    ? db
        .prepare(`
          SELECT u.id, u.username FROM household_members hm
          JOIN users u ON u.id = hm.user_id
          WHERE hm.household_id = ? ORDER BY u.username
        `)
        .all(list.household_id)
    : db
        .prepare(`
          SELECT u.id, u.username FROM list_members m
          JOIN users u ON u.id = m.user_id
          WHERE m.list_id = ? ORDER BY u.username
        `)
        .all(list.id);

  res.json(list);
});

// Rename (owner only)
router.patch('/:id', loadList, requireOwner, (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'Name is required' });

  db.prepare('UPDATE shopping_lists SET name = ? WHERE id = ?').run(name, req.list.id);
  res.json({ ok: true });
});

// Delete (owner only)
router.delete('/:id', loadList, requireOwner, (req, res) => {
  db.prepare('DELETE FROM shopping_lists WHERE id = ?').run(req.list.id);
  res.status(204).end();
});

// Set who the list is shared with (owner only)
router.put('/:id/members', loadList, requireOwner, (req, res) => {
  const ids = validUserIds(req.body?.user_ids);
  if (!ids) return res.status(400).json({ error: 'user_ids must be a list of existing users' });

  const sharedWith = ids.filter((id) => id !== req.user.id);
  transaction(() => {
    db.prepare('DELETE FROM list_members WHERE list_id = ?').run(req.list.id);
    const insert = db.prepare('INSERT INTO list_members (list_id, user_id) VALUES (?, ?)');
    for (const id of sharedWith) insert.run(req.list.id, id);
  });
  res.json({ ok: true });
});

// Give the list to someone else (owner only). The old owner stays as a member.
router.post('/:id/transfer', loadList, requireOwner, (req, res) => {
  const newOwner = Number(req.body?.user_id);
  if (!Number.isInteger(newOwner) || newOwner === req.user.id) {
    return res.status(400).json({ error: 'Pick another user' });
  }
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(newOwner)) {
    return res.status(404).json({ error: 'User not found' });
  }

  transaction(() => {
    db.prepare('UPDATE shopping_lists SET owner_id = ? WHERE id = ?').run(newOwner, req.list.id);
    db.prepare('DELETE FROM list_members WHERE list_id = ? AND user_id = ?').run(req.list.id, newOwner);
    db.prepare('INSERT OR IGNORE INTO list_members (list_id, user_id) VALUES (?, ?)')
      .run(req.list.id, req.user.id);
  });
  res.json({ ok: true });
});

// Remove yourself from a list someone shared with you
router.post('/:id/leave', loadList, (req, res) => {
  if (req.list.owner_id === req.user.id) {
    return res.status(400).json({ error: "Owners can't leave. Transfer or delete the list instead." });
  }
  if (req.list.household_id) {
    return res.status(400).json({ error: 'Household lists are managed by the admin' });
  }
  db.prepare('DELETE FROM list_members WHERE list_id = ? AND user_id = ?')
    .run(req.list.id, req.user.id);
  res.status(204).end();
});

// ---------- Items ----------

router.post('/:id/items', loadList, (req, res) => {
  const { name, amount } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  const cleanAmount = typeof amount === 'string' && amount.trim() ? amount.trim() : null;
  const r = db
    .prepare('INSERT INTO list_items (list_id, name, amount, added_by) VALUES (?, ?, ?, ?)')
    .run(req.list.id, name.trim(), cleanAmount, req.user.id);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

router.patch('/:id/items/:itemId', loadList, (req, res) => {
  const { checked } = req.body ?? {};
  if (typeof checked !== 'boolean') {
    return res.status(400).json({ error: 'checked must be true or false' });
  }
  const r = db
    .prepare('UPDATE list_items SET checked = ? WHERE id = ? AND list_id = ?')
    .run(checked ? 1 : 0, Number(req.params.itemId), req.list.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Item not found' });
  res.json({ ok: true });
});

router.delete('/:id/items/:itemId', loadList, (req, res) => {
  const r = db
    .prepare('DELETE FROM list_items WHERE id = ? AND list_id = ?')
    .run(Number(req.params.itemId), req.list.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Item not found' });
  res.status(204).end();
});

// Remove all checked items ("done shopping")
router.delete('/:id/checked', loadList, (req, res) => {
  db.prepare('DELETE FROM list_items WHERE list_id = ? AND checked = 1').run(req.list.id);
  res.status(204).end();
});

// Copy a recipe's ingredients onto this list, tagged with the recipe.
// Optional body { servings: 6, planned_date: "2026-11-14" }: servings scales the
// amounts (recipes are written for 4), both get shown on the items.
router.post('/:id/from-recipe/:recipeId', loadList, (req, res) => {
  const servings = req.body?.servings ?? BASE_SERVINGS;
  if (!isValidServings(servings)) {
    return res.status(400).json({ error: 'servings must be a whole number from 1 to 99' });
  }
  const plannedDate = req.body?.planned_date ?? null;
  if (plannedDate !== null && !isValidDate(plannedDate)) {
    return res.status(400).json({ error: 'planned_date must be YYYY-MM-DD or null' });
  }

  const recipe = db
    .prepare('SELECT id, name FROM recipes WHERE id = ?')
    .get(Number(req.params.recipeId));
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

  const ingredients = db
    .prepare('SELECT name, amount, amount_6, amount_8 FROM ingredients WHERE recipe_id = ? ORDER BY id')
    .all(recipe.id);
  const decimal = req.user.language === 'en' ? '.' : ',';

  const insert = db.prepare(`
    INSERT INTO list_items
      (list_id, name, amount, added_by, recipe_id, recipe_name, planned_date, servings)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  transaction(() => {
    for (const ing of ingredients) {
      insert.run(
        req.list.id,
        ing.name,
        amountFor(ing, servings, { decimal }),
        req.user.id,
        recipe.id,
        recipe.name,
        plannedDate,
        servings
      );
    }
  });
  res.status(201).json({ added: ingredients.length });
});

export default router;