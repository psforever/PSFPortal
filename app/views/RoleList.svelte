<script>
	import { onMount } from 'svelte'
	import axios from 'axios'
	import CharacterLink from '../components/CharacterLink'
	import PermissionButtons from '../components/PermissionButtons'
	import PaginatedList from '../components/PaginatedList'
    import RoleModal from '../components/RoleModal.svelte'

	import moment from 'moment'
        export let setURLParam = true;

	export let appAlert;
    let roleList;

	async function fetch(page) {
		try {
			const resp = await axios.get("/api/roles?page="+page)
			appAlert.message("")
			return [resp.data.characters, resp.data.page];
		} catch (e) {
			appAlert.message(e.message)
			return undefined;
		}
	}
</script>

<PaginatedList {setURLParam} URLSearchName='page_role' bind:this={roleList} bind:fetch={fetch} let:data={roles} let:pagination={pagination}>
	<div slot="header">
		<p>{pagination.item_count.toLocaleString()} characters in the database have a role assigned</p>
	</div>

	<table slot="body" class="table table-sm table-dark table-responsive-md table-striped table-hover">
	  <thead class="thead-light">
		<th>ID</th>
		<th>Name</th>
		<th>Last Played</th>
		<th>Actions</th>
	  </thead>
	  <tbody>
	  {#each roles as char, i}
		<tr>
			<td>#{char.id}</td>
			<td><CharacterLink character={char} /></td>
			<td>{moment(char.last_login).fromNow()}</td>
			<td><PermissionButtons avatar={char} /></td>
		</tr>
	  {/each}
	  </tbody>
	</table>
</PaginatedList>

<RoleModal on:action={() => roleList.refresh()} />