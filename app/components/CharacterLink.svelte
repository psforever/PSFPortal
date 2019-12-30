<script>
	import { isAdmin } from '../UserState'
	export let character;
</script>

<span class="character-link">
	{#if character.faction_id == 1}
	<img height=24 src="/img/nc_icon.png" alt="NC" />
	{:else if character.faction_id == 0}
	<img height=32 src="/img/tr_icon.png" alt="TR" />
	{:else if character.faction_id == 2}
	<img height=32 src="/img/vs_icon.png" alt="VS" />
	{/if}

	{#if $isAdmin}
	<a href="/character/{character.id}">{character.name}</a>
	{:else}
	<span>{character.name}</span>
	{/if}
</span>
