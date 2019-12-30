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
	<table slot="body" class="table table-dark table-responsive">
	  <thead>
		<td>Login Time</td>
	  </thead>

	  <tbody>
	  {#each logins as login, i}
		<tr>
			<td>{moment(login.login_time).fromNow()}</td>
		</tr>
	  {/each}
	  </tbody>
	</table>
</PaginatedList>
