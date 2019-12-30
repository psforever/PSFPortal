<script>
// V1: Homepage (unauth, server list/status)
// V1: Logged in home page (character stats)
//   - World server list with TR/VS/NC breakdown
//   - Extra: Server stats
//   - Extra: World map with empire colored grid
//   - Extra: Instant action (psforever://server_name?charid=123&loc=123)
// V1: Profile (change pw, email)
// V1: Login (username, password)
// V1: Forgot password
// V1: Register (un, pw, email, captcha, email verification)
// Extra: Notifications / announcements

import { onMount } from 'svelte';
import page from 'page';

import { get_initial_state } from './UserState.js';

import Nav from './components/Nav.svelte'
import Alert from './components/Alert.svelte'
import Home from './views/Home.svelte';
import Login from './views/Login.svelte';
import Register from './views/Register.svelte';
import Profile from './views/Profile.svelte';
import BadRoute from './views/BadRoute.svelte';
import UserList from './views/UserList.svelte';
import AdminPanel from './views/AdminPanel.svelte';
import CharacterList from './views/CharacterList.svelte';

// prevent view pop-in
let initialized = false;

onMount(async () => {
  await get_initial_state()
  page() // start the router
});

let route;
let routeParams;
let pageCtx;
let appAlert;

let previousCtx = null
let currentCtx = null

//$ : console.log("INIT " + initialized, currentCtx.pageCtx)

function setRoute(r, initialState) {
  return function(ctx) {
    let first = !currentCtx

    if (!first)
      previousCtx = currentCtx

    if (!first && ctx.pathname == previousCtx.pageCtx.pathname)
      return

    if (process.env.NODE_ENV !== "production" && !first)  {
      console.log("-------------------NEW ROUTE--------------\n",
        previousCtx.pageCtx.pathname, " -> ", ctx.pathname)

      if (previousCtx && r == previousCtx.route)
        console.log("/!\\ Re-rendering same view with different params")
    }

    // We are changing views, clear the global app message
    if (appAlert)
      appAlert.message("");

    if (initialState !== undefined && initialState)
      initialized = false;
    else
      initialized = true;

    // Change the component context
    currentCtx = {
      route : r,
      routeParams : ctx.params,
      pageCtx : ctx,
    }

    /* If the previous view compoent was the same, we need to
      force svelte to rerender it if some of the parameters have changed.
      For example, clicking from another User's view to ourself wont lead
      to a render due to the component not changing. We force this change
      by scheduling the two changes on separate ticks.
    */
    if (previousCtx && r == previousCtx.route) {
      setImmediate(() => currentCtx.route = null)
      setImmediate(() => currentCtx.route = r)
    }
  };
}

page("/", setRoute(Home, true));
page("/login", setRoute(Login, true));
page("/register", setRoute(Register));
page("/admin", setRoute(AdminPanel));
page("/profile", setRoute(Profile, true));
page("/user/:id", setRoute(Profile, true));
//page("/users", setRoute(UserList));
//page("/characters", setRoute(CharacterList));
//page("/recovery", setRoute(Recovery));
page("*", setRoute(BadRoute));
</script>

{#if currentCtx}
<Nav bind:route={currentCtx.pageCtx.pathname}/>

<main role="main" class="container">
  <Alert bind:this={appAlert} />

  <div class:d-none={!initialized}>
    <svelte:component this={currentCtx.route} bind:pageCtx={currentCtx.pageCtx} bind:ready={initialized} bind:appAlert={appAlert} bind:params={currentCtx.routeParams} />
  </div>
</main>

<footer class="footer">
  <div class="container text-center">
    <span class="text-muted">
      &copy;2019, PSForever.net, All Rights Reserved.<br/>
      PlanetSide is a registered trademark of Daybreak Game Company, LLC. PSForever claims no such trademarks.<br/>
All other trademarks or tradenames are properties of their respective owners.
    </span>
  </div>
</footer>

{/if}

