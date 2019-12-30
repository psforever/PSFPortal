<script>
	import { onMount } from 'svelte'
	import axios from 'axios'
	import AccountLink from '../components/AccountLink'
	import PaginatedList from '../components/PaginatedList'
	import Alert from '../components/Alert'
	import moment from 'moment'
	import jq from 'jquery'

	export let appAlert
	let modalAlert, userList;

	onMount(() => setup_actions());

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

	function setup_actions() {
		const modal = jq('#actionModal');

		modal.on('hide.bs.modal', () => modalAlert.message(""));
		modal.on('show.bs.modal', (event) => {
			const button = jq(event.relatedTarget) // Button that triggered the modal
			const username = button.data('account-name')
			const account_id = button.data('account-id')
			const action_type = button.data('action')
			const action_name = button.text();

			modal.find('.modal-title').text("Confirm " + action_name)
			modal.find('.modal-body p').text("Are you sure you want to perform this action on \'" + username + "\'?")

			const submit = modal.find('.modal-footer .btn-primary')

			submit.text(action_name)
			// remove ALL previous click handlers
			submit.off()

			submit.click(async (event) => {
				submit.addClass("disabled")

				try {
					await axios.post("/api/user/"+ account_id + "/" + action_type)
					await userList.refresh()
					modal.modal('hide')
				} catch (e) {
					modalAlert.message(e.message)
				} finally {
					submit.removeClass("disabled")
				}
			});
		})
	}
</script>

<PaginatedList bind:this={userList} bind:fetch={fetch} let:data={users} let:pagination={pagination}>
	<div slot="header">
		<p>{pagination.item_count.toLocaleString()} users in the database</p>
	</div>

	<table slot="body" class="table table-dark table-responsive">
	  <thead>
		<td>ID</td>
		<td>Username</td>
		<td>User Created</td>
		<td>Last Login</td>
		<td>Actions</td>
	  </thead>
	  <tbody>
	  {#each users as user, i}
		<tr>
			<td>#{user.id}</td>
			<td><AccountLink account={user} /></td>
			<td>{moment(user.created).fromNow()}</td>
			<td>{#if user.last_login.time}
					{moment(user.last_login.time).fromNow()}<br/>
					<code>{user.last_login.hostname} - {user.last_login.ip}</code>
				{:else}
					Never logged in
				{/if}
			</td>
			<td>
				{#if user.inactive}
				<button type="button"
					class="btn btn-warning btn-sm"
					data-action="unban"
					data-account-id={user.id}
					data-account-name={user.name}
					data-toggle="modal"
					data-target="#actionModal">Unban</button>
				{:else}
				<button type="button"
					class="btn btn-danger btn-sm"
					data-action="ban"
					data-account-id={user.id}
					data-account-name={user.name}
					data-toggle="modal"
					data-target="#actionModal">Ban</button>
				{#if user.admin}
				<button type="button"
					class="btn btn-warning btn-sm"
					data-action="remove_gm"
					data-account-id={user.id}
					data-account-name={user.name}
					data-toggle="modal"
					data-target="#actionModal">Remove GM</button>
				{:else}
				<button type="button"
					class="btn btn-success btn-sm"
					data-action="add_gm"
					data-account-id={user.id}
					data-account-name={user.name}
					data-toggle="modal"
					data-target="#actionModal">Make GM</button>
				{/if}
				{/if}
			</td>
		</tr>
	  {/each}
	  </tbody>
	</table>
</PaginatedList>

<div class="modal fade" id="actionModal" tabindex="-1" role="dialog" aria-labelledby="exampleModalLabel" aria-hidden="true">
  <div class="modal-dialog" role="document">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="exampleModalLabel">Perform Action</h5>
        <button type="button" class="close" data-dismiss="modal" aria-label="Close">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div class="modal-body">
		  <Alert bind:this={modalAlert} />
		  <p>Are you sure?</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-dismiss="modal">No</button>
        <button type="button" class="btn btn-primary">Yes</button>
      </div>
    </div>
  </div>
</div>
