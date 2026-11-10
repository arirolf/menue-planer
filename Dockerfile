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

COPY package*.json ./
RUN npm ci --omit=dev

COPY *.js ./
COPY shared/ ./shared/
COPY --from=web /app/web/dist ./web/dist

USER node
EXPOSE 4100
CMD ["node", "server.js"]