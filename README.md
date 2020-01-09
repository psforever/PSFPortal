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
**This requires a [relatively modern version](https://nodejs.org/en/download/current/) of Node that supports async/await and ES6 (v13.x+). Tested using v13.3.0. Do not use LTS builds.** You may still get `(node:61412) ExperimentalWarning: The ESM module loader is experimental.`. Ignore this as ESM is essentially stable in recent versions.

**Windows users: Before continuing, run `npm install --global --production windows-build-tools`. Otherwise, `bcrypt` won't install properly.**

First download and install the Node dependencies:
```
git clone https://github.com/psforever/PSFPortal
cd PSFPortal/
npm install
```

You should see no errors (warnings are okay).

### Database

Next, install PostgreSQL from your package manager or the following links:

* Windows - [Official Downloads](https://www.postgresql.org/download/linux/ubuntu/)
* Linux - [Debian](https://www.postgresql.org/download/linux/debian/) or [Ubuntu](https://www.postgresql.org/download/linux/ubuntu/)
* macOS - Application https://www.postgresql.org/download/ (or `brew install postgresql && brew services start postgresql`)

Create a database named `psforever` using `psql` or a graphical tool such as [pgAdmin](https://www.pgadmin.org/download/) (highly recommended).
Then create a user named `psforever` with a password of `psforever` and `GRANT` it access to the `psforever` database, public tables, and public sequences.
This can be summarized with the following raw SQL commands:

```sql
CREATE USER psforever;
CREATE DATABASE psforever;
GRANT ALL PRIVILEGES ON DATABASE psforever TO psforever;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO psforever;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO psforever;
ALTER USER psforever WITH PASSWORD 'psforever';
```

Load the DB schema into the database using the command line:

```
psql psforever < db/schema.sql
```

Or the pgAdmin's "Query Tool" interface.

### Running

Before running, you will need to create a `.env` file in the root of the project like this:

```
PGUSER=your_database_user
PGHOST=localhost
PGPASSWORD=your_database_user_password
PGDATABASE=psforever
PGPORT=5432
COOKIE_SECRET=make_this_very_long_and_random
```

**Never** share/release/commit your `.env` file.

Run the following commands:

```
# Will start the backend server (:8080)
npm run dev-server
```

You should see similar output:
```
> psfportal@1.0.0 dev-server
> nodemon -w api/ -w index.js

[nodemon] 2.0.2
[nodemon] to restart at any time, enter `rs`
[nodemon] watching dir(s): api/**/* index.js
[nodemon] watching extensions: js,mjs,json
[nodemon] starting `node index.js`
(node:25327) ExperimentalWarning: The ESM module loader is experimental.
WARNING: development server simulated delay active
Connected to the psql database at localhost
[MODE development] PSFWeb now accepting requests at http://localhost:8080/
```

Finally run in another terminal:

```
# Will start the frontend Webpack builder with hot reload (:8081)
npm run dev
```

You should see similar output:
```
> psfportal@1.0.0 dev /home/username/PSFPortal
> webpack-dev-server --history-api-fallback --config webpack.config.cjs --content-base public

ℹ ｢wds｣: Project is running at http://localhost:8081/
ℹ ｢wds｣: webpack output is served from /
ℹ ｢wds｣: Content not from webpack is served from /home/username/PSFPortal/public
ℹ ｢wds｣: 404s will fallback to /index.html
ℹ ｢wdm｣: Hash: 7936960d2ecba7f25c89
Version: webpack 4.41.5
Time: 4075ms
Built at: 01/07/2020 6:47:43 PM
        Asset      Size  Chunks                   Chunk Names
    bundle.js  2.09 MiB  bundle  [emitted]        bundle
bundle.js.map  2.22 MiB  bundle  [emitted] [dev]  bundle
Entrypoint bundle = bundle.js bundle.js.map
[1] multi (webpack)-dev-server/client?http://localhost:8081 ./app/main.js 40 bytes {bundle} [built]
[./app/App.svelte] 14.5 KiB {bundle} [built]
<snip>
    + 218 hidden modules
ℹ ｢wdm｣: Compiled successfully.
```

Please note that Webpack (dev) will proxy all API requests (/api) to the host `http://localhost:8080` (see the `devServer` key in [webpack.config.cjs](webpack.config.cjs)). This MUST match your backend server's (dev-server) listening port, which is by default 8080.

**Finally, connect to http://localhost:8081** (webpack, not the raw express server)

Register an account to start and grant it GM privileges using `UPDATE accounts SET gm=true WHERE id=your_id`.

### Troubleshooting

1. Database SELECT/INSERTs are failing, but I can connect to the DB

Make sure you have granted the right permissions to your DB user.

```
GRANT ALL PRIVILEGES ON DATABASE user TO dbname;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO user;
```

2. `[HPM] Error occurred while trying to proxy request /api/stats from localhost:8080 to http://localhost:8080`

Your Webpack instance is listening on 8080, when it should be listening on 8081 and proxying to the express server at 8080. Make sure to run `npm run dev-server` first and make sure it ran properly.

3. `Error: Cannot find package 'bcrypt'`

The `bcrypt` package has native dependencies that must match your Node version. If you upgrade Node, they will be outdated. To fix this, you need to remove your `node_modules/` directory and run `npm install` again to kick off another native build of this dependency.

## Production Running/Building
Follow the same steps as above, but instead run `npm run production` at the very end.
