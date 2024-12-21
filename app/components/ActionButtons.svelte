<script>
	export let account;
</script>

{#if account.inactive}
<button type="button"
	class="btn btn-warning btn-sm"
	data-action="unban"
	data-account-id={account.id}
	data-account-name={account.name}
	data-toggle="modal"
	data-target="#actionModal">Unban</button>
{:else}
<button type="button"
	class="btn btn-danger btn-sm"
	data-action="ban"
	data-account-id={account.id}
	data-account-name={account.name}
	data-toggle="modal"
	data-target="#actionModal">Ban</button>
{#if account.admin}
<button type="button"
	class="btn btn-warning btn-sm"
	data-action="remove_gm"
	data-account-id={account.id}
	data-account-name={account.name}
	data-toggle="modal"
	data-target="#actionModal">Remove Admin</button>
{:else}
<button type="button"
	class="btn btn-success btn-sm"
	data-action="add_gm"
	data-account-id={account.id}
	data-account-name={account.name}
	data-toggle="modal"
	data-target="#actionModal">Make Admin</button>
{/if}
{/if}
