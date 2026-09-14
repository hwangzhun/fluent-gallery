FROM node:22-alpine3.24 AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS test

COPY . .
RUN npm run typecheck && npm test

FROM test AS build

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

FROM node:22-alpine3.24 AS production-dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && find node_modules/@img -mindepth 1 -maxdepth 1 -type d \
      \( -name 'sharp-linux-*' -o -name 'sharp-libvips-linux-*' \) \
      ! -name '*linuxmusl*' -exec rm -rf {} + \
    && npm cache clean --force

FROM node:22-alpine3.24 AS runtime

ENV NODE_ENV=production \
    PORT=3001 \
    GALLERY_DB_PATH=/app/data/gallery.db \
    LOCAL_UPLOAD_DIR=/app/uploads

WORKDIR /app
RUN apk add --no-cache su-exec

COPY --chown=node:node --from=production-dependencies /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/dist-server ./dist-server
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint

RUN mkdir -p /app/data /app/uploads /app/logs \
    && chown node:node /app/data /app/uploads /app/logs \
    && chmod 755 /usr/local/bin/docker-entrypoint

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"]

ENTRYPOINT ["/usr/local/bin/docker-entrypoint"]
CMD ["node", "dist-server/index.js"]
