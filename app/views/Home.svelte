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
  let players;
  let next_update = 30;
  let next_update_label = "";
  let empire_stats;

  function format_account(account) {
    return `<a href="/user/${account.id}">${account.username}</a>`
  }

  onMount(async () => {
	await update_stats()
	update_stats_label()
	setInterval(update_stats_label, 1000)

    ready = true
  })

   async function update_stats_label() {
	   if (next_update == 1) {
		   next_update = 30;
		   await update_stats()
		   empire_stats.refresh()
	   } else {
		   next_update -= 1
	   }

	   if (next_update == 1)
		   next_update_label = next_update + " second"
	   else
		   next_update_label = next_update + " seconds"
   }

   async function update_stats() {
      try {
        const resp = await axios.get("/api/stats")
        stats = resp.data;
        players = stats.players
        stats.empires = stats.empires
        alert.message("")
      } catch (e) {
        console.log(e)
        alert.message("Failed to fetch stats from server")
      }
  }
</script>

<svelte:head>
<title>PSForever Portal</title>
</svelte:head>

<Alert bind:this={alert} />

{#if stats}
<div class="row">
	<div class="col-md-8 col-12">
		<h1>PSForever Live Server</h1>

		<div class="row">
			<div class="col">
				{#if !$loggedIn}
				<a class="btn btn-primary" href="/login" role="button">Login</a>
				<a class="btn btn-primary" href="/register" role="button">Create Account</a>
				{/if}
				<a class="btn btn-secondary" href="https://docs.google.com/document/d/1ZMx1NUylVZCXJNRyhkuVWT0eUKSVYu0JXsU-y3f93BY/edit" role="button">Setup Instructions</a>
			</div>
		</div><br/>

		<p>
		<strong>Server address:</strong> <code>play.psforever.net:51000</code>&nbsp;
		<button type="button" class="btn btn-sm" class:btn-success={stats.status == "UP"}
						class:btn-danger={stats.status != "UP"}>Server {stats.status}</button><br/>
					<strong>Last character created:</strong> <CharacterLink character={stats.last.character} /> (<span title={moment(stats.last.character.created).format(`MMMM Do YYYY, h:mm:ss a`)}>{moment(stats.last.character.created).fromNow()}</span>)<br/>
					<strong># Accounts:</strong> {stats.accounts.toLocaleString()}<br/>
					<strong># Characters:</strong> {stats.characters.toLocaleString()}
		</p>
	</div>
</div>

<div class="row">
	<div class="col-12">
	<h2>Online Players ({players.length})</h2>
	<p>Next update in {next_update_label}</p>
	</div>
	<div class="col-md-4 col-12 mt-md-0 mt-3">
		{#if stats.empires}
		<EmpireStats bind:this={empire_stats} bind:stats={stats.empires} />
		{/if}
	</div>
	<div class="col-md-8 col-12">
		<div class="row">
			{#each players as char, i}
			<div class="col-md-4 col-12"><CharacterLink character={char} /></div>
			{/each}
		</div>

	</div>
</div>
{/if}
