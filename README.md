# Was kochen wir? 🍽️

A self-hosted meal planner for households: collect your recipes, let the app pick
"what do we cook today?", plan meals in a shared calendar and keep shared shopping lists.
The interface is in German and English.

*Ein selbst gehosteter Menüplaner für Familien und WGs: Rezepte, Zufallsvorschläge,
gemeinsamer Kalender und Einkaufslisten. Oberfläche auf Deutsch und Englisch.*

## Features

- **Recipes** with ingredients, cooking time, effort and notes (e.g. the cookbook page).
  Amounts scale automatically for 4, 6, 8 or any number of people, and you can type
  exact amounts by hand.
- **Random picks** filtered by time and effort, and by who is eating (everyone can mark
  dishes they don't like).
- **Calendar** per household for lunch and dinner, shopping trips and notes, with a
  printable PDF for one week, two weeks or a month.
- **Shopping lists**: one shared list per household, plus personal lists you can share.
  Add a recipe's or a whole week's ingredients with one tap, adjust single
  amounts with +/− before adding them, and tap 🏠 on what you already have at home.
- **Sorted like your store**: tag items with a category (vegetables, fruit, meat,
  cheese & dairy, bread, drinks, or your own) and the list groups them in the order you walk through
  the store. Save a different order per store, filter by category, and pin items to
  the top. Each item name remembers its category, and you can set it right in the
  recipe, so ingredients arrive on the list already sorted.
- **Installable** on phones as an app (PWA), with your own colors.
- **Simple accounts**: no sign-up. An admin creates users and households.

## Install with Docker

You need [Docker](https://docs.docker.com/get-docker/) with Docker Compose.

```bash
git clone https://github.com/arirolf/menue-planer.git
cd menue-planer
docker compose up -d --build
docker compose logs menu-app
```

On the first start the logs show the login for the admin account:

```
First start: created admin "admin"
Password: Xy7…
```

Open the app, log in, and use the **Admin** tab to:

1. create users (each gets a generated password to pass on),
2. create a household and add its members (this also creates its shared shopping list),
3. create a calendar for the household.

All data is stored in one SQLite file, `./data/menu.db`.

### Opening the app

By default the app only listens on the machine itself, at `http://127.0.0.1:4100`.
This is meant for a reverse proxy in front of it. Choose one of these:

- **From your home network:** in `docker-compose.yml`, change the port line to
  `"4100:4100"`, run `docker compose up -d`, and open `http://<server-ip>:4100`.
- **From the internet (recommended way):** put a reverse proxy with HTTPS in front,
  for example [Caddy](https://caddyserver.com/), Nginx Proxy Manager or a Cloudflare
  Tunnel, and point it to `127.0.0.1:4100`. Proxies on the same machine or Docker
  network are trusted automatically, so login cookies are marked secure over HTTPS.

Don't open port 4100 directly to the internet without HTTPS: passwords would be sent
unencrypted.

## Configuration

Set these under `environment:` in `docker-compose.yml`:

| Variable | Default | What it does |
| --- | --- | --- |
| `ADMIN_USERNAME` | `admin` | Name of the admin created on the very first start |
| `ADMIN_PASSWORD` | random | Password for that admin (otherwise one is generated and printed in the logs) |
| `PORT` | `4100` | Port inside the container |
| `RECIPE_CHECKS` | off | `1` flags recipes nobody has checked yet ⚠️ (set it in a `.env` file next to `docker-compose.yml`) |
| `TRUST_PROXY` | private networks | Which reverse proxies to trust, in [Express format](https://expressjs.com/en/guide/behind-proxies.html) |

`ADMIN_USERNAME` and `ADMIN_PASSWORD` are only used while the database has no users yet.

## Everyday tasks

```bash
# Update to the latest version
git pull
docker compose up -d --build

# Backup: copy the database file (best while the app is stopped)
docker compose stop
cp data/menu.db menu-backup-$(date +%F).db
docker compose start

# Forgot the admin password? Set a new one:
docker compose exec -u node menu-app node create-user.js admin --reset

# Create a user from the command line
docker compose exec -u node menu-app node create-user.js <name> [--admin]
```

Admins can also reset passwords and delete users in the Admin tab.

## Development

Requires Node.js 24 or newer (the app uses the built-in `node:sqlite`).

```bash
npm install
PORT=4102 node server.js        # API on :4102, creates ./menu.db on first start

cd web
npm install
npm run dev                     # app on http://localhost:4101, proxies /api to :4102
```

`npm run build` in `web/` creates `web/dist`, which `server.js` serves directly.
See [`CLAUDE.md`](CLAUDE.md) for how the code is organized.

## Status and AI notice

🚧 **Work in progress.** This app is far from finished: features are still missing, things may change or break, and the database layout can still change between versions.

🤖 **Built with AI.** This app was created with the help of AI (Claude by Anthropic).
