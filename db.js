import { DatabaseSync } from 'node:sqlite';

export const db = new DatabaseSync(process.env.DB_PATH || 'menu.db');
db.exec('PRAGMA foreign_keys = ON');

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