<script>
  import { onMount } from 'svelte';
  import axios from 'axios'
  import Alert from '../components/Alert'
  import { bepRanges, cepRanges, calculateBr, calculateCr, getFactionIcon, getFactionName,
           weaponNames, getWeaponName } from '../statFunctions';

  onMount(() => {
  get_iWeaponStats();
  get_avatar();
  get_avatarKdByDate();
  });

  export let params;

  let iWeapons = [];
  let alert;
  let avatar = {};
  let iWeaponsKillsSum
  let kdByDate = [];
  let url = params.id || avatar.id
  let face;
  let totalKills
  let totalDeaths

  const weaponstatsUrl = "/api/weaponstats/"+url
  const avatarUrl = "/api/avatar/"+url
  const avatarKdUrl = "/api/avatar/"+url+"/kd_byDate"

  async function get_avatar() {
    try {
      const resp = await axios.get(avatarUrl);
      avatar = resp.data
      const head = avatar.gender.toString() + avatar.head.toString();
      face = "/img/faces/" + head + ".png";
      // Reset alert message if needed
      alert.message("");
    } catch (e) {
      console.log(e);
      alert.message("Failed to fetch stats from server");
    }
  }

  async function get_avatarKdByDate() {
    try {
      const resp = await axios.get(avatarKdUrl);
      const stats = resp.data;
      kdByDate = stats.kd;
      totalKills = kdByDate.reduce((total, kd) => total + kd.kills, 0);
      totalDeaths = kdByDate.reduce((total, kd) => total + kd.deaths, 0);
      // Reset alert message if needed
      alert.message("");
    } catch (e) {
      console.log(e);
      alert.message("Failed to fetch stats from server");
    }
  }

  async function get_iWeaponStats() {
    try {
      const ids = [55, 56, 57, 140, 146, 175, 233, 299, 304, 324, 334, 345, 396, 406,
      407, 411, 425, 429, 462, 468, 556, 587, 588, 589, 599, 673, 680, 701, 706, 714,
      716, 730, 737, 817, 838, 845, 864, 888, 889, 890, 968, 969, 970];
      const resp = await axios.get(weaponstatsUrl);
      const stats = resp.data;
      const filteredWeapons = stats.weapons.filter(weapon => {
      return ids.includes(weapon.weapon_id);
      });

      filteredWeapons.forEach(weapon => {
            switch (weapon.weapon_id) {
              case 304:
                weapon.shots_fired = Math.ceil(weapon.shots_fired / 36);
                weapon.shots_landed = Math.ceil(weapon.shots_landed / 8);
                break;
              case 411:
                weapon.shots_fired = Math.ceil(weapon.shots_fired / 21);
                weapon.shots_landed = Math.ceil(weapon.shots_landed / 6);
                break;
              case 588:
                weapon.shots_fired = Math.ceil(weapon.shots_fired / 55);
                weapon.shots_landed = Math.ceil(weapon.shots_landed / 10);
                break;
              case 714:
                weapon.shots_fired = Math.ceil(weapon.shots_fired / 36);
                weapon.shots_landed = Math.ceil(weapon.shots_landed / 8);
                break;
              default:
                break;
            }
          });

      iWeapons = filteredWeapons;
      iWeaponsKillsSum = iWeapons.reduce((total, weapon) => total + weapon.kills, 0);
      // Reset alert message if needed
      alert.message("");
      } catch (e) {
        console.log(e);
        alert.message("Failed to fetch stats from server");
       }
   }

</script>

<svelte:head>
<title>Player Stats</title>
</svelte:head>

<table width="70%">
  <tbody>
    <tr>
    <td width="%50" valign="top">
     <table>
      <tbody>
       <tr>
        <td>
    <span style="color:lightgrey;">Character Name:</span> {avatar.name}<br>
    <span style="color:lightgrey;">Empire:</span> {getFactionName(avatar.faction)}
        </td>
        <td><img height="60" src={getFactionIcon(avatar.faction)} alt={avatar.faction}/></td>
        </tr>
        <tr>
        <td><img height="100" src={face} alt="{face} not found"/></td>
        </tr>
  </tbody>
</table>
  <span style="color:lightgrey;">Battle Rank:</span> {calculateBr(avatar.bep)}<br>
  <span style="color:lightgrey;">Command Rank:</span> {calculateCr(avatar.cep)}<br>
  <span style="color:lightgrey;">Kills:</span> {totalKills}<br>
  <span style="color:lightgrey;">Deaths:</span> {totalDeaths}<br>
  <span style="color:lightgrey;">KDR:</span>
  {#if totalDeaths !== 0}
  {(totalKills / totalDeaths).toFixed(2)}
  {:else}
  {totalKills}
  {/if}
   </td>
   </tr>
  </tbody>
</table>
<br>
<br>
<span style="color:lightgrey;">Kills by Weapon - Total: </span>{iWeaponsKillsSum}
 <table class="table table-sm table-dark table-responsive-md table-striped table-hover">
  <thead class="thead-light">
      <th>Weapon</th>
      <th>Kills</th>
      <th>Assists</th>
      <th>Shots Fired</th>
      <th>Shots Landed</th>
      <th>Accuracy</th>
  </thead>
  <tbody>
    {#each iWeapons as weapon}
      <tr>
        <td>{getWeaponName(weapon.weapon_id)}</td>
        <td>{weapon.kills}</td>
        <td>{weapon.assists}</td>
        <td>{weapon.shots_fired}</td>
        <td>{weapon.shots_landed}</td>
        <td>{((weapon.shots_landed / weapon.shots_fired) * 100).toFixed(2)}%</td>
      </tr>
    {/each}
  </tbody>
 </table>
 <br>
<span style="color:lightgrey;">Daily Stats</span>
<table class="table table-sm table-dark table-responsive-md table-striped table-hover">
  <thead class="thead-light">
      <th>Date</th>
      <th>Kills</th>
      <th>Deaths</th>
      <th>KDR</th>
  </thead>
  <tbody>
    {#each kdByDate as date}
      <tr>
        <td>{date.date}</td>
        <td>{date.kills}</td>
        <td>{date.deaths}</td>
        <td>{#if date.deaths !== 0}
            {(date.kills / date.deaths).toFixed(2)}
            {:else}
            {date.kills}
            {/if}
        </td>
      </tr>
    {/each}
  </tbody>
</table>
