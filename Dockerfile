# PSFPortal — Vite/React frontend built and served by the Express API.
#
# Debian (glibc) base. This used to be load-bearing -- `bcrypt` and `pg` are
# native modules, and bcrypt's glibc prebuilts avoided a source build. Both are
# gone now that the login server owns the database and the password check, so
# the dependency tree is pure JavaScript and an Alpine base would work. Left on
# Debian deliberately rather than swapped in passing: the saving is tens of
# megabytes on a locally-built dev image, and a base change deserves its own
# test. npm install still runs inside the image so the tree matches the
# container platform (the host may be Windows/macOS).

# ---- build stage: install deps and produce the static SPA in public/ ----
FROM node:24-bookworm-slim AS build
WORKDIR /app

# package-lock.json is gitignored in this project, so install rather than ci.
COPY package.json ./
RUN npm install

COPY . .
# Client-derived assets (data/) are gitignored and absent from a clean checkout, so create the
# directory unconditionally -- otherwise the runtime COPY below fails on a fresh clone. An image
# built WITHOUT them is fully functional, just showing internal object names and plain grid tiles.
RUN mkdir -p data && npm run build

# ---- runtime stage: the Express server + built assets ----
FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY --from=build /app/api ./api
# Item names/icons generated from a local client install (see docs/client-assets.md). Present only
# when the builder supplied them; the app falls back to internal names and plain tiles otherwise.
# NOTE: an image built with these baked in carries Daybreak-owned material -- keep it local, do not
# push it to a public registry.
COPY --from=build /app/data ./data
COPY --from=build /app/index.ts ./index.ts
COPY --from=build /app/package.json ./package.json

EXPOSE 8080
# The Express server is TypeScript run directly by Node (native type stripping); no build step.
CMD ["node", "index.ts"]
