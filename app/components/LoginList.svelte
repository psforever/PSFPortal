<script>
	import { onMount } from 'svelte'
	import PaginatedList from './PaginatedList'
	import axios from 'axios'
	import moment from 'moment'

	export let account_id;

	async function fetch(page) {
		try {
			const resp = await axios.get("/api/user/" + account_id + "/logins?page="+page);
			return [resp.data.logins, resp.data.page];
		} catch (e) {
			console.log(e)
			return undefined;
		}
	}

	onMount(async () => {
	});
</script>

<PaginatedList {fetch} let:data={logins} let:pagination={pagination}>
	<p slot="header">
	{#if pagination.item_count}
	Login data
	{:else}
	No logins yet
	{/if}
	</p>
	<table slot="body" class="table table-dark table-responsive">
	  <thead>
		<td>From</td>
		<td>Login Date</td>
	  </thead>

	  <tbody>
	  {#each logins as login, i}
		<tr>
			<td>
				<code>{login.hostname} - {login.ip_address}</code>
			</td>
			<td>{moment(login.login_time).format('MMMM Do YYYY, h:mm:ss a')} ({moment(login.login_time).fromNow()})</td>
		</tr>
	  {/each}
	  </tbody>
	</table>
</PaginatedList>
