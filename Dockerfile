FROM oven/bun:1.4.0-alpine AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM dependencies AS build
COPY tsconfig.json ./
COPY src ./src
COPY web ./web
RUN bun run typecheck && bun run build

FROM oven/bun:1.4.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --from=build /app/src ./src
COPY --from=build /app/public ./public
USER bun
EXPOSE 3000
CMD ["bun", "run", "start"]
