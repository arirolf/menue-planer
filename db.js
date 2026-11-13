import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const DB_PATH = process.env.DB_PATH || 'menu.db';
fs.mkdirSync(path.dirname(path.resolve(DB_PATH)), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');

// ---------- Base schema (fresh install) ----------
// A new, empty database gets schema.sql first; the migrations below build on it
const hasUsers = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
if (!hasUsers) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  db.exec(fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8'));
  console.log('Created a new database');
}

// Run several statements as one all-or-nothing block
export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ---------- Sessions ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  INTEGER NOT NULL
  );
`);

// ---------- Admin flag ----------
const userColumns = db.prepare('PRAGMA table_info(users)').all();
if (!userColumns.some((c) => c.name === 'is_admin')) {
  db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
}

// ---------- Households ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS households (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS household_members (
    household_id  INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (household_id, user_id)
  );
`);

// ---------- Shopping lists (rebuilt with household support) ----------
// Only rebuilds while the old tables are still empty, so no data can get lost.
const listColumns = db.prepare('PRAGMA table_info(shopping_lists)').all();
if (!listColumns.some((c) => c.name === 'household_id')) {
  if (listColumns.length > 0) {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM shopping_lists').get();
    if (n > 0) throw new Error('shopping_lists already has data, refusing to rebuild');
  }

  db.exec(`
    DROP TABLE IF EXISTS list_items;
    DROP TABLE IF EXISTS list_members;
    DROP TABLE IF EXISTS shopping_lists;

    CREATE TABLE shopping_lists (
      id            INTEGER PRIMARY KEY,
      name          TEXT NOT NULL,
      owner_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
      household_id  INTEGER UNIQUE REFERENCES households(id) ON DELETE CASCADE,
      created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK ((owner_id IS NULL) <> (household_id IS NULL))
    );

    CREATE TABLE list_members (
      list_id  INTEGER NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
      user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (list_id, user_id)
    );

    CREATE TABLE list_items (
      id        INTEGER PRIMARY KEY,
      list_id   INTEGER NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
      name      TEXT NOT NULL,
      amount    TEXT,
      checked   INTEGER NOT NULL DEFAULT 0 CHECK (checked IN (0, 1)),
      added_by  INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
  `);
}
// ---------- Calendars ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS calendars (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    household_id  INTEGER NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS meal_plans (
    id           INTEGER PRIMARY KEY,
    calendar_id  INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    date         TEXT NOT NULL,
    slot         TEXT NOT NULL CHECK (slot IN ('lunch', 'dinner')),
    recipe_id    INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
    title        TEXT,
    note         TEXT,
    created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (calendar_id, date, slot)
  );

  CREATE TABLE IF NOT EXISTS shopping_trips (
    id           INTEGER PRIMARY KEY,
    calendar_id  INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    date         TEXT NOT NULL,
    time         TEXT,
    list_id      INTEGER REFERENCES shopping_lists(id) ON DELETE SET NULL,
    note         TEXT,
    created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL
  );
`);
// ---------- Dislikes: who doesn't like which recipe ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS recipe_dislikes (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, recipe_id)
  );
`);

// ---------- Trace list items back to their recipe ----------
const itemColumns = db.prepare('PRAGMA table_info(list_items)').all();
if (!itemColumns.some((c) => c.name === 'recipe_id')) {
  db.exec(`
    ALTER TABLE list_items ADD COLUMN recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL;
    ALTER TABLE list_items ADD COLUMN recipe_name TEXT;
  `);
}

// ---------- Hand-typed ingredient amounts for 6 and 8 people ----------
// NULL = calculate from the 4-person amount (see shared/scale.js)
const ingredientColumns = db.prepare('PRAGMA table_info(ingredients)').all();
if (!ingredientColumns.some((c) => c.name === 'amount_6')) {
  db.exec(`
    ALTER TABLE ingredients ADD COLUMN amount_6 TEXT;
    ALTER TABLE ingredients ADD COLUMN amount_8 TEXT;
  `);
}

// ---------- When and for how many people ----------
// meal_plans.servings: people eating that meal. list_items: copied from the meal / recipe popup.
const mealColumns = db.prepare('PRAGMA table_info(meal_plans)').all();
if (!mealColumns.some((c) => c.name === 'servings')) {
  db.exec('ALTER TABLE meal_plans ADD COLUMN servings INTEGER NOT NULL DEFAULT 4');
}
const listItemColumns = db.prepare('PRAGMA table_info(list_items)').all();
if (!listItemColumns.some((c) => c.name === 'planned_date')) {
  db.exec(`
    ALTER TABLE list_items ADD COLUMN planned_date TEXT;
    ALTER TABLE list_items ADD COLUMN servings INTEGER;
  `);
}

