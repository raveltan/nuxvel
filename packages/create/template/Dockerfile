# syntax=docker/dockerfile:1
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

FROM deps AS build
COPY . .
RUN npx nuxt prepare && npx nuxt build
ARG NUXVEL_GIT_COMMIT
ARG NUXVEL_BUILD_SOURCE
RUN npx nuxvel build:manifest
RUN NUXT_DATABASE_URL=postgres://build@127.0.0.1/unused NUXT_AUTH_SECRET=build-time-route-list-only-not-a-secret \
  npx nuxvel routes --json > nuxvel-routes.json

FROM scratch AS artifact
COPY --from=build /app/.output ./.output
COPY --from=build /app/server/database/migrations ./server/database/migrations
COPY --from=build /app/nuxvel-manifest.json ./
COPY --from=build /app/nuxvel-routes.json ./

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=build --chown=node:node /app/server/database/migrations ./server/database/migrations
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health/live').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
