<script>
  import { onMount } from 'svelte';
  import axios from 'axios'
  import moment from 'moment'

  import { loggedIn } from '../UserState'
  import Alert from '../components/Alert'
  import AccountLink from '../components/AccountLink'
  import CharacterLink from '../components/CharacterLink'
  import EmpireStats from '../components/EmpireStats'

  export let ready;

  let stats;
  let alert;

  function format_account(account) {
    return `<a href="/user/${account.id}">${account.username}</a>`
  }

  onMount(async () => {
    try {
      const resp = await axios.get("/api/stats")
      stats = resp.data;
      alert.message("")
    } catch (e) {
      console.log(e)
      alert.message("Failed to fetch stats from server")
    }

    ready = true
  })
</script>

<svelte:head>
<title>PSForever</title>
</svelte:head>

<Alert bind:this={alert} />

{#if stats}
<div class="row">
  <div class="col-8">
  <h1>PSForever Beta Server</h1>
  <p>
  <strong>Server address:</strong> <code>play.psforever.net:51200</code> (<a href="https://docs.google.com/document/d/1ZMx1NUylVZCXJNRyhkuVWT0eUKSVYu0JXsU-y3f93BY/edit">Setup Instructions</a>)<br/>
  <strong>PSForever accounts:</strong> {stats.accounts.toLocaleString()}<br/>
  <strong>Server characters:</strong> {stats.characters.toLocaleString()}<br/>
  <strong>Last character created:</strong> <CharacterLink character={stats.last.character} /> (<span title={moment(stats.last.character.created).format(`MMMM Do YYYY, h:mm:ss a`)}>{moment(stats.last.character.created).fromNow()}</span>)</p>
  </div>

  <div class="col-4">
  <EmpireStats stats={stats.empires} />
  </div>

</div>
{#if !$loggedIn}
<div class="row">
  <div class="col">
    <a class="btn btn-primary" href="/login" role="button">Login</a>
    <a class="btn btn-primary" href="/register" role="button">Create Account</a>
  </div>
</div>
{/if}
{/if}

