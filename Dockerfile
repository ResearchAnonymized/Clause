# Counterpart production image (TanStack Start + Nitro)
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000
RUN corepack enable \
  && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/.output ./.output
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./
# OpenShift assigns a random UID in group 0; keep the image writable for that UID.
RUN mkdir -p /data/storage \
  && chgrp -R 0 /app /data \
  && chmod -R g=u /app /data
USER 65532
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s --start-period=40s --retries=8 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/public/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
