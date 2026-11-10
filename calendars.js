import express from 'express';
import { db, transaction } from './db.js';
import { requireAdmin } from './auth.js';
import { BASE_SERVINGS, amountFor, isValidServings } from './shared/scale.js';

const router = express.Router();
export const adminRouter = express.Router();

const SLOTS = ['lunch', 'dinner'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_RANGE_DAYS = 62;

// ---------- Helpers ----------

// Accepts only real dates: "2026-02-30" gets rejected
export function isValidDate(text) {
  if (typeof text !== 'string' || !DATE_PATTERN.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(text);
}

function daysBetween(from, to) {
  return (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000;
}

// Validates ?from=...&to=... or the same fields in a body
function readRange(source) {
  const { from, to } = source ?? {};
  if (!isValidDate(from) || !isValidDate(to)) return { error: 'from and to must be YYYY-MM-DD' };
  const days = daysBetween(from, to);
  if (days < 0) return { error: 'from must be before to' };
  if (days > MAX_RANGE_DAYS) return { error: `Range can be at most ${MAX_RANGE_DAYS} days` };
  return { from, to };
}

function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  const text = value.trim().slice(0, max);
  return text || null;
}

// Same rule as in lists.js: owner, shared with, or household member
function canUseList(userId, listId) {
  return Boolean(
    db
      .prepare(`
        SELECT 1 FROM shopping_lists l
        WHERE l.id = ? AND (
          l.owner_id = ?
          OR EXISTS (SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = ?)
          OR EXISTS (SELECT 1 FROM household_members hm
                     WHERE hm.household_id = l.household_id AND hm.user_id = ?)
        )
      `)
      .get(listId, userId, userId, userId)
  );
}

function validateMeal(body) {
  const { date, slot } = body ?? {};
  if (!isValidDate(date)) return { error: 'date must be YYYY-MM-DD' };
  if (!SLOTS.includes(slot)) return { error: 'slot must be lunch or dinner' };

  let recipe = null;
  if (body.recipe_id !== undefined && body.recipe_id !== null) {
    recipe = db.prepare('SELECT id, name FROM recipes WHERE id = ?').get(Number(body.recipe_id));
    if (!recipe) return { error: 'Recipe not found' };
  }

  // Remember the recipe name too, so the entry survives if the recipe gets deleted
  const title = cleanText(body.title, 100) ?? recipe?.name ?? null;
  const note = cleanText(body.note, 300);
  if (!recipe && !title && !note) {
    return { error: 'Pick a recipe, write a title or add a note' };
  }
  const servings = body.servings ?? BASE_SERVINGS;
  if (!isValidServings(servings)) return { error: 'servings must be a whole number from 1 to 99' };
  return { meal: { date, slot, recipeId: recipe?.id ?? null, title, note, servings } };
}

function validateTrip(body, userId) {
  const { date } = body ?? {};
  if (!isValidDate(date)) return { error: 'date must be YYYY-MM-DD' };

  let time = null;
  if (body.time) {
    if (typeof body.time !== 'string' || !TIME_PATTERN.test(body.time)) {
      return { error: 'time must be HH:MM' };
    }
    time = body.time;
  }

  let listId = null;
  if (body.list_id !== undefined && body.list_id !== null) {
    listId = Number(body.list_id);
    if (!Number.isInteger(listId) || !canUseList(userId, listId)) {
      return { error: 'List not found' };
    }
  }

  return { trip: { date, time, listId, note: cleanText(body.note, 300) } };
}

function slotTaken(calendarId, date, slot, exceptId = 0) {
  return Boolean(
    db
      .prepare('SELECT id FROM meal_plans WHERE calendar_id = ? AND date = ? AND slot = ? AND id != ?')
      .get(calendarId, date, slot, exceptId)
  );
}

// Middleware: only household members get in
function loadCalendar(req, res, next) {
  const calendar = db
    .prepare(`
      SELECT c.id, c.name, c.household_id, h.name AS household_name
      FROM calendars c
      JOIN households h ON h.id = c.household_id
      JOIN household_members hm ON hm.household_id = c.household_id
      WHERE c.id = ? AND hm.user_id = ?
    `)
    .get(Number(req.params.id), req.user.id);

  if (!calendar) return res.status(404).json({ error: 'Calendar not found' });
  req.calendar = calendar;
  next();
}

// ---------- Calendars I can see ----------

router.get('/', (req, res) => {
  const calendars = db
    .prepare(`
      SELECT c.id, c.name, c.household_id, h.name AS household_name
      FROM calendars c
      JOIN households h ON h.id = c.household_id
      JOIN household_members hm ON hm.household_id = c.household_id
      WHERE hm.user_id = ?
      ORDER BY c.name COLLATE NOCASE
    `)
    .all(req.user.id);
  res.json(calendars);
});

// Everything in a date range: meals + shopping trips
router.get('/:id/entries', loadCalendar, (req, res) => {
  const range = readRange(req.query);
  if (range.error) return res.status(400).json({ error: range.error });

  const meals = db
    .prepare(`
      SELECT m.id, m.date, m.slot, m.recipe_id, m.note, m.servings,
             COALESCE(r.name, m.title) AS title,
             r.time_range, r.difficulty
      FROM meal_plans m
      LEFT JOIN recipes r ON r.id = m.recipe_id
      WHERE m.calendar_id = ? AND m.date BETWEEN ? AND ?
      ORDER BY m.date, CASE m.slot WHEN 'lunch' THEN 0 ELSE 1 END
    `)
    .all(req.calendar.id, range.from, range.to);

  const trips = db
    .prepare(`
      SELECT t.id, t.date, t.time, t.note, t.list_id, l.name AS list_name
      FROM shopping_trips t
      LEFT JOIN shopping_lists l ON l.id = t.list_id
      WHERE t.calendar_id = ? AND t.date BETWEEN ? AND ?
      ORDER BY t.date, t.time IS NULL, t.time
    `)
    .all(req.calendar.id, range.from, range.to);

  res.json({ calendar: req.calendar, meals, trips });
});

// ---------- Meals ----------

router.post('/:id/meals', loadCalendar, (req, res) => {
  const { meal, error } = validateMeal(req.body);
  if (error) return res.status(400).json({ error });
  if (slotTaken(req.calendar.id, meal.date, meal.slot)) {
    return res.status(409).json({ error: 'This slot is already planned' });
  }

  const r = db
    .prepare(`
      INSERT INTO meal_plans (calendar_id, date, slot, recipe_id, title, note, servings, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      req.calendar.id, meal.date, meal.slot, meal.recipeId,
      meal.title, meal.note, meal.servings, req.user.id
    );
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

// Edit or move a meal (send all fields)
router.put('/:id/meals/:mealId', loadCalendar, (req, res) => {
  const mealId = Number(req.params.mealId);
  const exists = db
    .prepare('SELECT id FROM meal_plans WHERE id = ? AND calendar_id = ?')
    .get(mealId, req.calendar.id);
  if (!exists) return res.status(404).json({ error: 'Meal not found' });

  const { meal, error } = validateMeal(req.body);
  if (error) return res.status(400).json({ error });
  if (slotTaken(req.calendar.id, meal.date, meal.slot, mealId)) {
    return res.status(409).json({ error: 'This slot is already planned' });
  }

  db.prepare(`
    UPDATE meal_plans SET date = ?, slot = ?, recipe_id = ?, title = ?, note = ?, servings = ?
    WHERE id = ?
  `).run(meal.date, meal.slot, meal.recipeId, meal.title, meal.note, meal.servings, mealId);
  res.json({ ok: true });
});

router.delete('/:id/meals/:mealId', loadCalendar, (req, res) => {
  const r = db
    .prepare('DELETE FROM meal_plans WHERE id = ? AND calendar_id = ?')
    .run(Number(req.params.mealId), req.calendar.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Meal not found' });
  res.status(204).end();
});

// ---------- Shopping trips ----------

router.post('/:id/trips', loadCalendar, (req, res) => {
  const { trip, error } = validateTrip(req.body, req.user.id);
  if (error) return res.status(400).json({ error });

  const r = db
    .prepare(`
      INSERT INTO shopping_trips (calendar_id, date, time, list_id, note, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(req.calendar.id, trip.date, trip.time, trip.listId, trip.note, req.user.id);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

router.put('/:id/trips/:tripId', loadCalendar, (req, res) => {
  const { trip, error } = validateTrip(req.body, req.user.id);
  if (error) return res.status(400).json({ error });

  const r = db
    .prepare(`
      UPDATE shopping_trips SET date = ?, time = ?, list_id = ?, note = ?
      WHERE id = ? AND calendar_id = ?
    `)
    .run(trip.date, trip.time, trip.listId, trip.note, Number(req.params.tripId), req.calendar.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Trip not found' });
  res.json({ ok: true });
});

router.delete('/:id/trips/:tripId', loadCalendar, (req, res) => {
  const r = db
    .prepare('DELETE FROM shopping_trips WHERE id = ? AND calendar_id = ?')
    .run(Number(req.params.tripId), req.calendar.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Trip not found' });
  res.status(204).end();
});

// ---------- All ingredients of a date range onto a list ----------

router.post('/:id/to-list', loadCalendar, (req, res) => {
  const range = readRange(req.body);
  if (range.error) return res.status(400).json({ error: range.error });

  const listId = Number(req.body?.list_id);
  if (!Number.isInteger(listId) || !canUseList(req.user.id, listId)) {
    return res.status(404).json({ error: 'List not found' });
  }

  // Each meal's ingredients, scaled to how many people eat that meal
  const rows = db
    .prepare(`
      SELECT i.name, i.amount, i.amount_6, i.amount_8,
             r.id AS recipe_id, r.name AS recipe_name, m.date, m.servings
      FROM meal_plans m
      JOIN recipes r ON r.id = m.recipe_id
      JOIN ingredients i ON i.recipe_id = r.id
      WHERE m.calendar_id = ? AND m.date BETWEEN ? AND ?
      ORDER BY m.date, CASE m.slot WHEN 'lunch' THEN 0 ELSE 1 END, i.id
    `)
    .all(req.calendar.id, range.from, range.to);
  const decimal = req.user.language === 'en' ? '.' : ',';

  const insert = db.prepare(`
    INSERT INTO list_items
      (list_id, name, amount, added_by, recipe_id, recipe_name, planned_date, servings)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  transaction(() => {
    for (const row of rows) {
      insert.run(
        listId, row.name, amountFor(row, row.servings, { decimal }), req.user.id,
        row.recipe_id, row.recipe_name, row.date, row.servings
      );
    }
  });
  res.status(201).json({ added: rows.length });
});

// ---------- Admin: create and manage calendars ----------

adminRouter.use(requireAdmin);

adminRouter.get('/', (req, res) => {
  const calendars = db
    .prepare(`
      SELECT c.id, c.name, c.household_id, h.name AS household_name
      FROM calendars c JOIN households h ON h.id = c.household_id
      ORDER BY c.name COLLATE NOCASE
    `)
    .all();
  res.json(calendars);
});

adminRouter.post('/', (req, res) => {
  const householdId = Number(req.body?.household_id);
  const household = db.prepare('SELECT id, name FROM households WHERE id = ?').get(householdId);
  if (!household) return res.status(404).json({ error: 'Household not found' });

  if (db.prepare('SELECT id FROM calendars WHERE household_id = ?').get(householdId)) {
    return res.status(409).json({ error: 'This household already has a calendar' });
  }

  const name = cleanText(req.body?.name, 100) ?? household.name;
  const r = db
    .prepare('INSERT INTO calendars (name, household_id) VALUES (?, ?)')
    .run(name, householdId);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

adminRouter.patch('/:id', (req, res) => {
  const name = cleanText(req.body?.name, 100);
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const r = db.prepare('UPDATE calendars SET name = ? WHERE id = ?').run(name, Number(req.params.id));
  if (r.changes === 0) return res.status(404).json({ error: 'Calendar not found' });
  res.json({ ok: true });
});

adminRouter.delete('/:id', (req, res) => {
  const r = db.prepare('DELETE FROM calendars WHERE id = ?').run(Number(req.params.id));
  if (r.changes === 0) return res.status(404).json({ error: 'Calendar not found' });
  res.status(204).end();
});

export default router;