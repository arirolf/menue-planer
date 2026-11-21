import { db } from './db.js';

// Remembers which recipes / planned meals already went onto which list
// (table list_recipe_adds), so adding again or "update the list" doesn't duplicate them.

// A direct add counts as "already on the list" for this many days, and can be
// claimed by a planned meal up to this many days later
export const ADD_WINDOW_DAYS = 14;

// Today as YYYY-MM-DD in the server's time zone (meal dates have no time zone)
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const SLOT_ORDER = "CASE m.slot WHEN 'lunch' THEN 0 ELSE 1 END";

// A planned meal of this recipe that the list doesn't cover yet, in a calendar of one of
// the user's households. With a date: a meal on that day; otherwise the earliest one
// from today up to ADD_WINDOW_DAYS ahead. Returns { id, date } or null.
export function findMealToClaim({ listId, recipeId, userId, date = null }) {
  const base = `
    SELECT m.id, m.date FROM meal_plans m
    JOIN calendars c ON c.id = m.calendar_id
    JOIN household_members hm ON hm.household_id = c.household_id AND hm.user_id = ?
    WHERE m.recipe_id = ?
      AND NOT EXISTS (SELECT 1 FROM list_recipe_adds a WHERE a.list_id = ? AND a.meal_plan_id = m.id)
  `;
  const order = `ORDER BY m.date, ${SLOT_ORDER}, m.position LIMIT 1`;
  if (date) {
    const onDay = db.prepare(`${base} AND m.date = ? ${order}`).get(userId, recipeId, listId, date);
    if (onDay) return onDay;
  }
  const today = todayISO();
  return (
    db
      .prepare(`${base} AND m.date BETWEEN ? AND date(?, '+${ADD_WINDOW_DAYS} days') ${order}`)
      .get(userId, recipeId, listId, today, today) ?? null
  );
}

// The latest add of this recipe to this list in the last ADD_WINDOW_DAYS, with the date of
// the meal it covers (if linked), or null
export function recentAdd(listId, recipeId) {
  return (
    db
      .prepare(`
        SELECT a.id, m.date AS meal_date FROM list_recipe_adds a
        LEFT JOIN meal_plans m ON m.id = a.meal_plan_id
        WHERE a.list_id = ? AND a.recipe_id = ? AND a.created_at >= datetime('now', '-${ADD_WINDOW_DAYS} days')
        ORDER BY a.created_at DESC, a.id DESC LIMIT 1
      `)
      .get(listId, recipeId) ?? null
  );
}

export function recordAdd({ listId, recipeId, mealId = null, userId }) {
  db.prepare('INSERT INTO list_recipe_adds (list_id, recipe_id, meal_plan_id, created_by) VALUES (?, ?, ?, ?)')
    .run(listId, recipeId, mealId, userId);
}
