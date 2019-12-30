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

import { fade } from 'svelte/transition';
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

// prevent pop-in
let initialized = false;

onMount(async () => {
  await get_initial_state()
  initialized = true;
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

    if (!first && currentCtx.route == r)
      return

    if (appAlert)
      appAlert.message("");

    if (initialState !== undefined && initialState)
      initialized = false;
    else
      initialized = true;

    currentCtx = {
      route : r,
      routeParams : ctx.params,
      pageCtx : ctx,
    }
  };
}

page("/", setRoute(Home, true));
page("/login", setRoute(Login, true));
page("/register", setRoute(Register));
page("/register", setRoute(Register));
//page("/users", setRoute(UserList));
//page("/characters", setRoute(CharacterList));
page("/admin", setRoute(AdminPanel));
//page("/recovery", setRoute(Recovery));
page("/profile", setRoute(Profile, true));
page("*", setRoute(BadRoute));
page()
</script>

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
