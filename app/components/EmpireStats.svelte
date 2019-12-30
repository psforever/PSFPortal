<script>
	import { onMount } from 'svelte';
	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';

	const progress = tweened(0, {
		delay: 100,
		duration: 1000,
		easing: cubicOut
	});

	export let stats = { "TR" : 0, "NC" : 0, "VS" : 0};
	let total = stats.TR + stats.NC + stats.VS;
	let percentages = { "TR" : stats.TR/total,
		"NC" : stats.NC/total,
		"VS" : stats.VS/total}
	let tr, nc, vs;

	onMount(() => {
		tr.style.height = "1px";
		nc.style.height = "1px";
		vs.style.height = "1px";

		progress.subscribe((v) => {
			if (!tr || !nc || !vs)
				return;

			tr.style.height = v*percentages.TR*200 + "px";
			nc.style.height = v*percentages.NC*200 + "px";
			vs.style.height = v*percentages.VS*200 + "px";
		})

		setTimeout(() => progress.set(1.0), 100);
	})

</script>

<style>
.empire-stats {
  background: black;
  height: 200px;
  width: 220px;
  border: 1px solid white;
  display: inline-block;
  position: relative;
}

.empire-stat {
  border: 1px solid white;
  border-bottom: 0;
  position: absolute;
  bottom: 0;
  text-align: center;
  min-width: 50px;
  min-height: 3em;
}

.empire-stat:nth-child(2) {
  left: 10%;
}

.empire-stat:nth-child(3) {
  left: 40.0%;
}

.empire-stat:nth-child(4) {
  left: 70.0%;
}

.empire-stats-header {
  display: inline;
  position: absolute;
  width: 100%;
  padding-top: 3px;
  padding-bottom: 3px;
  background: white;
  border-bottom: 3px solid black;
  font-size: 1.0em;
  color: black;
  text-align: center;
  z-index: 0;
}

</style>

<div class="empire-stats clearfix">
	<div class="empire-stats-header">Empire Need</div>
	<div title={stats.TR} bind:this={tr} class="empire-stat faction-tr-bg"><strong>TR</strong><br/>{Math.round(percentages.TR*100*$progress)}%</div>
	<div title={stats.NC} bind:this={nc} class="empire-stat faction-nc-bg"><strong>NC</strong><br/>{Math.round(percentages.NC*100*$progress)}%</div>
	<div title={stats.VS} bind:this={vs} class="empire-stat faction-vs-bg"><strong>VS</strong><br/>{Math.round(percentages.VS*100*$progress)}%</div>
</div>
