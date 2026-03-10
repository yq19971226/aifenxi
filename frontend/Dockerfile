# ---- Dependencies stage ----
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
# 确保 next-intl 在构建环境中可用（避免 CI/镜像缓存导致类型缺失）
RUN npm install next-intl --no-save

# ---- Build stage ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

ARG API_PROXY_URL=http://localhost:8000
ENV API_PROXY_URL=${API_PROXY_URL}
ARG NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN npm run build

# ---- Production stage ----
FROM node:20-alpine AS production

# Install wget for health checks
RUN apk add --no-cache wget

# Create non-root user
RUN addgroup -S omnimind && adduser -S omnimind -G omnimind

WORKDIR /app

# Copy standalone server and static assets
COPY --from=builder --chown=omnimind:omnimind /app/.next/standalone ./
COPY --from=builder --chown=omnimind:omnimind /app/.next/static ./.next/static
COPY --from=builder --chown=omnimind:omnimind /app/public ./public

USER omnimind

EXPOSE 3000

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

HEALTHCHECK --interval=15s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 -O /dev/null http://localhost:3000/dashboard || exit 1

CMD ["node", "server.js"]
