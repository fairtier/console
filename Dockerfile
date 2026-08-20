# Stage 1: Build
FROM oven/bun:1.3-slim AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

COPY . .
ENV NODE_ENV=production
RUN bun --env-file="" run build

# Stage 2: Runtime
FROM oven/bun:1.3-slim
WORKDIR /app

# Only copy what we need: the built assets and the server script
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts

# Set to production mode
ENV NODE_ENV=production

USER bun
EXPOSE 3000
CMD ["bun", "run", "server.ts"]
