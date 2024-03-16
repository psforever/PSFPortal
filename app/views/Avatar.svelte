<script>
  import { onMount } from 'svelte';
  import axios from 'axios'
  import Alert from '../components/Alert'
  import FactionIcon from '../components/FactionIcon'
  import { selectedPlayer } from '../player';

  onMount(() => {
  get_weaponStats();
  });

  let player; // Define player variable to hold player data
  let weapons = [];
  let alert;

  // Subscribe to the selectedPlayer store to get the selected player data
  selectedPlayer.subscribe(value => {
    player = value; // Assign selected player data to player variable
  });

  const url = "/api/avatar/"+$selectedPlayer.id+"/weaponstats"

  async function get_weaponStats() {
    try {
      const resp = await axios.get(url);
      const stats = resp.data;
      weapons = stats.weapons;
      // Reset alert message if needed
      alert.message("");
      } catch (e) {
        console.log(e);
        alert.message("Failed to fetch stats from server");
       }
   }

  // Function to get weapon name from id
  function getWeaponName(weapon_id) {
      // Iterate through weapons
      for (const weapon of weaponNames) {
          if (weapon_id === weapon.id) {
              return weapon.name;
          }
      }
      // Missing
      return "unknown";
  }

const weaponNames = [
{ id: 2, name: '12mm_chaingun type weapon' },
{ id: 8, name: '15mm_chaingun type weapon' },
{ id: 12, name: '20mm_cannon type weapon' },
{ id: 13, name: '20mm_cannon_deliverer type weapon' },
{ id: 14, name: '20mm_cannon_dropship type weapon' },
{ id: 15, name: '20mm_cannon_dropship_l type weapon' },
{ id: 23, name: '75mm_cannon type weapon' },
{ id: 24, name: '75mm_lightning type weapon' },
{ id: 32, name: 'ace type weapon' },
{ id: 33, name: 'ace_deployable type weapon' },
{ id: 39, name: 'advanced_ace type weapon' },
{ id: 40, name: 'advanced_missile_launcher_t type weapon' },
{ id: 55, name: 'Spear' },
{ id: 56, name: 'Stinger' },
{ id: 57, name: 'Eraser' },
{ id: 63, name: 'apc_ballgun_l type weapon' },
{ id: 64, name: 'apc_ballgun_r type weapon' },
{ id: 69, name: 'apc_weapon_systema type weapon' },
{ id: 70, name: 'apc_weapon_systemb type weapon' },
{ id: 71, name: 'apc_weapon_systemc type weapon' },
{ id: 72, name: 'apc_weapon_systemc_nc type weapon' },
{ id: 73, name: 'apc_weapon_systemc_tr type weapon' },
{ id: 74, name: 'apc_weapon_systemc_vs type weapon' },
{ id: 75, name: 'apc_weapon_systemd type weapon' },
{ id: 76, name: 'apc_weapon_systemd_nc type weapon' },
{ id: 77, name: 'apc_weapon_systemd_tr type weapon' },
{ id: 78, name: 'apc_weapon_systemd_vs type weapon' },
{ id: 85, name: 'aphelion_immolation_cannon type weapon' },
{ id: 88, name: 'aphelion_laser type weapon' },
{ id: 90, name: 'aphelion_laser_left type weapon' },
{ id: 92, name: 'aphelion_laser_right type weapon' },
{ id: 98, name: 'aphelion_plasma_rocket_pod type weapon' },
{ id: 100, name: 'aphelion_ppa type weapon' },
{ id: 102, name: 'aphelion_ppa_left type weapon' },
{ id: 104, name: 'aphelion_ppa_right type weapon' },
{ id: 105, name: 'aphelion_starfire type weapon' },
{ id: 107, name: 'aphelion_starfire_left type weapon' },
{ id: 109, name: 'aphelion_starfire_right type weapon' },
{ id: 119, name: 'aurora_weapon_systema type weapon' },
{ id: 120, name: 'aurora_weapon_systemb type weapon' },
{ id: 136, name: 'battlewagon_weapon_systema type weapon' },
{ id: 137, name: 'battlewagon_weapon_systemb type weapon' },
{ id: 138, name: 'battlewagon_weapon_systemc type weapon' },
{ id: 139, name: 'battlewagon_weapon_systemd type weapon' },
{ id: 140, name: 'Beamer' },
{ id: 146, name: 'Bolt Driver' },
{ id: 175, name: 'Knife (TR)' },
{ id: 177, name: 'chaingun_p type weapon' },
{ id: 185, name: 'colossus_burster type weapon' },
{ id: 187, name: 'colossus_burster_left type weapon' },
{ id: 189, name: 'colossus_burster_right type weapon' },
{ id: 190, name: 'colossus_chaingun type weapon' },
{ id: 192, name: 'colossus_chaingun_left type weapon' },
{ id: 194, name: 'colossus_chaingun_right type weapon' },
{ id: 196, name: 'colossus_cluster_bomb_pod type weapon' },
{ id: 198, name: 'colossus_dual_100mm_cannons type weapon' },
{ id: 204, name: 'colossus_tank_cannon type weapon' },
{ id: 206, name: 'colossus_tank_cannon_left type weapon' },
{ id: 208, name: 'colossus_tank_cannon_right type weapon' },
{ id: 233, name: 'Cycler' },
{ id: 234, name: 'cycler_v2 type weapon' },
{ id: 235, name: 'cycler_v3 type weapon' },
{ id: 236, name: 'cycler_v4 type weapon' },
{ id: 262, name: 'dropship_rear_turret type weapon' },
{ id: 274, name: 'energy_gun type weapon' },
{ id: 276, name: 'energy_gun_nc type weapon' },
{ id: 278, name: 'energy_gun_tr type weapon' },
{ id: 280, name: 'energy_gun_vs type weapon' },
{ id: 298, name: 'flail_weapon type weapon' },
{ id: 299, name: 'Dragon' },
{ id: 304, name: 'Sweeper' },
{ id: 306, name: 'flux_cannon_thresher type weapon' },
{ id: 309, name: 'fluxpod type weapon' },
{ id: 324, name: 'Knife (VS)' },
{ id: 334, name: 'Frag Grenade' },
{ id: 336, name: 'fury_weapon_systema type weapon' },
{ id: 339, name: 'galaxy_gunship_cannon type weapon' },
{ id: 340, name: 'galaxy_gunship_gun type weapon' },
{ id: 342, name: 'galaxy_gunship_tailgun type weapon' },
{ id: 345, name: 'Gauss' },
{ id: 346, name: 'gauss_cannon type weapon' },
{ id: 371, name: 'grenade_launcher_marauder type weapon' },
{ id: 394, name: 'heavy_rail_beam_magrider type weapon' },
{ id: 396, name: 'Heavy Scout Rifle' },
{ id: 398, name: 'hellfire type weapon' },
{ id: 406, name: 'Phoenix' },
{ id: 407, name: 'AMP' },
{ id: 411, name: 'Scatter Pistol' },
{ id: 421, name: 'katana type weapon' },
{ id: 425, name: 'Lancer' },
{ id: 429, name: 'Lasher' },
{ id: 433, name: 'liberator_25mm_cannon type weapon' },
{ id: 435, name: 'liberator_bomb_bay type weapon' },
{ id: 440, name: 'iberator_weapon_system type weapon' },
{ id: 445, name: 'lightgunship_weapon_system type weapon' },
{ id: 448, name: 'lightning_weapon_system type weapon' },
{ id: 462, name: 'Maelstrom' },
{ id: 468, name: 'Knife (NC)' },
{ id: 534, name: 'mediumtransport_weapon_systemA type weapon' },
{ id: 535, name: 'mediumtransport_weapon_systemB type weapon' },
{ id: 556, name: 'Mini-Chaingun' },
{ id: 587, name: 'Falcon MAX' },
{ id: 588, name: 'Scattercannon MAX' },
{ id: 589, name: 'Sparrow MAX' },
{ id: 599, name: 'Scorpion' },
{ id: 628, name: 'particle_beam_magrider type weapon' },
{ id: 629, name: 'pellet_gun type weapon' },
{ id: 636, name: 'peregrine_dual_machine_gun type weapon' },
{ id: 638, name: 'peregrine_dual_machine_gun_left type weapon' },
{ id: 640, name: 'peregrine_dual_machine_gun_right type weapon' },
{ id: 641, name: 'peregrine_dual_rocket_pods type weapon' },
{ id: 644, name: 'peregrine_mechhammer type weapon' },
{ id: 646, name: 'peregrine_mechhammer_left type weapon' },
{ id: 648, name: 'peregrine_mechhammer_right type weapon' },
{ id: 652, name: 'peregrine_particle_cannon type weapon' },
{ id: 658, name: 'peregrine_sparrow type weapon' },
{ id: 660, name: 'peregrine_sparrow_left type weapon' },
{ id: 662, name: 'peregrine_sparrow_right type weapon' },
{ id: 666, name: 'phalanx_avcombo type weapon' },
{ id: 668, name: 'phalanx_flakcombo type weapon' },
{ id: 670, name: 'phalanx_sgl_hevgatcan type weapon' },
{ id: 672, name: 'phantasm_12mm_machinegun type weapon' },
{ id: 673, name: 'Decimator' },
{ id: 680, name: 'Plasma Grenade' },
{ id: 699, name: 'prowler_weapon_systemA type weapon' },
{ id: 700, name: 'prowler_weapon_systemB type weapon' },
{ id: 701, name: 'Pulsar' },
{ id: 705, name: 'pulsed_particle_accelerator type weapon' },
{ id: 706, name: 'Punisher' },
{ id: 709, name: 'quadassault_weapon_system type weapon' },
{ id: 714, name: 'Jackhammer' },
{ id: 716, name: 'Radiator' },
{ id: 730, name: 'Repeater' },
{ id: 737, name: 'Rocklet Rifle' },
{ id: 740, name: 'rotarychaingun_mosquito type weapon' },
{ id: 743, name: 'router_telepad type weapon' },
{ id: 747, name: 'scythe type weapon' },
{ id: 761, name: 'six_shooter type weapon' },
{ id: 788, name: 'skyguard_weapon_system type weapon' },
{ id: 817, name: 'Spiker' },
{ id: 822, name: 'spitfire_aa_weapon type weapon' },
{ id: 827, name: 'spitfire_weapon type weapon' },
{ id: 838, name: 'Striker' },
{ id: 845, name: 'Suppressor' },
{ id: 864, name: 'Thumper' },
{ id: 866, name: 'thunderer_weapon_systema type weapon' },
{ id: 867, name: 'thunderer_weapon_systemb type weapon' },
{ id: 888, name: 'Burster MAX' },
{ id: 889, name: 'Dual Cycler MAX' },
{ id: 890, name: 'Pounder MAX' },
{ id: 927, name: 'vanguard_weapon_system type weapon' },
{ id: 945, name: 'vanu_sentry_turret_weapon type weapon' },
{ id: 968, name: 'Comet MAX' },
{ id: 969, name: 'Quasar MAX' },
{ id: 970, name: 'Starfire MAX' },
{ id: 987, name: 'vulture_bomb_bay type weapon' },
{ id: 990, name: 'vulture_nose_weapon_system type weapon' },
{ id: 992, name: 'vulture_tail_cannon type weapon' },
{ id: 1002, name: 'wasp_weapon_system type weapon' },
{ id: 1003, name: 'winchester type weapon' }
]

  function getFactionIcon(factionId) {
    if (factionId === 0) {
      return "/img/tr_icon.png";
    } else if (factionId === 1) {
      return "/img/nc_icon.png";
    } else {
      return "/img/vs_icon.png";
    }
  }

    function getFactionName(factionId) {
      if (factionId === 0) {
        return "Terran Republic";
      } else if (factionId === 1) {
        return "New Conglomerate";
      } else {
        return "Vanu Sovereignty";
      }
    }