// ---------- Personal colors (hex like "#ff6b35", NULL = default) ----------
if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'color_main')) {
  db.exec(`
    ALTER TABLE users ADD COLUMN color_main TEXT;
    ALTER TABLE users ADD COLUMN color_secondary TEXT;
  `);
}
// Phone status bar / browser bar. NULL = same as the main color.
if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'color_frame')) {
  db.exec('ALTER TABLE users ADD COLUMN color_frame TEXT');
}

// ---------- Difficulty 4 = "Sonntagsessen" (takes all day, special occasions) ----------
// SQLite can't change a CHECK constraint, so the recipes table gets rebuilt once.
// Foreign keys are off during the swap so ingredients, meals etc. keep pointing at the same ids.
const recipesSql =
  db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'recipes'").get()?.sql ?? '';
if (recipesSql.includes('difficulty BETWEEN 1 AND 3')) {
  const RECIPE_COLUMNS = ['id', 'name', 'time_range', 'difficulty', 'created_by', 'created_at'];
  const actual = db.prepare('PRAGMA table_info(recipes)').all().map((c) => c.name);
  if (actual.join() !== RECIPE_COLUMNS.join()) {
    throw new Error(`recipes has unexpected columns (${actual.join()}), refusing to rebuild`);
  }

  db.exec('PRAGMA foreign_keys = OFF');
  try {
    transaction(() => {
      db.exec(`
        CREATE TABLE recipes_new (
          id          INTEGER PRIMARY KEY,
          name        TEXT NOT NULL,
          time_range  INTEGER NOT NULL CHECK (time_range BETWEEN 1 AND 6),
          difficulty  INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 4),
          created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO recipes_new (${RECIPE_COLUMNS.join(', ')})
          SELECT ${RECIPE_COLUMNS.join(', ')} FROM recipes;
        DROP TABLE recipes;
        ALTER TABLE recipes_new RENAME TO recipes;
      `);
      if (db.prepare('PRAGMA foreign_key_check').all().length > 0) {
        throw new Error('Broken references after rebuilding recipes');
      }
    });
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

// ---------- Item categories, per-store order and pinned items ----------
// Categories are global like recipes. Default ones have a key (translated in the app)
// and name NULL until someone renames them. position = default order.
db.exec(`
  CREATE TABLE IF NOT EXISTS item_categories (
    id        INTEGER PRIMARY KEY,
    key       TEXT UNIQUE,
    name      TEXT,
    emoji     TEXT,
    position  INTEGER NOT NULL DEFAULT 0
  );

  -- Remembered category per item name, so "Tomaten" is sorted the same on every list.
  -- name_key is the trimmed, lowercased item name.
  CREATE TABLE IF NOT EXISTS item_tags (
    name_key     TEXT PRIMARY KEY,
    category_id  INTEGER NOT NULL REFERENCES item_categories(id) ON DELETE CASCADE
  );

  -- Stores with their own aisle order. Categories without a row go after the others.
  CREATE TABLE IF NOT EXISTS stores (
    id    INTEGER PRIMARY KEY,
    name  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS store_category_order (
    store_id     INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    category_id  INTEGER NOT NULL REFERENCES item_categories(id) ON DELETE CASCADE,
    position     INTEGER NOT NULL,
    PRIMARY KEY (store_id, category_id)
  );
`);
// Defaults only once: a later empty table means the user deleted them on purpose
if (db.prepare("SELECT COUNT(*) AS n FROM item_categories").get().n === 0
    && !db.prepare("PRAGMA table_info(list_items)").all().some((c) => c.name === 'pinned')) {
  const insert = db.prepare('INSERT INTO item_categories (key, emoji, position) VALUES (?, ?, ?)');
  [['vegetables', '🥦'], ['fruit', '🍎'], ['meat', '🥩'], ['dairy', '🧀'], ['grains', '🌾'], ['sauces', '🫙'], ['drinks', '🥤']]
    .forEach(([key, emoji], i) => insert.run(key, emoji, i));
}
if (!db.prepare('PRAGMA table_info(list_items)').all().some((c) => c.name === 'pinned')) {
  db.exec(`
    ALTER TABLE list_items ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1));
    ALTER TABLE shopping_lists ADD COLUMN store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL;
  `);
}

// ---------- Recipe notes and "checked" flag ----------
// notes: free text, e.g. which page of the cookbook. checked: someone went through the
// recipe and confirmed it's typed in right. Existing recipes start unchecked.
if (!db.prepare('PRAGMA table_info(recipes)').all().some((c) => c.name === 'notes')) {
  db.exec(`
    ALTER TABLE recipes ADD COLUMN notes TEXT;
    ALTER TABLE recipes ADD COLUMN checked INTEGER NOT NULL DEFAULT 0 CHECK (checked IN (0, 1));
  `);
}
