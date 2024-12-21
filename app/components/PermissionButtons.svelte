<script>
	export let avatar;
</script>

{#if avatar.can_spectate}
<button type="button"
	class="btn btn-warning btn-sm"
	data-action="remove_spectate"
	data-avatar-id={avatar.id}
	data-account-name={avatar.name}
	data-toggle="modal"
	data-target="#roleModal">- Spec</button>
{:else}
<button type="button"
	class="btn btn-success btn-sm"
	data-action="add_spectate"
	data-avatar-id={avatar.id}
	data-account-name={avatar.name}
	data-toggle="modal"
	data-target="#roleModal">+ Spec</button>
{/if}
{#if avatar.can_gm}
<button type="button"
	class="btn btn-warning btn-sm"
	data-action="remove_gm"
	data-avatar-id={avatar.id}
	data-account-name={avatar.name}
	data-toggle="modal"
	data-target="#roleModal">- GM</button>
{:else}
<button type="button"
	class="btn btn-success btn-sm"
	data-action="add_gm"
	data-avatar-id={avatar.id}
	data-account-name={avatar.name}
	data-toggle="modal"
	data-target="#roleModal">+ GM</button>
{/if}
