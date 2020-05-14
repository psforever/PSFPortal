<script>
	import { onMount } from 'svelte';
	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';

	export let progress = tweened(0, {
		delay: 100,
		duration: 1000,
		easing: cubicOut
	});

	export let stats = { "TR" : 0, "NC" : 0, "VS" : 0};
	let total = 0
	$: { 
		total = stats.TR + stats.NC + stats.VS;
		if (total == 0)
			total = 1
	}
	$: percentages = { "TR" : stats.TR/total,
		"NC" : stats.NC/total,
		"VS" : stats.VS/total}

	let tr = 1, nc = 1, vs = 1;
	let tr_to = 1, nc_to = 1, vs_to = 1;
	let tr_from = 1, nc_from = 1, vs_from = 1;

	function update(v) {
		tr = tr_from + (tr_to-tr_from)*v;
		nc = nc_from + (nc_to-nc_from)*v;
		vs = vs_from + (vs_to-vs_from)*v;
	}

	export function refresh() {
		tr_from = tr
		nc_from = nc
		vs_from = vs

		tr_to = percentages.TR*165
		nc_to = percentages.NC*165
		vs_to = percentages.VS*165

		if (tr_from == tr_to && nc_from == nc_to &&
				vs_from == vs_to)
			return

		progress = tweened(0, {
			delay: 100,
			duration: 1000,
			easing: cubicOut
		});

		progress.subscribe((v) => {
			update(v)
		})

		setTimeout(() => progress.set(1.0), 100);
	}

	onMount(() => {
		refresh()
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

.empire-stats:before {
    content: ' ';
    display: block;
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
    opacity: 0.4;
    background-image: url('/img/logo_crop.png');
    background-repeat: no-repeat;
    background-position: center;
}

.empire-stat {
  border: 1px solid white;
  border-bottom: 0;
  position: absolute;
  bottom: 0;
  text-align: center;
  min-width: 50px;
  min-height: 3em;
  text-shadow: 2px 2px #000000;
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
	<div class="empire-stats-header">Empire %</div>
	<div title="{stats.TR} TR" style="height: {tr}px" class="empire-stat faction-tr-bg"><strong>TR</strong><br/>{Math.round(percentages.TR*100*$progress)}%</div>
	<div title="{stats.NC} NC" style="height: {nc}px" class="empire-stat faction-nc-bg"><strong>NC</strong><br/>{Math.round(percentages.NC*100*$progress)}%</div>
	<div title="{stats.VS} VS" style="height: {vs}px" class="empire-stat faction-vs-bg"><strong>VS</strong><br/>{Math.round(percentages.VS*100*$progress)}%</div>
</div>
