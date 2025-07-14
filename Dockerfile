### Stage 1: Build the TypeScript sources
FROM node:20-alpine AS builder

# Install build dependencies
WORKDIR /app

# Copy dependency manifests first for better cache utilisation
COPY package.json package-lock.json ./

# Install all dependencies (including dev) for compilation
RUN npm ci

# Copy the rest of the source
COPY tsconfig.json ./
COPY src ./src

# Build the project – compiled JS lands in /app/dist
RUN npm run build


### Stage 2: Create a lightweight production image
FROM node:20-alpine
WORKDIR /app

# Copy only the pieces needed to run the app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy the compiled code from the builder stage
COPY --from=builder /app/dist ./dist

# Provide a location for cursor checkpoints (overridable via volume mount)
RUN mkdir -p /app/cursors

# Default environment – override at runtime as needed
ENV NODE_ENV=production \
    CONFIG_PATH=config.json

# The container executes the forwarder
CMD ["node", "dist/index.js"] 