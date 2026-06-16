FROM oven/bun:1-alpine

WORKDIR /app

#GITHUB_TOKEN is required at build time to install @leeroy-charbonnel/vue-shared-ui
#from the private GitHub Packages registry. Pass it as a build arg in Dokploy
#(Build > Build Args > GITHUB_TOKEN=ghp_...) and Dokploy will forward it here.
ARG GITHUB_TOKEN
ENV GITHUB_TOKEN=${GITHUB_TOKEN}

COPY package.json bun.lock .npmrc ./
RUN bun install

COPY . .
RUN bun run build

#scrub the token from the runtime image - it was only needed for bun install
ENV GITHUB_TOKEN=""

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

#STORAGE VOLUME - admin uploads (images, videos) land in /app/storage/files/.
#Mount a persistent Docker volume here from Dokploy so uploaded files survive
#container rebuilds:
#  Dokploy -> Service -> Volumes -> Add: name=portfolio-storage, mount=/app/storage
VOLUME ["/app/storage"]

CMD ["bun", "server.ts"]
