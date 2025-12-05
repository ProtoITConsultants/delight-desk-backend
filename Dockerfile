# ---------------------------------------
# Base stage (shared for dev & prod)
# ---------------------------------------
FROM node:22-slim AS base

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

EXPOSE 3000

# ---------------------------------------
# Development stage
# ---------------------------------------
FROM base AS development

# Use dev command
CMD ["npm", "run", "start:dev"]

# ---------------------------------------
# Production stage
# ---------------------------------------
FROM base AS production

# Build the app for production
RUN npm run build

# Start the production server
CMD ["node", "dist/src/main.js"]
