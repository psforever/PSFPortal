<script>
	import { isAdmin } from '../UserState'
	import FactionIcon from './FactionIcon'
	export let character;
</script>

<style>
</style>

{#if $isAdmin}
<a class="character-link" href="/user/{character.account_id}">
	<FactionIcon {character} />
	<span>{character.name}</span>
    {#if character.can_gm}
    <span class="badge badge-success">GM</span>
    {/if}
    {#if character.can_spectate}
    <span class="badge badge-success">Spec</span>
    {/if}
</a>
{:else}
<span class="character-link">
	<FactionIcon {character} />
	<span>{character.name}</span>
</span>
{/if}
