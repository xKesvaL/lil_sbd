# syntax=docker/dockerfile:1

FROM oven/bun:1.3-debian AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
ENV NITRO_PRESET=bun
RUN bun run build

FROM oven/bun:1.3-slim AS runner
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

CMD ["bun", ".output/server/index.mjs"]
