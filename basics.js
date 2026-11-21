import express from 'express';
import { db, transaction } from './db.js';
import { nameKey, setTag, tagMap } from './shop.js';

// Basics: a per-household catalogue of things bought regularly (milk, bread …),
// optionally with a barcode. Every member of the household shares the same Basics.
const router = express.Router();

const MAX_NAME = 100;
const MAX_AMOUNT = 30;
export const BARCODE = /^\d{6,14}$/;

// ---------- Helpers ----------

function isMember(householdId, userId) {
  return Boolean(
    db.prepare('SELECT 1 FROM household_members WHERE household_id = ? AND user_id = ?').get(householdId, userId)
  );
}

// The Basic if the user is in its household, otherwise null
export function basicForUser(basicId, userId) {
  return (
    db
      .prepare(`
        SELECT b.* FROM basics b
        JOIN household_members hm ON hm.household_id = b.household_id AND hm.user_id = ?
        WHERE b.id = ?
      `)
      .get(userId, basicId) ?? null
  );
}

// Middleware: household from :id, 404 if the user isn't a member
function loadHousehold(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !isMember(id, req.user.id)) {
    return res.status(404).json({ error: 'Household not found' });
  }
  req.householdId = id;
  next();
}

// Checks { name, default_amount, barcode }; returns { error } or { value }
function validateBasic(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > MAX_NAME) return { error: `Name is required (max ${MAX_NAME} characters)` };

  const amount = body.default_amount ?? null;
  if (amount !== null && (typeof amount !== 'string' || amount.trim().length > MAX_AMOUNT)) {
    return { error: `default_amount must be text (max ${MAX_AMOUNT} characters)` };
  }

  const barcode = body.barcode ?? null;
  const cleanBarcode = typeof barcode === 'string' && barcode.trim() ? barcode.trim() : null;
  if (barcode !== null && typeof barcode !== 'string') return { error: 'barcode must be text' };
  if (cleanBarcode !== null && !BARCODE.test(cleanBarcode)) return { error: 'barcode must be 6-14 digits' };

  // Optional category, remembered per item name like everywhere else
  // (undefined = leave the remembered one alone, null = forget it)
  const cat = body.category_id;
  if (cat !== undefined && cat !== null
      && (!Number.isInteger(cat) || !db.prepare('SELECT id FROM item_categories WHERE id = ?').get(cat))) {
    return { error: 'category_id must be an existing category or null' };
  }

  return { value: { name, default_amount: amount?.trim() || null, barcode: cleanBarcode, category_id: cat } };
}

function barcodeTaken(householdId, barcode, exceptId = null) {
  if (barcode === null) return false;
  return Boolean(
    db
      .prepare('SELECT 1 FROM basics WHERE household_id = ? AND barcode = ? AND id IS NOT ?')
      .get(householdId, barcode, exceptId)
  );
}

const isUniqueError = (err) => /UNIQUE/i.test(err?.message ?? '');

// ---------- Routes ----------

// Households I'm a member of
router.get('/households', (req, res) => {
  res.json(
    db
      .prepare(`
        SELECT h.id, h.name FROM households h
        JOIN household_members hm ON hm.household_id = h.id
        WHERE hm.user_id = ? ORDER BY h.name COLLATE NOCASE
      `)
      .all(req.user.id)
  );
});

// category_id comes from the remembered category for the name
function withCategory(basics) {
  const tags = tagMap();
  return basics.map((b) => ({ ...b, category_id: tags.get(nameKey(b.name)) ?? null }));
}

// Most used first
router.get('/households/:id/basics', loadHousehold, (req, res) => {
  res.json(
    withCategory(
      db
        .prepare(`
          SELECT id, name, default_amount, barcode, times_added FROM basics
          WHERE household_id = ? ORDER BY times_added DESC, name COLLATE NOCASE
        `)
        .all(req.householdId)
    )
  );
});

