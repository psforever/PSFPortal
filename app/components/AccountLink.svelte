<script>
	import { isAdmin } from '../UserState'
	export let account;
</script>

<style>
.banned-account {
	color: red;
	text-decoration: line-through;
}
</style>

<span class="account-link">

	{#if $isAdmin}
	<a class:banned-account={account.inactive} href="/user/{account.id}">{account.name}</a>
	{:else}
	<span class:banned-account={account.inactive}>{account.name}</span>
	{/if}

	{#if account.admin}
	<span class="badge badge-success">Admin</span>
	{/if}
</span>
