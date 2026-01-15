# Multi-stage Dockerfile for NestJS + Prisma backend (pnpm)

FROM node:20-alpine AS base
WORKDIR /app
# Prisma on Alpine needs openssl and libc compatibility
RUN apk add --no-cache openssl libc6-compat
# Enable pnpm via Corepack
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS deps
# Copy only dependency manifests first for better layer caching
COPY package.json pnpm-lock.yaml ./
COPY prisma/schema.prisma ./prisma/schema.prisma
# Install all dependencies (dev deps included, needed for build and prisma cli)
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
# Generate Prisma client and build the app
RUN pnpm prisma generate
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
# Copy node_modules with both prod+dev (to have prisma CLI available for db push)
COPY --from=deps /app/node_modules ./node_modules
# Copy build output and required project files
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma
COPY package.json pnpm-lock.yaml ./

EXPOSE 3000
# Run prisma generate/db push at container start then start the app
CMD ["sh", "-c", "pnpm prisma generate && pnpm prisma db push --accept-data-loss && node dist/main.js"]
