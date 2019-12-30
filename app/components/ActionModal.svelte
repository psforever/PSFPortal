<script>
	import { onMount } from 'svelte';
	import axios from 'axios'
	import Alert from './Alert'
	import jq from 'jquery'

	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	let modalAlert;

	onMount(() => setup_actions());

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
					dispatch('action', {
						target: account_id,
						action: action_type,
					});
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
