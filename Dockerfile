FROM node:20-slim

WORKDIR /app

# Install workspace dependencies (root + packages/*)
COPY package.json package-lock.json* ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/bot/package.json packages/bot/
RUN npm install --no-audit --no-fund

# Copy sources and generate the Prisma client (no-op if schema absent)
COPY . .
RUN npm run db:generate || true

ENV NODE_ENV=production

# The bot is a worker process: no HTTP port to expose.
CMD ["npm", "run", "start:bot"]
