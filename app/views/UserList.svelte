<script>
	import axios from 'axios'
	import AccountLink from '../components/AccountLink'
	import PaginatedList from '../components/PaginatedList'
	import ActionButtons from '../components/ActionButtons'
	import ActionModal from '../components/ActionModal.svelte'
	import moment from 'moment'

        export let setURLParam = false;
	export let appAlert
	let userList;

	async function fetch(page) {
		try {
			const resp = await axios.get("/api/users?page="+page)
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
	</div>

	<table slot="body" class="table table-sm table-dark table-responsive-md table-striped table-hover">
	  <thead class="thead-light">
		<th>ID</th>
		<th>Username</th>
		<th>User Created</th>
		<th>Last Login</th>
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

<ActionModal on:action={userList.refresh} />
