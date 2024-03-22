<script>
  import { onMount } from 'svelte';
  import axios from 'axios'
  import Alert from '../components/Alert'
  import { bepRanges, cepRanges, calculateBr, calculateCr, getFactionIcon } from '../statFunctions';

  onMount(() => {
  get_BEPleaderboard();
  get_CEPleaderboard();
  get_kills();
  get_topDateKills();
  });

  let bepPlayers = [];
  let cepPlayers = [];
  let kills = [];
  let dateKills = [];
  let alert;

  async function get_BEPleaderboard() {
    try {
      const resp = await axios.get("/api/char_stats_bep/0");
      const stats = resp.data;
      bepPlayers = stats.players;
      // Reset alert message if needed
      alert.message("");
    } catch (e) {
      console.log(e);
      alert.message("Failed to fetch stats from server");
    }
  }

  async function get_CEPleaderboard() {
    try {
      const resp = await axios.get("/api/char_stats_cep/0");
      const stats = resp.data;
      cepPlayers = stats.players;
      // Reset alert message if needed
      alert.message("");
    } catch (e) {
      console.log(e);
      alert.message("Failed to fetch stats from server");
    }
  }

  async function get_kills() {
    try {
      const resp = await axios.get("/api/top_kills");
      const stats = resp.data;
      kills = stats.kills;
      // Reset alert message if needed
      alert.message("");
    } catch (e) {
      console.log(e);
      alert.message("Failed to fetch stats from server");
    }
  }

  async function get_topDateKills() {
    try {
      const resp = await axios.get("/api/top_kills_byDate");
      const stats = resp.data;
      dateKills = stats.kills;
      // Reset alert message if needed
      alert.message("");
    } catch (e) {
      console.log(e);
      alert.message("Failed to fetch stats from server");
    }
  }

</script>

<svelte:head>
<title>Leaderboard</title>
</svelte:head>
<Alert bind:this={alert} />

<ul class="nav nav-tabs mb-3" id="nav-tab" role="tablist">
  <li class="nav-item">
    <a class="nav-link active" id="kills-tab" data-toggle="tab" href="#kills" role="tab" aria-controls="kills" aria-selected="true">Kills</a>
  </li>
  <li class="nav-item">
    <a class="nav-link" id="br-tab" data-toggle="tab" href="#br" role="tab" aria-controls="br" aria-selected="false">Battle Rank</a>
  </li>
  <li class="nav-item">
    <a class="nav-link" id="cr-tab" data-toggle="tab" href="#cr" role="tab" aria-controls="cr" aria-selected="false">Command Rank</a>
  </li>
  <li class="nav-item">
    <a class="nav-link" id="top-tab" data-toggle="tab" href="#top" role="tab" aria-controls="top" aria-selected="false">Top X</a>
  </li>
</ul>

<div class="tab-content" id="tabs-tabContent">
  <div class="tab-pane" id="br" role="tabpanel" aria-labelledby="br-tab">
 <table class="table table-sm table-dark table-responsive-md table-striped table-hover">
  <thead class="thead-light">
      <th>#</th>
      <th>Name</th>
      <th>BR</th>
      <th>CR</th>
  </thead>
  <tbody>
    {#each bepPlayers as player, $index}
      <tr>
        <td>{$index + 1}</td>
        <td>
        <img height="24" src={getFactionIcon(player.faction_id)} alt={player.faction_id} />
        <a href="/avatar/{player.id}">{player.name}</a>
        </td>
        <td>{calculateBr(player.bep)}</td>
        <td>{calculateCr(player.cep)}</td>
      </tr>
    {/each}
  </tbody>
 </table>
</div>

<div class="tab-pane" id="cr" role="tabpanel" aria-labelledby="cr-tab">
    <table class="table table-sm table-dark table-responsive-md table-striped table-hover">
      <thead class="thead-light">
          <th>#</th>
          <th>Name</th>
          <th>BR</th>
          <th>CR</th>
      </thead>
      <tbody>
        {#each cepPlayers as player, $index}
          <tr>
            <td>{$index + 1}</td>
            <td>
            <img height="24" src={getFactionIcon(player.faction_id)} alt={player.faction_id} />
            <a href="/avatar/{player.id}">{player.name}</a>
            </td>
            <td>{calculateBr(player.bep)}</td>
            <td>{calculateCr(player.cep)}</td>
          </tr>
        {/each}
     </tbody>
  </table>
</div>

<div class="tab-pane show active" id="kills" role="tabpanel" aria-labelledby="kills-tab">
    <table class="table table-sm table-dark table-responsive-md table-striped table-hover">
      <thead class="thead-light">
          <th>#</th>
          <th>Name</th>
          <th>Kills</th>
          <th>BR</th>
          <th>CR</th>
      </thead>
      <tbody>
        {#each kills as killer, $index}
          <tr>
            <td>{$index + 1}</td>
            <td>
            <img height="24" src={getFactionIcon(killer.faction_id)} alt={killer.faction_id} />
            <a href="/avatar/{killer.killer_id}">{killer.name}</a>
            </td>
            <td>{killer.count}</td>
            <td>{calculateBr(killer.bep)}</td>
            <td>{calculateCr(killer.cep)}</td>
          </tr>
        {/each}
     </tbody>
  </table>
</div>

  <div class="tab-pane" id="top" role="tabpanel" aria-labelledby="top-tab">
  <span style="color:lightgrey; text-align:center;">Top 50 Characters Most Daily Kills</span>
 <table class="table table-sm table-dark table-responsive-md table-striped table-hover">
  <thead class="thead-light">
      <th>#</th>
      <th>Date</th>
      <th>Name</th>
      <th>Kills</th>
  </thead>
  <tbody>
    {#each dateKills as player, $index}
      <tr>
        <td>{$index + 1}</td>
        <td>{player.f_kill_date}</td>
        <td>
        <img height="24" src={getFactionIcon(player.faction_id)} alt={player.faction_id} />
        <a href="/avatar/{player.killer_id}">{player.name}</a>
        </td>
        <td>{player.kill_count}</td>
      </tr>
    {/each}
  </tbody>
 </table>
</div>
</div>