<script>
        import { onMount } from 'svelte'
	import UserList from '../views/UserList'
	import CharacterList from '../views/CharacterList'
	import CharacterLink from '../components/CharacterLink'
	import AccountLink from '../components/AccountLink'
        import { monitor_tabs } from '../util/navigation'
	import axios from 'axios'
	export let appAlert;

	let results;
	async function submitSearch(event) {
		const value = event.target.search.value;

		try {
			const resp = await axios.post("/api/search", { search : value })
			results = resp.data.items;
		} catch (e) {
			appAlert.message(e.message)
		}
	}

        onMount(() => monitor_tabs());
</script>

<svelte:head>
<title>PSForever - Admin Panel</title>
</svelte:head>

<h1>Admin Panel</h1>

<!--<strong>Last account created:</strong> <AccountLink account={stats.last.account} /> (<span title={moment(stats.last.account.created).format(`MMMM Do YYYY, h:mm:ss a`)}>{moment(stats.last.account.created).fromNow()}</span>)<br/>-->

<ul class="nav nav-tabs mb-3" id="nav-tab" role="tablist">
  <li class="nav-item">
    <a class="nav-link active" id="search-tab" data-toggle="tab" href="#search" role="tab" aria-controls="search" aria-selected="true">Search</a>
  </li>
  <li class="nav-item">
    <a class="nav-link" id="users-tab" data-toggle="tab" href="#users" role="tab" aria-controls="home" aria-selected="false">Users</a>
  </li>
  <li class="nav-item">
    <a class="nav-link" id="characters-tab" data-toggle="tab" href="#characters" role="tab" aria-controls="profile" aria-selected="false">Characters</a>
  </li>
</ul>

<div class="tab-content" id="tabs-tabContent">
  <div class="tab-pane show active" id="search" role="tabpanel" aria-labelledby="search-tab">
	  <form name="search" class="form-inline" on:submit|preventDefault={submitSearch}>
	    <div class="form-group mx-sm-3">
	      <input type="text" class="form-control" id="inputSearch" name="search" placeholder="Username/Character Name" minlength=3 required>
	    </div>
		<button type="submit" class="btn btn-primary mb-2">Search</button>
	  </form>
	  {#if results}
	  {#if results.length > 0}
	  <p>{results.length} results found.</p>
	  {:else}
	  <p>No results found.</p>
	  {/if}
	  <ol>
	  {#each results as result, i}
		  {#if result.type == "account"}
		  <li><AccountLink account={result} /></li>
		  {:else if result.type == "character"}
		  <li><CharacterLink character={result} /></li>
		  {/if}
	  {/each}
	  </ol>
	  {/if}
  </div>
  <div class="tab-pane" id="users" role="tabpanel" aria-labelledby="users-tab">
      <UserList setURLParam={true} {appAlert} />
  </div>
  <div class="tab-pane" id="characters" role="tabpanel" aria-labelledby="characters-tab">
	  <CharacterList setURLParam={true} {appAlert} />
  </div>
</div>
