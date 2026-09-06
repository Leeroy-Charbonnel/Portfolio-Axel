FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

#NO VOLUME DIRECTIVE on /app/storage: the compose file declares the named volume
#and mounts it. Declaring both confuses Dokploy's deploy step, which builds the
#image and then never swaps the container.
#
#The private registry this used to install from is gone with the shared package:
#no GITHUB_TOKEN build arg, no .npmrc, nothing to scrub from the image.

#the entrypoint applies migrations and seeds the interface labels before serving
CMD ["./docker-entrypoint.sh"]