</script>

<svelte:head>
<title>Player Stats</title>
</svelte:head>

<table>
  <tbody>
    <tr>
    <td width="%50" valign="top">
     <table>
      <tbody>
       <tr>
        <td>
    <span style="color:lightgrey;">Character Name:</span> {$selectedPlayer.name}<br>
    <span style="color:lightgrey;">Empire:</span> {getFactionName($selectedPlayer.faction_id)}<br>
        </td>
        <td><img height="60" src={getFactionIcon($selectedPlayer.faction_id)} alt={selectedPlayer.faction_id} /></td>
        </tr>
  </tbody>
</table>
  <span style="color:lightgrey;">Command Rank:</span> {$selectedPlayer.cr}<br>
  <span style="color:lightgrey;">Battle Rank:</span> {$selectedPlayer.br}<br>
   </td>
   </tr>
  </tbody>
</table>
<br>
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
    {#each weapons as weapon}
      <tr>
        <td>{getWeaponName(weapon.weapon_id)} {weapon.weapon_id}</td>
        <td>{weapon.kills}</td>
        <td>{weapon.assists}</td>
        <td>{weapon.shots_fired}</td>
        <td>{weapon.shots_landed}</td>
        <td>{((weapon.shots_landed / weapon.shots_fired) * 100).toFixed(2)}%</td>
      </tr>
    {/each}
  </tbody>
 </table>
