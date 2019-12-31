<script>
	import { onMount } from 'svelte'
	import axios from 'axios'
	import CharacterLink from '../components/CharacterLink'
	import PaginatedList from '../components/PaginatedList'
	import moment from 'moment'
        export let setURLParam = true;

	export let appAlert

	async function fetch(page) {
		try {
			const resp = await axios.get("/api/characters?page="+page)
			appAlert.message("")
			return [resp.data.characters, resp.data.page];
		} catch (e) {
			appAlert.message(e.message)
			return undefined;
		}
	}
</script>

<PaginatedList {setURLParam} URLSearchName='page_char' bind:fetch={fetch} let:data={characters} let:pagination={pagination}>
	<div slot="header">
		<p>{pagination.item_count.toLocaleString()} characters in the database</p>
	</div>

	<table slot="body" class="table table-sm table-dark table-responsive-md table-striped table-hover">
	  <thead class="thead-light">
		<th>ID</th>
		<th>Name</th>
		<th>Last Played</th>
		<th>Created</th>
	  </thead>
	  <tbody>
	  {#each characters as char, i}
		<tr>
			<td>#{char.id}</td>
			<td><CharacterLink character={char} /></td>
			<td>{moment(char.last_login).fromNow()}</td>
			<td>{moment(char.created).fromNow()}</td>
		</tr>
	  {/each}
	  </tbody>
	</table>
</PaginatedList>
