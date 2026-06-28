# --- Build Stage ---
FROM node:22-slim AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install dependencies including devDependencies
RUN npm ci

# Copy full source
COPY . .

# Build the frontend assets and compile the server.ts file via esbuild
RUN npm run build

# --- Production Stage ---
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy production package manifest and install only production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy built frontend assets and compiled backend bundle
COPY --from=builder /app/dist ./dist

# Expose port 3000
EXPOSE 3000

# Start the full-stack server
CMD ["node", "dist/server.cjs"]
