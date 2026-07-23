# PSFPortal — Vite/React frontend built and served by the Express API.
#
# Debian (glibc) base rather than Alpine: bcrypt ships glibc prebuilt
# binaries, so this avoids a source build. npm install runs inside the
# image so the native bcrypt binary matches the container platform (the
# host may be Windows/macOS).

# ---- build stage: install deps and produce the static SPA in public/ ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

# package-lock.json is gitignored in this project, so install rather than ci.
COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

# ---- runtime stage: the Express server + built assets ----
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY --from=build /app/api ./api
COPY --from=build /app/index.js ./index.js
COPY --from=build /app/package.json ./package.json

EXPOSE 8080
CMD ["node", "index.js"]
