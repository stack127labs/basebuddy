# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 COREPACK_HOME=/pnpm/corepack
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

FROM base AS dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS production-dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM dependencies AS builder
COPY .eslintrc.json components.json next.config.ts postcss.config.mjs proxy.ts tailwind.config.ts tsconfig.json vitest.config.ts ./
COPY public ./public
COPY e2e ./e2e
COPY scripts ./scripts
COPY src ./src
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0
RUN addgroup -S -g 10001 basebuddy && adduser -S -D -H -u 10001 -G basebuddy basebuddy \
    && mkdir -p /app/basebuddy-data && chown 10001:10001 /app/basebuddy-data
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/tsconfig.json ./
COPY --from=builder --chown=10001:10001 /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"]
