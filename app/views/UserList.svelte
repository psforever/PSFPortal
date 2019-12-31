<script>
  import { onMount }  from 'svelte'
	import AccountLink from '../components/AccountLink'
	import PaginatedList from '../components/PaginatedList'
	import ActionButtons from '../components/ActionButtons'
	import ActionModal from '../components/ActionModal.svelte'
	import { formToJSON } from '../util/form.js'

	import axios from 'axios'
	import moment from 'moment'

        export let setURLParam = false;
	export let appAlert;
	let userList;
	let filter = "";
	let sort = ""

	function handleSort(event) {
	  const ele = event.target;
	  const classes = ele.classList;
	  const thead = ele.parentElement;

	  if (!classes.contains("sortable")) {
	    return;
	  }
	  
	  let found, next = "";
	  let sortstate = {
	    "both" : "asc",
	    "asc" : "desc",
	    "desc" : "asc"
	  }

	  const keys = Object.keys(sortstate);

	  for (let i = 0; i < keys.length; i++) {
	    const k = keys[i];
	    if (classes.contains(k)) {
	      if (!ele.dataset.sort)
		break;

	      found = k;
	      sort = `sort=${ele.dataset.sort}_${sortstate[k]}&`
	      ele.classList.remove(k);
	      ele.classList.add(sortstate[k]);
	      break;
	    }
	  }

	  // invalid sort
	  if (!found) return;

	  // clear other sorts
	  Array.from(thead.children).forEach((child) =>{
	    if (child == ele)
	      return;

	    if (child.classList.contains("sortable")) {
	      child.classList.remove("asc")
	      child.classList.remove("desc")
	      child.classList.add("both")
	    }
	  });

	  userList.refresh()
	}

	function changeFilter(event) {
	  const filters = formToJSON(event.target.form);

	  if (Object.keys(filters).length === 0) {
	    filter = "";
	    userList.refresh()
	    return;
	  }

	  const ufilter = Object.keys(filters).join(",");
	  const url = new URL(window.location.href);
	  url.searchParams.set('ufilter', ufilter);
	  history.replaceState(null, null,
	    url.pathname + url.search + url.hash)

	  filter = `filter=${ufilter}&`
	  // Filter changes go to the first page
	  userList.refresh(1)
	}

	async function fetch(page) {
		try {
			const resp = await axios.get(`/api/users?${filter}${sort}page=${page}`)
			appAlert.message("")
			return [resp.data.users, resp.data.page];
		} catch (e) {
			appAlert.message(e.message)
			return undefined;
		}
	}
</script>

<PaginatedList {setURLParam} bind:this={userList} bind:fetch={fetch} let:data={users} let:pagination={pagination}>
	<div slot="header">
		<p>{pagination.item_count.toLocaleString()} users in the database</p>

		  <div class="dropdown float-right">
		    <button class="btn btn-secondary dropdown-toggle" type="button" id="dropdownMenuButton" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
		      Filter
		    </button>
		    <div class="dropdown-menu dropdown-menu-right" aria-labelledby="dropdownMenuButton">
		      <form on:change={changeFilter} class="px-4 py-3">
			<div class="form-check">
			  <input type="checkbox" class="form-check-input" name="gm" id="userFilterGM">
			  <label class="form-check-label" for="userFilterGM">
			    GM
			  </label>
			</div>
			<div class="form-check">
			  <input type="checkbox" class="form-check-input" name="banned" id="userFilterBanned">
			  <label class="form-check-label" for="userFilterBanned">
			    Banned
			  </label>
			</div>
		      </form>
		    </div>
		  </div>
	</div>

	<table slot="body" class="table table-sm table-dark table-responsive-md table-striped table-hover">
	  <thead on:click={handleSort} class="thead-light">
	    <th data-sort="id" class="sortable both">ID</th>
	    <th data-sort="username" class="sortable both">Username</th>
	    <th data-sort="created" class="sortable both">User Created</th>
	    <th data-sort="last_login" class="sortable both">Last Login</th>
	    <th>Actions</th>
	  </thead>
	  <tbody>
	  {#each users as user, i}
		<tr>
			<th>#{user.id}</th>
			<td><AccountLink account={user} /></td>
			<td>{moment(user.created).fromNow()}</td>
			<td>{#if user.last_login.time}
					{moment(user.last_login.time).fromNow()}<br/>
					<code>{user.last_login.hostname} - {user.last_login.ip}</code>
				{:else}
					Never logged in
				{/if}
			</td>
			<td><ActionButtons account={user} /></td>
		</tr>
	  {/each}
	  </tbody>
	</table>
</PaginatedList>

<ActionModal on:action={() => userList.refresh()} />
