PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  language      TEXT NOT NULL DEFAULT 'de' CHECK (language IN ('de', 'en')),
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE recipes (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  time_range  INTEGER NOT NULL CHECK (time_range BETWEEN 1 AND 6),
  difficulty  INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 4),
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ingredients (
  id         INTEGER PRIMARY KEY,
  recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  amount     TEXT
);

CREATE TABLE shopping_lists (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  owner_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
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
