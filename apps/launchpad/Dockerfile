# Prune stage
FROM node:22.14.0-alpine AS pruner

WORKDIR /app

# Install pnpm and turbo
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy files needed for pruning
COPY . .

# Prune the workspace for the launchpad app
RUN pnpm dlx turbo prune @cartesi/launchpad --docker

# Build stage
FROM node:22.14.0-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy the pruned workspace
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code from pruned workspace
COPY --from=pruner /app/out/full/ .

# Build the application
RUN pnpm build --filter=@cartesi/launchpad

# Runtime stage
FROM nginx:alpine

# Copy the built assets from build stage to nginx
COPY --from=builder /app/apps/launchpad/dist /usr/share/nginx/html

# Copy custom nginx config if needed
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"] 
