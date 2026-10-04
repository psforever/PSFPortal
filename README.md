# PSFPortal

A web interface to [PSForever](https://github.com/PSForever/PSF-LoginServer) servers — accounts,
characters, statistics, and live world administration.

The portal is one process: an **Express 5 API** that also serves a **React 19 single-page app** built
by Vite. It has **no database connection of its own**. Everything — accounts, characters, statistics,
sessions, even the password check at login — goes through the **PSF-HTTP API**.

```
     browser ──► Express (:8080) ──► PSF-LoginServer ──► PostgreSQL
                  + built SPA        PSF-HTTP API (:51002)
```

That single arrow is deliberate. The portal used to hold its own PostgreSQL pool, which made two
processes authoritative over the same data, and they disagreed where it mattered: the portal read
`building.faction_id` to colour a continent map while the login server held the faction the world was
actually enforcing, and the write behind a capture is asynchronous, so a map could show the base's
previous owner. Login had the same shape of problem from the other side — the portal hashed with
Node's bcrypt, which emits `$2b$` revisions the server's own checker rejects, so a password could be
accepted here and refused in-game.

One consequence worth knowing: **the login server is now a hard dependency**. Without it the portal
serves its static pages and nothing else.

---

## What it does

### Public

| | |
|---|---|
| **Home** | server status, current population by empire, live continent control |
| **Continents** | on the home page — vector continent maps with facility ownership, lattice links, and warp-gate empires |
| **Leaderboard** | top kills (all-time and by date), top outfits |
| **Avatar / Outfit / Profile** | character sheets, weapon statistics, K/D history, outfit rosters |
| **Register / Login** | accounts and sessions, both held by the login server |

### Player panel (`/me`) — any logged-in account

Non-GM accounts get a panel of their own. It shows **only the characters on the signed-in account**;
asking for someone else's returns a 404 that is indistinguishable from a character that does not
exist.

* character list with rank, battle/command experience, and playtime
* **locker** contents, drawn as the client's own grid
* **loadouts** — every saved favourite, rendered as the in-game inventory: exosuit holsters and grid,
  or a vehicle's trunk, with real item artwork, stack sizes and ammunition counts

### Admin panel (`/admin`) — GM accounts only

* **Accounts** — search, ban/unban, grant/revoke GM
* **Avatars** — grant/revoke per-character GM and spectate roles
* **Continents** — inspect and set facility ownership, one base or a whole continent; randomize or
  apply a saved global layout
* **Combat** — a live map per zone: players, vehicles and deployables, with actions against a
  selected entity, plus force-recall to sanctuary and zone transfers
* **Construction** — place a vehicle, a deployed AMS, or a deployed Router at a clicked point, for a
  chosen empire; ground height and attitude come from the server's terrain data
* **Admin log** — every audited administrative action
* **Interstellar log** — facility ownership events as they happen (see below)

---

## The interstellar log

A rolling seven-day record of everything that changes — or tries to change — who owns a facility.
Each entry carries the continent, the facility, who caused it, and the empires before and after.

| Kind | Shown as | Meaning | Flips ownership |
|---|---|---|---|
| `HackStarted` | Hack Started | a control console hack began | no |
| `HackHoldCompleted` | Hack and Hold Completed | a plain hack-and-hold ran its timer out | **yes** |
| `HackHoldFailed` | Hack and Hold Failed | the hack was cleared before the timer expired | no |
| `LluPickedUp` | LLU Picked Up | a player lifted the Lattice Logic Unit off its socket | no |
| `LluDelivered` | LLU Delivered | the unit reached its destination | **yes** |
| `LluLost` | LLU Lost | the unit timed out or the hack lapsed while it was in the field | no |
| `LluDestroyed` | LLU Destroyed | the unit was destroyed, or the hack was resecured while it was out | no |
| `LluBypassCompleted` | LLU Bypass — Hack and Hold Completed | a hack against a *neutral* CTF base, where no unit is required | **yes** |
| `LluBypassFailed` | LLU Bypass — Hack and Hold Failed | that same hack was cleared in time | no |
| `PortalDesignation` | Portal Designation | ownership assigned from this admin panel rather than won in the field | **yes** |

The nine field events come from the login server's capture machinery (`HackCaptureActor`,
`CaptureFlagManager`) and name the facility directly. `PortalDesignation` is emitted by the PSF-HTTP API
itself; a single-facility designation names the facility, while a whole-continent or bulk assignment
says so rather than naming one.

Continent names are resolved in the browser from `static/continents/index.json` — the world server
reports a zone by its internal id (`z1`, `home2`), which is the vocabulary the rest of the PSF-HTTP API
speaks, and an id the index does not know still renders as itself.

---

## Getting started

**Requirements:** Node **24+** (the Express server is TypeScript executed directly, via Node's native
type stripping — there is no server build step) and a running **PSF-LoginServer** to talk to. No
database client, driver or credentials are needed here.

```bash
git clone https://github.com/GeekOfWires/PSFPortal
cd PSFPortal
npm install
```

### Database

There is nothing to set up. The portal never connects to PostgreSQL — the login server does, and
provisions the schema with its own Flyway migrations. `db/schema.sql` is kept only as a reference for
the columns the portal's queries project.

