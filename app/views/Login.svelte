<script>
  import { onMount } from 'svelte';
  import axios from 'axios'
  import page from 'page';
  import Alert from '../components/Alert'
  import { fade } from 'svelte/transition';
  import { formToJSON } from '../util/form.js'
  import { get_initial_state } from '../UserState.js';

  export let ready = false;

  const redirect = (new URL(window.location.href)).searchParams.get('redirect')
  let loginAttempts = 0;
  let alert;

  onMount(async () => {
    // always check the initial state to see if we need to display this or not
    if (await get_initial_state()) {
      if (redirect)
        page.redirect(redirect)
      else
        page.redirect("/")

    } else {
      ready = true;
    }
  });

  async function submitLogin(e) {
    try {
      const resp = await axios.post("/api/login", formToJSON(event.target))

      if (await get_initial_state()) {
        if (redirect)
          page.redirect(redirect)
        else
          page.redirect("/")

        alert.message()
        loginAttempts = 0;
      } else {
        alert.message("Unknown login failure")
      }
    } catch (e) {
      if (e.response) {
        if (e.response.status >= 500) {
          alert.message("Unknown server error. Contact an administrator if this persists.")
        } else if (e.response.status === 403) {
          loginAttempts++;
          const badpass = "Bad username and/or password."

          if (loginAttempts >= 5) {
            alert.message(badpass, `If you cannot remember your credentials, <a href="/recovery">reset them</a>. Otherwise you risk being locked out.`)
          } else {
            alert.message(badpass)
          }
        } else {
          alert.message("Unknown server error status");
        }
      } else if (e.request) {
        alert.message("Unknown server error. Contact an administrator if this persists.")
      } else {
        alert.message("Unknown request error: " + e.message)
      }
    }
  }

</script>

<svelte:head>
<title>PSForever - Login</title>
</svelte:head>

<main>
  <h1>Login to PSForever</h1>

  <Alert bind:this={alert} />

  <form name="login" class="form-group" on:submit|preventDefault={submitLogin}>
    <div class="form-group">
      <label for="inputUsername">Username</label>
      <input class="form-control" id="inputUsername" placeholder="Username" name="username" required>
    </div>
    <div class="form-group">
      <label for="inputPassword">Password</label>
      <input class="form-control" type="password" id="inputPassword" placeholder="Password" name="password" required>
    </div>
    <button type="submit" class="btn btn-primary">Login</button>
  </form>
  <p><a href="/recovery">Forgot username/password?</a></p>
</main>
