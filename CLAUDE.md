# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A household meal planner ("Was kochen wir?"): recipes, random "what do we cook" picks, a shared meal/shopping calendar, and shopping lists. Express 5 + SQLite backend in the repo root, Svelte 5 + Vite SPA in `web/`. The UI is German and English.

## Commands

There are no tests, linter, or root build script.

```bash
# Backend (repo root) — uses built-in node:sqlite, no ORM
npm install
node server.js                      # serves API + web/dist on PORT (default 4100)
PORT=4102 node server.js            # port the Vite dev proxy expects

# Frontend (web/)
cd web && npm install
npm run dev                         # Vite on :4101, proxies /api -> localhost:4102
npm run build                       # outputs web/dist, which server.js serves statically

# Users (no sign-up; admins create users)
node create-user.js <username> [--admin] [--reset]   # prints a generated password

# Production
docker compose up -d --build        # port 4100 on 127.0.0.1, DB at ./data/menu.db
```

For local dev run the backend with `PORT=4102` and the Vite dev server together; the default port 4100 won't match the proxy.

## Database and migrations

- DB file comes from `DB_PATH` (default `./menu.db`; `/data/menu.db` in Docker). Both `menu.db` and `data/` are gitignored.
- `schema.sql` is the original base schema (users, recipes, ingredients, …) and is **not** applied by code — a fresh DB needs it loaded first (e.g. `sqlite3 menu.db < schema.sql`). It is also not copied into the Docker image.
- Every later schema change lives in `db.js` as idempotent startup migrations: `CREATE TABLE IF NOT EXISTS`, or `PRAGMA table_info` checks before `ALTER TABLE`. Add new migrations there in the same style, appended at the end. The `shopping_lists` rebuild refuses to run if the table already has data — don't write destructive migrations.
- Use `transaction(fn)` from `db.js` for multi-statement writes. Queries use synchronous `db.prepare(...).get/all/run`.
- SQLite booleans are stored as `0/1`; routes convert `is_admin` to a real boolean before sending JSON.

## Backend architecture

- `server.js`: app setup, login route, then `app.use('/api', requireAuth)` — **every `/api` route registered after that line requires a session**. Also holds recipe, user-admin and household-admin routes inline.
- `lists.js` and `calendars.js` are Express routers mounted at `/api/lists`, `/api/calendars`, and `/api/admin/calendars` (`adminRouter`, guarded by `requireAdmin`).
- `auth.js`: scrypt password hashes, session tokens stored as SHA-256 hashes in `sessions`, cookie `menu_session` (90 days), `requireAuth` (sets `req.user`) and `requireAdmin` middleware.
- Access model:
  - **Households** group users. Creating a household also creates its shared shopping list (`shopping_lists.household_id`, renamed together). A list has either `owner_id` (personal) or `household_id`, never both.
  - **Lists**: visible if you own it, are a `list_members` row, or are in its household. `loadList` middleware checks this; owner-only actions use `requireOwner`.
  - **Calendars**: one per household; only household members can access (`loadCalendar`). Meals are unique per `(calendar, date, slot)` with slot `lunch|dinner`; shopping trips can link to a list.
  - Recipes are global (any logged-in user can edit/delete). Every recipe is written for 4 people (`BASE_SERVINGS`). `ingredients.amount_6` / `amount_8` hold hand-typed amounts for 6/8 people; NULL means calculate from `amount`. Always go through `amountFor()` in `shared/scale.js`, which prefers the hand-typed value and otherwise scales the free-text amount ("300 g", "1,5 dl", "2-3"). Per-user dislikes in `recipe_dislikes` filter `/api/recipes/random` via `?eaters=`.
- Conventions: errors are `{ error: '...' }` JSON; inaccessible resources return 404 (not 403) so their existence isn't revealed. Static routes like `/api/recipes/random` must be registered before `/:id` routes.

## Shared code

`shared/` holds plain JS used by both the server and the web app (`import ... from '../../../shared/scale.js'` in `web/src/lib`). It must not import anything from either side. `vite.config.js` allows `..` for the dev server, and the Dockerfile copies `shared/` into both build stages; keep those in sync if you add files elsewhere.

## Frontend architecture

- No router: `web/src/App.svelte` checks `/api/auth/me`, then switches between tab components in `web/src/lib/` via a `page` state variable. Admin tab shows only for `is_admin` users.
- Svelte 5 runes (`$state`, `$derived`, `$props`), plain `fetch('/api/...')` calls in each component — no shared API client or store.
- **All UI text goes through `t('key', { params })`** from `lib/i18n.svelte.js`. Texts live in `lib/messages.js`, German and English side by side per key; never hardcode UI strings in components. `t()` reads reactive state, so call it in markup or `$derived` (not in a plain top-level `const`) or the text won't switch with the language. Values can be arrays (weekdays, months, difficulty labels).
- The language comes from `users.language` (changed via `PATCH /api/auth/me` from the settings page) and is mirrored to `localStorage` so the login screen uses the last one. Server error messages are English and not translated.
- `lib/dates.js` exposes `weekdays()`, `months()`, `slotLabel()`, `dayMonth()` as functions for the same reason; use `locale()` from i18n for `toLocale*` calls.
- `lib/constants.js` holds the time labels for recipe `time_range` (1–6); difficulty (1–3) labels are `t('recipe.difficulty')`. Both ranges must match the DB CHECK constraints.
- `lib/pdf.js` builds the week PDF export with jsPDF; `lib/dates.js` has date helpers.
- `public/index.html` in the repo root is an old standalone page and is not served; the app is `web/dist`.