### Configuration

Create a `.env` in the project root:

```ini
PORT=8080
NODE_ENV=development
COOKIE_SECRET=make_this_long_and_random
PSADMIN=127.0.0.1:51002
```

| Variable | Meaning |
|---|---|
| `PSADMIN` | `host:port` of the PSF-HTTP API — the portal's only data source |
| `PORT` | Express listen port (default `8080`) |
| `COOKIE_SECRET` | session signing key — changing it invalidates every session |
| `TRUST_PROXY` | set when running behind a reverse proxy |
| `POP_CACHE_MINUTES` | how long population figures are cached |

Without `PSADMIN` the portal still starts and serves the SPA, but every data-backed page is empty and
nobody can sign in.

**Never commit your `.env`.** It is gitignored.

### Running

```bash
npm run dev
```

That runs the Vite dev server and the Express API side by side. **Open http://localhost:5173** — Vite
proxies `/api` through to Express on `:8080`.

Other scripts:

| | |
|---|---|
| `npm run build` | build the SPA into `public/` |
| `npm run production` | build, then serve everything from Express alone |
| `npm run typecheck` | type-check both the client and the server (`tsc --noEmit`) |

Register an account, then make it a GM: `UPDATE accounts SET gm = true WHERE id = <your_id>;`

### Docker

The `Dockerfile` builds the SPA and runs the Express server in one image, listening on `8080`. It is
built alongside the login server stack; see that repository's `docker-compose.yml`.

---

## Layout

```
index.ts              Express entry point — sessions, static SPA, mounts /api
api/                  API routes and data access
  db.ts                 client for the login server's data endpoints (no SQL, despite the name)
  psadmin.ts            HTTP client for the PSF-HTTP API
  session-store.ts      express-session store backed by that same API
  authentication.ts     register / login / logout
  user.ts  me.ts        the signed-in account and its own characters
  stats.ts  info.ts     leaderboards, weapon stats, server status
  continents.ts         live world state and every GM action
  admin.ts              account and role administration
  inventory.ts          decodes the login server's locker/loadout blobs
  util.ts               pagination, sorting, filtering, NEED_SESSION/NEED_ADMIN gates
src/                  React SPA
  pages/                one file per route; admin/ and me/ hold their sections
  components/           shared UI, continent map, inventory icons
  lib/                  API client, item shapes, exosuit and trunk geometry
  styles/globals.css    Tailwind v4 entry and the PlanetSide palette
static/               assets copied verbatim into the build
  continents/           generated continent geometry and facility placements
scripts/              generators (see below)
data/                 client-derived item table — see docs/client-assets.md
public/               Vite build output (gitignored)
```

### Generated data

**Continents** (`static/continents/`) — terrain silhouettes and facility placements, built from
raxicore-editor's terrain export plus PSF-LoginServer's zonemaps:

```bash
node scripts/build-continents.mjs --terrain <dir> --zonemaps <PSF zonemaps dir>
```

Regenerate when the map data or the zonemaps change. Ownership is *not* baked in — it is fetched live.

**Item names and artwork** (`data/`, `src/lib/itemShapes.json`) — derived from a PlanetSide client
installation. See **[docs/client-assets.md](docs/client-assets.md)** for what is committed, what is
deliberately not, and how to regenerate it. Nothing here downloads or redistributes a client, and the
portal degrades gracefully without any of it: item names fall back to internal object names and the
inventory grid to plain tiles, so a clean clone builds and runs with no extra steps.

---

## The data layer

`api/db.ts` keeps its name and its exported function names, but issues no SQL. Each function is now a
call to a `/portal/*` endpoint on the login server, implemented in
`net.psforever.actors.api.PortalQueries`. The SQL moved across verbatim — same statements, same result
shapes — so responses did not change and the route modules did not have to move with it.

Three things are deliberately different on the far side:

- **Redaction happens at the source.** `passhash` and `password` are never selected at all, and a
  login's IP address is cut to its last two octets before it leaves the login server. The portal used
  to fetch both in full and strip them afterwards.
- **Sort and filter are whitelisted twice.** They travel as plain tokens; the login server matches each
  against its own list and falls back to a default rather than letting one near a statement.
- **Facility ownership comes from the live world**, not the `building` table — see `/zones/control`.

Sessions work the same way. `api/session-store.ts` is an `express-session` store whose backend is the
API rather than `connect-pg-simple`; that was the last thing keeping a connection pool in this process.
Session reads fail soft (an unreachable API means "signed out", not an error page); writes do not.

---

## Troubleshooting

**`/api` requests 404 or proxy-error in development.** Vite serves the app on `5173` and proxies
`/api` to Express on `8080`. Open `5173`, not `8080`, and make sure the API actually started —
`npm run dev` runs both, and kills both if either dies.

**Every page is empty and login fails.** The login server is down or `PSADMIN` is wrong. The portal
has no data of its own to fall back on. `connect_to_db()` logs what it found at startup — check that
line first.

**Item names show as `r_shotgun` and inventory tiles are blank.** Expected on a clean clone — the
client-derived assets are not committed. See [docs/client-assets.md](docs/client-assets.md).

---

## License

GPL-3.0-or-later.
