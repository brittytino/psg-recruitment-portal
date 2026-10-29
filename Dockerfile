# syntax=docker/dockerfile:1.7
# Multi-stage build for the web application, background worker and migration runner.
ARG NODE_IMAGE=node:22.22.0-bookworm-slim

FROM ${NODE_IMAGE} AS base
# Some deployment networks block deb.debian.org (403 Forbidden).
# Route package sources through official ftp.debian.org and security.debian.org.
RUN set -eux; \
    if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
      sed -i \
        -e 's|deb.debian.org/debian-security|security.debian.org/debian-security|g' \
        -e 's|deb.debian.org/debian|ftp.debian.org/debian|g' \
        /etc/apt/sources.list.d/debian.sources; \
    fi; \
    if [ -f /etc/apt/sources.list ]; then \
      sed -i \
        -e 's|deb.debian.org/debian-security|security.debian.org/debian-security|g' \
        -e 's|deb.debian.org/debian|ftp.debian.org/debian|g' \
        /etc/apt/sources.list; \
    fi; \
    find /etc/apt/sources.list.d/ -name '*.list' -exec sed -i \
      -e 's|deb.debian.org/debian-security|security.debian.org/debian-security|g' \
      -e 's|deb.debian.org/debian|ftp.debian.org/debian|g' {} +; \
    apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl tini \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --fetch-retries=5

FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build

FROM deps AS prod-deps
RUN npm prune --omit=dev && npx prisma generate

FROM base AS runtime
ENV NODE_ENV=production PORT=3000
ARG GIT_SHA=dev
ENV GIT_SHA=${GIT_SHA}
LABEL org.opencontainers.image.revision=${GIT_SHA}
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/build-worker ./build-worker
COPY --chown=node:node package.json ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node templates ./templates
COPY --chown=node:node public ./public
COPY --chown=node:node server.mjs ./server.mjs
RUN mkdir -p /var/lib/srportal/storage && chown -R node:node /var/lib/srportal
USER node
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "run", "start"]
