# syntax=docker/dockerfile:1

FROM oven/bun:1.4-debian AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

# Native FFmpeg/ffprobe + fonts for video rendering and audio DSP
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV SOCIAL_DATA_DIR=/app/.data

COPY --from=builder /app/.output ./.output
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

RUN mkdir -p /app/.data/uploads /app/.data/scratch /app/.data/pglite

VOLUME ["/app/.data"]
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
