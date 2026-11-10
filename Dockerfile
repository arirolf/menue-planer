# ---------- Stage 1: build the frontend ----------
FROM node:26-alpine AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY shared/ ../shared/
COPY web/ ./
RUN npm run build

# ---------- Stage 2: run the server ----------
FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV DB_PATH=/data/menu.db

# su-exec: the start script fixes /data permissions as root, then drops to "node"
RUN apk add --no-cache su-exec

COPY package*.json ./
RUN npm ci --omit=dev

COPY *.js schema.sql ./
COPY shared/ ./shared/
COPY --from=web /app/web/dist ./web/dist
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/

EXPOSE 4100
VOLUME /data
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]