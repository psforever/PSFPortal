# PSFPortal
An API + webapp to manage PSForever accounts, characters, and servers.

## Features
* User registration, login, and sessions
* Home page
* Admin management

### Upcoming Features
* Email verification + captcha
* Changing passwords
* WorldServer mangement

## Developing
This requires a relatively modern version of Node that supports async/await and ES6 (v13.x+). Tested using v13.3.0. You may still get `(node:61412) ExperimentalWarning: The ESM module loader is experimental.`. Ignore this as ESM is essentially stable in recent versions.

First download and install the Node dependencies:
```
git clone https://github.com/psforever/PSFPortal
cd PSFPortal/
npm install
```

Next, install PostgreSQL from your package manager.
Load the DB schema into a fresh database (in this case named psforever):

```
psql psforever < db/schema.sql
```

Before running, you will need to create a `.env` file like this:

```
PGUSER=...
PGHOST=...
PGPASSWORD=...
PGDATABASE=...
PGPORT=...
COOKIE_SECRET=<make this very long and random>
```

Never share/release/commit your `.env` file.

Finally, run the following commands:
```
# Will start the frontend Webpack builder with hot reload
npm run dev
# And in another terminal, will start the backend server
npm run dev-server
```

## Production Running/Building
Follow the same steps as above, but instead run `npm run production` at the very end.
