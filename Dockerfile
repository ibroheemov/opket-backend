# ================================
# Stage 1: Build
# ================================
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copy package files first
# This allows Docker to cache npm install
COPY package*.json ./

# Install all dependencies, including TypeScript
RUN npm ci

# Copy application source
COPY . .

# Compile TypeScript -> dist/
RUN npm run build


# ================================
# Stage 2: Production
# ================================
FROM node:22-bookworm-slim AS production

WORKDIR /app

ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled application
COPY --from=builder /app/dist ./dist

# The application uses PORT from environment.
# 3000 is our default.
ENV PORT=3000

EXPOSE 3000

# Start compiled JavaScript
CMD ["node", "dist/server.js"]
