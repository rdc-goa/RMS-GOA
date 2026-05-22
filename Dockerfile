# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

# Environment variables will be picked up directly from the .env file.
# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci 

COPY . .
RUN npm run build

# ---- Production stage ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy essential files from builder
# (Skip public copy as it does not exist in this project root)

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/.env* ./

# Ensure dotenv is available for runtime environment variable loading
RUN npm install dotenv

USER nextjs

EXPOSE 8080

# server.js is created by next build from the standalone output
# We preload dotenv to ensure the .env file is parsed and injected into process.env at runtime
CMD ["node", "-r", "dotenv/config", "server.js"]