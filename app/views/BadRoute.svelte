<script>
	import { onMount } from 'svelte';
	import axios from 'axios'
	export let params;

	onMount(async () => {
		try {
			await axios.post("/api/bad_route", {"route": params[0]})
		} catch (e) {
		}
	});
</script>

<div class="mt-3 text-center">
	<img alt="404" src="/img/404.png" />
	<h1>404 - PlanetSide Not Found</h1>
</div>
