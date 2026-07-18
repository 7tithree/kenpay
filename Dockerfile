# ---- deps ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# prisma generate needs the schema; DATABASE_URL is not required at build time
RUN npx prisma generate && npm run build

# ---- run ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user
RUN addgroup -S kenpay && adduser -S kenpay -G kenpay

# Standalone server + static assets
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Prisma 7 runs engine-less via the pg driver adapter (bundled by Next), so no
# query-engine binary is copied. Schema/migrations ship for reference only;
# run `prisma migrate deploy` from CI or a workstation, not from this image.
COPY --from=build /app/prisma ./prisma

USER kenpay
EXPOSE 3000
CMD ["node", "server.js"]