router.get('/households/:id/basics/by-barcode/:code', loadHousehold, (req, res) => {
  const basic = db
    .prepare('SELECT id, name, default_amount, barcode, times_added FROM basics WHERE household_id = ? AND barcode = ?')
    .get(req.householdId, req.params.code);
  if (!basic) return res.status(404).json({ error: 'Basic not found' });
  res.json(withCategory([basic])[0]);
});

router.post('/households/:id/basics', loadHousehold, (req, res) => {
  const { error, value } = validateBasic(req.body);
  if (error) return res.status(400).json({ error });
  if (barcodeTaken(req.householdId, value.barcode)) {
    return res.status(409).json({ error: 'This barcode is already a Basic' });
  }
  try {
    const id = transaction(() => {
      const r = db
        .prepare('INSERT INTO basics (household_id, name, default_amount, barcode, created_by) VALUES (?, ?, ?, ?, ?)')
        .run(req.householdId, value.name, value.default_amount, value.barcode, req.user.id);
      if (value.category_id !== undefined) setTag(value.name, value.category_id);
      return Number(r.lastInsertRowid);
    });
    res.status(201).json({ id });
  } catch (err) {
    // Two scans at the same moment
    if (isUniqueError(err)) return res.status(409).json({ error: 'This barcode is already a Basic' });
    throw err;
  }
});

router.put('/basics/:id', (req, res) => {
  const basic = basicForUser(Number(req.params.id), req.user.id);
  if (!basic) return res.status(404).json({ error: 'Basic not found' });
  const { error, value } = validateBasic(req.body);
  if (error) return res.status(400).json({ error });
  if (barcodeTaken(basic.household_id, value.barcode, basic.id)) {
    return res.status(409).json({ error: 'This barcode is already a Basic' });
  }
  try {
    transaction(() => {
      db.prepare('UPDATE basics SET name = ?, default_amount = ?, barcode = ? WHERE id = ?')
        .run(value.name, value.default_amount, value.barcode, basic.id);
      if (value.category_id !== undefined) setTag(value.name, value.category_id);
    });
    res.json({ ok: true });
  } catch (err) {
    if (isUniqueError(err)) return res.status(409).json({ error: 'This barcode is already a Basic' });
    throw err;
  }
});

// List items keep their text; their basic_id becomes NULL
router.delete('/basics/:id', (req, res) => {
  const basic = basicForUser(Number(req.params.id), req.user.id);
  if (!basic) return res.status(404).json({ error: 'Basic not found' });
  db.prepare('DELETE FROM basics WHERE id = ?').run(basic.id);
  res.status(204).end();
});

// ---------- Product name lookup (Open Food Facts) ----------

// Only successful lookups are cached, so an outage doesn't stick
const productCache = new Map();
const CACHE_SIZE = 500;

async function lookupProduct(code) {
  if (productCache.has(code)) return productCache.get(code);
  const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json`
    + '?fields=product_name,product_name_de,brands,quantity';
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MenuApp/1.0 (family app)' },
    signal: AbortSignal.timeout(4000),
  });
  // OFF answers 404 for unknown products
  if (res.status === 404) return { name: null, brand: null, amount: null };
  if (!res.ok) throw new Error(`Open Food Facts answered ${res.status}`);
  const p = (await res.json())?.product ?? {};
  const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const result = {
    name: text(p.product_name_de) ?? text(p.product_name),
    brand: text(p.brands?.split(',')[0]),
    amount: text(p.quantity),
  };
  if (productCache.size >= CACHE_SIZE) productCache.delete(productCache.keys().next().value);
  productCache.set(code, result);
  return result;
}

// Never fails the scan flow: unknown product or any error = nulls
router.get('/barcode/:code', async (req, res) => {
  const empty = { name: null, brand: null, amount: null };
  if (!BARCODE.test(req.params.code)) return res.json(empty);
  try {
    res.json(await lookupProduct(req.params.code));
  } catch {
    res.json(empty);
  }
});

export default router;
