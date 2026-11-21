import express from 'express';
import { db, transaction } from './db.js';
import { requireAdmin } from './auth.js';
import { BASE_SERVINGS, amountFor, isValidServings } from './shared/scale.js';
import { ADD_WINDOW_DAYS, recordAdd, todayISO } from './recipeAdds.js';

const router = express.Router();
export const adminRouter = express.Router();

const SLOTS = ['lunch', 'dinner'];
const MEALS_PER_SLOT = 2;
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

// Notes can have several rows, one per line
function cleanNote(value) {
  if (typeof value !== 'string') return null;
  const text = value.split('\n').map((l) => l.trim()).filter(Boolean).join('\n').slice(0, 1000);
  return text || null;
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
  const note = cleanNote(body.note);
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

  return { trip: { date, time, listId, note: cleanNote(body.note) } };
}

// Each slot holds up to MEALS_PER_SLOT menus. Returns the first free position, or null when full.
function freePosition(calendarId, date, slot, exceptId = 0) {
  const taken = new Set(
    db
      .prepare('SELECT position FROM meal_plans WHERE calendar_id = ? AND date = ? AND slot = ? AND id != ?')
      .all(calendarId, date, slot, exceptId)
      .map((r) => r.position)
  );
  for (let p = 0; p < MEALS_PER_SLOT; p++) if (!taken.has(p)) return p;
  return null;
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
      SELECT m.id, m.date, m.slot, m.position, m.recipe_id, m.note, m.servings,
             COALESCE(r.name, m.title) AS title,
             r.time_range, r.difficulty
      FROM meal_plans m
      LEFT JOIN recipes r ON r.id = m.recipe_id
      WHERE m.calendar_id = ? AND m.date BETWEEN ? AND ?
      ORDER BY m.date, CASE m.slot WHEN 'lunch' THEN 0 ELSE 1 END, m.position
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
  const position = freePosition(req.calendar.id, meal.date, meal.slot);
  if (position === null) {
    return res.status(409).json({ error: 'This slot is already full' });
  }

  const r = db
    .prepare(`
      INSERT INTO meal_plans (calendar_id, date, slot, position, recipe_id, title, note, servings, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      req.calendar.id, meal.date, meal.slot, position, meal.recipeId,
      meal.title, meal.note, meal.servings, req.user.id
    );
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

// Edit or move a meal (send all fields)
router.put('/:id/meals/:mealId', loadCalendar, (req, res) => {
  const mealId = Number(req.params.mealId);
  const existing = db
    .prepare('SELECT id, date, slot, position FROM meal_plans WHERE id = ? AND calendar_id = ?')
    .get(mealId, req.calendar.id);
  if (!existing) return res.status(404).json({ error: 'Meal not found' });

  const { meal, error } = validateMeal(req.body);
  if (error) return res.status(400).json({ error });
  // Same day and slot keeps its place; a move takes the first free one there
  const position = existing.date === meal.date && existing.slot === meal.slot
    ? existing.position
    : freePosition(req.calendar.id, meal.date, meal.slot, mealId);
  if (position === null) {
    return res.status(409).json({ error: 'This slot is already full' });
  }

  db.prepare(`
    UPDATE meal_plans SET date = ?, slot = ?, position = ?, recipe_id = ?, title = ?, note = ?, servings = ?
    WHERE id = ?
  `).run(meal.date, meal.slot, position, meal.recipeId, meal.title, meal.note, meal.servings, mealId);
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

// ---------- Update a list with the meals of a date range ----------
// Every planned meal's ingredients go onto a list only once (tracked in list_recipe_adds),
// even after they were checked off and cleared. Existing list items are never changed.

// Validates list_id + from/to from a query or body; returns { error, status } or { listId, from, to }
function readListRange(req, source) {
  const range = readRange(source);
  if (range.error) return { error: range.error, status: 400 };
  const listId = Number(source?.list_id);
  if (!Number.isInteger(listId) || !canUseList(req.user.id, listId)) return { error: 'List not found', status: 404 };
  return { listId, ...range };
}

// Each meal with a recipe in the range, from today on (past meals are never added),
// with what an update would do:
//   status 'already' – this meal's ingredients are on the list (claim: an unlinked direct add
//                      of the same recipe, at most 14 days before the meal, gets linked to it)
//   status 'new'     – its ingredients get added (stale: tracking row of a recipe the meal had before)
function planListUpdate(calendarId, listId, from, to) {
  const meals = db
    .prepare(`
      SELECT m.id, m.date, m.slot, m.position, m.servings, m.recipe_id, r.name AS recipe_name
      FROM meal_plans m JOIN recipes r ON r.id = m.recipe_id
      WHERE m.calendar_id = ? AND m.date BETWEEN ? AND ? AND m.date >= ?
      ORDER BY m.date, CASE m.slot WHEN 'lunch' THEN 0 ELSE 1 END, m.position
    `)
    .all(calendarId, from, to, todayISO());
  const tracked = db.prepare('SELECT id, recipe_id FROM list_recipe_adds WHERE list_id = ? AND meal_plan_id = ?');
  const unlinked = db.prepare(`
    SELECT id FROM list_recipe_adds
    WHERE list_id = ? AND recipe_id = ? AND meal_plan_id IS NULL
      AND created_at >= date(?, '-${ADD_WINDOW_DAYS} days')
    ORDER BY created_at, id
  `);

  const claimed = new Set();
  return meals.map((meal) => {
    const row = tracked.get(listId, meal.id);
    // Same recipe as when it was added: done. A changed recipe counts as not added.
    if (row && row.recipe_id === meal.recipe_id) return { ...meal, status: 'already' };
    const stale = row?.id ?? null;
    const claim = unlinked.all(listId, meal.recipe_id, meal.date).find((r) => !claimed.has(r.id));
    if (claim) {
      claimed.add(claim.id);
      return { ...meal, status: 'already', claim: claim.id, stale };
    }
    return { ...meal, status: 'new', stale };
  });
}

// Read-only: what "update the list" would do for this range
router.get('/:id/to-list/preview', loadCalendar, (req, res) => {
  const input = readListRange(req, req.query);
  if (input.error) return res.status(input.status).json({ error: input.error });
  const meals = planListUpdate(req.calendar.id, input.listId, input.from, input.to);
  res.json({
    meals: meals.map(({ id, date, slot, position, recipe_id, recipe_name, servings, status }) => ({
      id, date, slot, position, recipe_id, recipe_name, servings, status,
    })),
  });
});

router.post('/:id/to-list', loadCalendar, (req, res) => {
  const input = readListRange(req, req.body);
  if (input.error) return res.status(input.status).json({ error: input.error });
  const decimal = req.user.language === 'en' ? '.' : ',';

  const ingredients = db.prepare('SELECT name, amount, amount_6, amount_8 FROM ingredients WHERE recipe_id = ? ORDER BY id');
  const insertItem = db.prepare(`
    INSERT INTO list_items
      (list_id, name, amount, added_by, recipe_id, recipe_name, planned_date, servings)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const dropRow = db.prepare('DELETE FROM list_recipe_adds WHERE id = ?');
  const claimRow = db.prepare('UPDATE list_recipe_adds SET meal_plan_id = ? WHERE id = ?');

  const result = transaction(() => {
    const counts = { added_meals: 0, skipped_meals: 0, added_items: 0 };
    for (const meal of planListUpdate(req.calendar.id, input.listId, input.from, input.to)) {
      // The meal's recipe changed since it was added: forget the old link (one row per meal)
      if (meal.stale) dropRow.run(meal.stale);
      if (meal.status === 'already') {
        if (meal.claim) claimRow.run(meal.id, meal.claim);
        counts.skipped_meals++;
        continue;
      }
      // Ingredients scaled to how many people eat that meal
      for (const ing of ingredients.all(meal.recipe_id)) {
        insertItem.run(
          input.listId, ing.name, amountFor(ing, meal.servings, { decimal }), req.user.id,
          meal.recipe_id, meal.recipe_name, meal.date, meal.servings
        );
        counts.added_items++;
      }
      recordAdd({ listId: input.listId, recipeId: meal.recipe_id, mealId: meal.id, userId: req.user.id });
      counts.added_meals++;
    }
    return counts;
  });
  res.json(result);
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