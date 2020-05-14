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
</a>
{:else}
<span class="character-link">
	<FactionIcon {character} />
	<span>{character.name}</span>
</span>
{/if}
