<script>
  import { onMount } from 'svelte';
  import axios from 'axios'
  import Alert from '../components/Alert'
  import FactionIcon from '../components/FactionIcon'
  import { selectedPlayer } from '../player';

  onMount(() => {
  get_BEPleaderboard();
  get_CEPleaderboard();
  });

  let bepPlayers = [];
  let cepPlayers = [];
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

  // Define battle rank ranges
  const rankRanges = [
  { rank: 1, minBEP: 0, maxBEP: 999 },
  { rank: 2, minBEP: 1000, maxBEP: 2999 },
  { rank: 3, minBEP: 3000, maxBEP: 7499 },
  { rank: 4, minBEP: 7500, maxBEP: 14999 },
  { rank: 5, minBEP: 15000, maxBEP: 29999 },
  { rank: 6, minBEP: 30000, maxBEP: 44999 },
  { rank: 7, minBEP: 45000, maxBEP: 67499 },
  { rank: 8, minBEP: 67500, maxBEP: 101249 },
  { rank: 9, minBEP: 101250, maxBEP: 126562 },
  { rank: 10, minBEP: 126563, maxBEP: 158202 },
  { rank: 11, minBEP: 158203, maxBEP: 197753 },
  { rank: 12, minBEP: 197754, maxBEP: 247191 },
  { rank: 13, minBEP: 247192, maxBEP: 308989 },
  { rank: 14, minBEP: 308990, maxBEP: 386238 },
  { rank: 15, minBEP: 368239, maxBEP: 482797 },
  { rank: 16, minBEP: 482798, maxBEP: 603496 },
  { rank: 17, minBEP: 603497, maxBEP: 754370 },
  { rank: 18, minBEP: 754371, maxBEP: 942963 },
  { rank: 19, minBEP: 942964, maxBEP: 1178704 },
  { rank: 20, minBEP: 1178705, maxBEP: 1438019 },
  { rank: 21, minBEP: 1438020, maxBEP: 1710300 },
  { rank: 22, minBEP: 1710301, maxBEP: 1988026 },
  { rank: 23, minBEP: 1988027, maxBEP: 2286230 },
  { rank: 24, minBEP: 2286231, maxBEP: 2583440 },
  { rank: 25, minBEP: 2583441, maxBEP: 2908441 },
  { rank: 26, minBEP: 2908442, maxBEP: 3237941 },
  { rank: 27, minBEP: 3237942, maxBEP: 3618441 },
  { rank: 28, minBEP: 3618442, maxBEP: 3988841 },
  { rank: 29, minBEP: 3988842, maxBEP: 4479541 },
  { rank: 30, minBEP: 4479542, maxBEP: 5027341 },
  { rank: 31, minBEP: 5027342, maxBEP: 5789641 },
  { rank: 32, minBEP: 5789642, maxBEP: 6861341 },
  { rank: 33, minBEP: 6861342, maxBEP: 8229241 },
  { rank: 34, minBEP: 8229242, maxBEP: 10000541 },
  { rank: 35, minBEP: 10000542, maxBEP: 11501741 },
  { rank: 36, minBEP: 11501742, maxBEP: 12982641 },
  { rank: 37, minBEP: 12982642, maxBEP: 14897141 },
  { rank: 38, minBEP: 14897142, maxBEP: 16894541 },
  { rank: 39, minBEP: 16894542, maxBEP: 19994541 }
  ];

  // Define command rank ranges
  const crRankRanges = [
  { rank: 0, minCEP: 0, maxCEP: 9999 },
  { rank: 1, minCEP: 10000, maxCEP: 49999 },
  { rank: 2, minCEP: 50000, maxCEP: 149999 },
  { rank: 3, minCEP: 150000, maxCEP: 299999 },
  { rank: 4, minCEP: 300000, maxCEP: 599999 }
  ];


  function getFactionIcon(factionId) {
    if (factionId === 0) {
      return "/img/tr_icon.png";
    } else if (factionId === 1) {
      return "/img/nc_icon.png";
    } else {
      return "/img/vs_icon.png";
    }
  }

  // Function to calculate rank based on BEP
  function calculateRank(bep) {
      // Iterate through rank ranges to find the appropriate rank
      for (const range of rankRanges) {
          if (bep >= range.minBEP && bep <= range.maxBEP) {
              return range.rank;
          }
      }
      // Default rank if BEP doesn't match any range
      return 40;
  }

   // Function to calculate rank based on CEP
    function calculateCrRank(cep) {
        // Iterate through rank ranges to find the appropriate rank
        for (const range of crRankRanges) {
            if (cep >= range.minCEP && cep <= range.maxCEP) {
                return range.rank;
            }
        }
        // Default rank if CEP doesn't match any range
        return 5;
    }

  const handleClick = (clickedPlayer) => {
  selectedPlayer.set({id: clickedPlayer.id, name: clickedPlayer.name, faction_id: clickedPlayer.faction_id, br: calculateRank(clickedPlayer.bep), cr: calculateCrRank(clickedPlayer.cep)});
};

</script>

<svelte:head>
<title>Leaderboard</title>
</svelte:head>
<Alert bind:this={alert} />

<ul class="nav nav-tabs mb-3" id="nav-tab" role="tablist">
  <li class="nav-item">
    <a class="nav-link active" id="br-tab" data-toggle="tab" href="#br" role="tab" aria-controls="br" aria-selected="true">Battle Rank</a>
  </li>
  <li class="nav-item">
    <a class="nav-link" id="cr-tab" data-toggle="tab" href="#cr" role="tab" aria-controls="cr" aria-selected="false">Command Rank</a>
  </li>
  <li class="nav-item">
    <a class="nav-link" id="kills-tab" data-toggle="tab" href="#kills" role="tab" aria-controls="kills" aria-selected="false">Kills</a>
  </li>
</ul>

<div class="tab-content" id="tabs-tabContent">
  <div class="tab-pane show active" id="br" role="tabpanel" aria-labelledby="br-tab">
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
        <a href="/avatar/{player.id}" on:click={() => handleClick(player)}>{player.name}</a>
        </td>
        <td>{calculateRank(player.bep)}</td>
        <td>{calculateCrRank(player.cep)}</td>
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
            <a href="/avatar/{player.id}" on:click={() => handleClick(player)}>{player.name}</a>
            </td>
            <td>{calculateRank(player.bep)}</td>
            <td>{calculateCrRank(player.cep)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    </div>
    <div class="tab-pane" id="kills" role="tabpanel" aria-labelledby="kills-tab">

    </div>
  </div>