# NOTE: the build context is the repo ROOT (see docker-compose.yml: context: .),
# so source paths below are prefixed with backend/ and db/ is available to bake in.

# ── Build stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY backend/package.json backend/package-lock.json* ./
RUN npm install

COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

# Prune dev dependencies for the runtime image
RUN npm prune --omit=dev

# ── Runtime stage ───────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

# Bake in the idempotent migration runner + ordered SQL so `node db/migrate.mjs`
# (invoked by the backend service command in docker-compose.yml) runs on every
# deploy and converges the schema. db/ is read straight from the repo-root context.
COPY db ./db

EXPOSE 8080
CMD ["node", "dist/index.js"]
