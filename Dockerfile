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

#NOTE: no VOLUME directive on /app/storage. The bind-mount configured in
#Dokploy (Volumes tab: /home/dokploy/axel/medias -> /app/storage) already
#handles persistence. Keeping a VOLUME directive AND a bind mount confuses
#Dokploy's deploy step (it builds the image but never swaps the container).

CMD ["bun", "server.ts"]
