#!/bin/sh
set -e

# Docker creates a missing ./data folder as root. Hand it to the "node" user,
# then run the app as that user instead of root.
if [ "$(id -u)" = "0" ]; then
  dir="$(dirname "$DB_PATH")"
  mkdir -p "$dir"
  find "$dir" -maxdepth 1 \( -path "$dir" -o -name "$(basename "$DB_PATH")*" \) ! -user node -exec chown node:node {} +
  exec su-exec node "$@"
fi

exec "$@"
