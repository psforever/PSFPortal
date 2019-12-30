<script>
	import { onMount } from 'svelte'
	import axios from 'axios'
	import CharacterLink from '../components/CharacterLink'
	import moment from 'moment'

	onMount(async () => {
		axios.get("/api/user/"+userId+"/characters
	});


</script>

{#if characters}
{#each characters as char, i}
<ul>
	<li><CharacterLink character={char} /></li>
</ul>
{/each}
{/if}
