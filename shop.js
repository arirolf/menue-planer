import express from 'express';
import { db, transaction } from './db.js';

// Item categories, stores with their own category order, and the remembered
// category per item name. Everything here is shared by all users, like recipes.
const router = express.Router();

// "  Tomaten " and "tomaten" share one remembered category
export function nameKey(name) {
  return name.trim().toLocaleLowerCase('de');
}

// name_key -> category_id for all remembered items
export function tagMap() {
  const rows = db.prepare('SELECT name_key, category_id FROM item_tags').all();
  return new Map(rows.map((r) => [r.name_key, r.category_id]));
}

// Remember (or with null forget) the category for an item name.
// Returns false if categoryId isn't null or an existing category.
export function setTag(name, categoryId) {
  const key = nameKey(name);
  if (!key) return false;
  if (categoryId === null) {
    db.prepare('DELETE FROM item_tags WHERE name_key = ?').run(key);
    return true;
  }
  if (!Number.isInteger(categoryId) || !db.prepare('SELECT id FROM item_categories WHERE id = ?').get(categoryId)) {
    return false;
  }
  db.prepare(`
    INSERT INTO item_tags (name_key, category_id) VALUES (?, ?)
    ON CONFLICT (name_key) DO UPDATE SET category_id = excluded.category_id
  `).run(key, categoryId);
  return true;
}

const MAX_NAME = 40;

function cleanName(value) {
  return typeof value === 'string' && value.trim() && value.trim().length <= MAX_NAME ? value.trim() : null;
}

// An emoji or other short symbol; empty = none
function cleanEmoji(value) {
  if (value === null || value === undefined || value === '') return { ok: true, value: null };
  if (typeof value !== 'string' || value.trim().length > 16) return { ok: false };
  return { ok: true, value: value.trim() || null };
}

// A list of ids that has to contain every category exactly once
function validOrder(ids) {
  const all = db.prepare('SELECT id FROM item_categories').all().map((c) => c.id);
  if (!Array.isArray(ids) || ids.length !== all.length || new Set(ids).size !== ids.length) return false;
  return ids.every((id) => all.includes(id));
}

function categories() {
  return db.prepare('SELECT id, key, name, emoji FROM item_categories ORDER BY position, id').all();
}

// Category ids in the store's order; categories added later go at the end
function storeOrder(storeId) {
  return db
    .prepare(`
      SELECT c.id FROM item_categories c
      LEFT JOIN store_category_order o ON o.category_id = c.id AND o.store_id = ?
      ORDER BY o.position IS NULL, o.position, c.position, c.id
    `)
    .all(storeId)
    .map((r) => r.id);
}

// Everything the list screen needs in one go
router.get('/shop', (req, res) => {
  const stores = db
    .prepare('SELECT id, name FROM stores ORDER BY name COLLATE NOCASE')
    .all()
    .map((s) => ({ ...s, order: storeOrder(s.id) }));
  // tags: remembered category per item name, so forms can show it while typing
  res.json({ categories: categories(), stores, tags: Object.fromEntries(tagMap()) });
});

// ---------- Categories ----------

router.post('/categories', (req, res) => {
  const name = cleanName(req.body?.name);
  const emoji = cleanEmoji(req.body?.emoji);
  if (!name) return res.status(400).json({ error: `Name is required (max ${MAX_NAME} characters)` });
  if (!emoji.ok) return res.status(400).json({ error: 'emoji must be a short text' });

  const position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM item_categories').get().p;
  const r = db
    .prepare('INSERT INTO item_categories (name, emoji, position) VALUES (?, ?, ?)')
    .run(name, emoji.value, position);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

// Default order (used when no store is picked)
router.put('/categories/order', (req, res) => {
  const ids = req.body?.ids;
  if (!validOrder(ids)) return res.status(400).json({ error: 'ids must list every category once' });
  const update = db.prepare('UPDATE item_categories SET position = ? WHERE id = ?');
  transaction(() => ids.forEach((id, i) => update.run(i, id)));
  res.json({ ok: true });
});

router.patch('/categories/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT id FROM item_categories WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Category not found' });
  }
  const name = cleanName(req.body?.name);
  const emoji = cleanEmoji(req.body?.emoji);
  if (!name) return res.status(400).json({ error: `Name is required (max ${MAX_NAME} characters)` });
  if (!emoji.ok) return res.status(400).json({ error: 'emoji must be a short text' });

  db.prepare('UPDATE item_categories SET name = ?, emoji = ? WHERE id = ?').run(name, emoji.value, id);
  res.json({ ok: true });
});

// Items tagged with it just become uncategorized again
router.delete('/categories/:id', (req, res) => {
  const r = db.prepare('DELETE FROM item_categories WHERE id = ?').run(Number(req.params.id));
  if (r.changes === 0) return res.status(404).json({ error: 'Category not found' });
  res.status(204).end();
});

// ---------- Stores ----------

router.post('/stores', (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: `Name is required (max ${MAX_NAME} characters)` });

  // A new store starts with the default order
  const id = transaction(() => {
    const r = db.prepare('INSERT INTO stores (name) VALUES (?)').run(name);
    const storeId = Number(r.lastInsertRowid);
    const insert = db.prepare('INSERT INTO store_category_order (store_id, category_id, position) VALUES (?, ?, ?)');
    categories().forEach((c, i) => insert.run(storeId, c.id, i));
    return storeId;
  });
  res.status(201).json({ id });
});

router.patch('/stores/:id', (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: `Name is required (max ${MAX_NAME} characters)` });
  const r = db.prepare('UPDATE stores SET name = ? WHERE id = ?').run(name, Number(req.params.id));
  if (r.changes === 0) return res.status(404).json({ error: 'Store not found' });
  res.json({ ok: true });
});

router.put('/stores/:id/order', (req, res) => {
  const storeId = Number(req.params.id);
  if (!db.prepare('SELECT id FROM stores WHERE id = ?').get(storeId)) {
    return res.status(404).json({ error: 'Store not found' });
  }
  const ids = req.body?.ids;
  if (!validOrder(ids)) return res.status(400).json({ error: 'ids must list every category once' });

  transaction(() => {
    db.prepare('DELETE FROM store_category_order WHERE store_id = ?').run(storeId);
    const insert = db.prepare('INSERT INTO store_category_order (store_id, category_id, position) VALUES (?, ?, ?)');
    ids.forEach((id, i) => insert.run(storeId, id, i));
  });
  res.json({ ok: true });
});

// Lists using it fall back to the default order
router.delete('/stores/:id', (req, res) => {
  const r = db.prepare('DELETE FROM stores WHERE id = ?').run(Number(req.params.id));
  if (r.changes === 0) return res.status(404).json({ error: 'Store not found' });
  res.status(204).end();
});

// ---------- Remembered category per item name ----------

// Body { name: "Tomaten", category_id: 3 }, category_id null forgets it
router.put('/item-tags', (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name : '';
  if (!nameKey(name)) return res.status(400).json({ error: 'Name is required' });
  if (!setTag(name, req.body?.category_id ?? null)) {
    return res.status(400).json({ error: 'category_id must be an existing category or null' });
  }
  res.json({ ok: true });
});

export default router;
