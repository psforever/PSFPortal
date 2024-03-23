
  export const bepRanges = [
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
  export const cepRanges = [
  { rank: 0, minCEP: 0, maxCEP: 9999 },
  { rank: 1, minCEP: 10000, maxCEP: 49999 },
  { rank: 2, minCEP: 50000, maxCEP: 149999 },
  { rank: 3, minCEP: 150000, maxCEP: 299999 },
  { rank: 4, minCEP: 300000, maxCEP: 599999 }
  ];

  // Function to calculate rank based on BEP
  export function calculateBr(bep) {
      // Iterate through rank ranges to find the appropriate rank
      for (const range of bepRanges) {
          if (bep >= range.minBEP && bep <= range.maxBEP) {
              return range.rank;
          }
      }
      // Default rank if BEP doesn't match any range
      return 40;
  }

  // Function to calculate rank based on CEP
  export function calculateCr(cep) {
      // Iterate through rank ranges to find the appropriate rank
      for (const range of cepRanges) {
          if (cep >= range.minCEP && cep <= range.maxCEP) {
              return range.rank;
          }
      }
      // Default rank if CEP doesn't match any range
      return 5;
  }

  export function getFactionIcon(factionId) {
    if (factionId === 0) {
      return "/img/tr_icon.png";
    } else if (factionId === 1) {
      return "/img/nc_icon.png";
    } else {
      return "/img/vs_icon.png";
    }
  }

   export function getFactionName(factionId) {
     if (factionId === 0) {
       return "Terran Republic";
     } else if (factionId === 1) {
       return "New Conglomerate";
     } else {
       return "Vanu Sovereignty";
     }
   }

  // Function to get weapon name from id
  export function getWeaponName(weapon_id) {
      // Iterate through weapons
      for (const weapon of weaponNames) {
          if (weapon_id === weapon.id) {
              return weapon.name;
          }
      }
      // Missing
      return "unknown";
  }

export const weaponNames = [
{ id: 55, name: 'Spear' },
{ id: 56, name: 'Stinger' },
{ id: 57, name: 'Eraser' },
{ id: 140, name: 'Beamer' },
{ id: 146, name: 'Bolt Driver' },
{ id: 148, name: 'Boomer' },
{ id: 175, name: 'Knife (TR)' },
{ id: 177, name: 'chaingun_p type weapon' },
{ id: 233, name: 'Cycler' },
{ id: 299, name: 'Dragon' },
{ id: 304, name: 'Sweeper' },
{ id: 324, name: 'Knife (VS)' },
{ id: 334, name: 'Frag Grenade' },
{ id: 345, name: 'Gauss' },
{ id: 396, name: 'Heavy Scout Rifle' },
{ id: 398, name: 'hellfire type weapon' },
{ id: 406, name: 'Phoenix' },
{ id: 407, name: 'AMP' },
{ id: 411, name: 'Scatter Pistol' },
{ id: 421, name: 'katana type weapon' },
{ id: 425, name: 'Lancer' },
{ id: 429, name: 'Lasher' },
{ id: 462, name: 'Maelstrom' },
{ id: 468, name: 'Knife (NC)' },
{ id: 556, name: 'Mini-Chaingun' },
{ id: 587, name: 'Falcon MAX' },
{ id: 588, name: 'Scattercannon MAX' },
{ id: 589, name: 'Sparrow MAX' },
{ id: 599, name: 'Scorpion' },
{ id: 673, name: 'Decimator' },
{ id: 680, name: 'Plasma Grenade' },
{ id: 701, name: 'Pulsar' },
{ id: 706, name: 'Punisher' },
{ id: 714, name: 'Jackhammer' },
{ id: 716, name: 'Radiator' },
{ id: 730, name: 'Repeater' },
{ id: 737, name: 'Rocklet Rifle' },
{ id: 747, name: 'scythe type weapon' },
{ id: 761, name: 'six_shooter type weapon' },
{ id: 817, name: 'Spiker' },
{ id: 838, name: 'Striker' },
{ id: 845, name: 'Suppressor' },
{ id: 864, name: 'Thumper' },
{ id: 888, name: 'Burster MAX' },
{ id: 889, name: 'Dual Cycler MAX' },
{ id: 890, name: 'Pounder MAX' },
{ id: 968, name: 'Comet MAX' },
{ id: 969, name: 'Quasar MAX' },
{ id: 970, name: 'Starfire MAX' },
{ id: 1003, name: 'winchester type weapon' },
{ id: 46, name: 'AMS' },
{ id: 60, name: 'ANT' },
{ id: 62, name: 'BIG BUS' },
{ id: 66, name: 'Vindicator' },
{ id: 67, name: 'Juggernaut' },
{ id: 68, name: 'Leviathan' },
{ id: 79, name: 'Aphelion' },
{ id: 83, name: 'Eclipse' },
{ id: 84, name: 'Aphelion' },
{ id: 118, name: 'Aurora' },
{ id: 135, name: 'Raider' },
{ id: 179, name: 'Colossus' },
{ id: 199, name: 'Invader' },
{ id: 200, name: 'Colossus' },
{ id: 239, name: 'Deliverer' },
{ id: 259, name: 'Galaxy' },
{ id: 294, name: 'Flail' },
{ id: 335, name: 'Fury' },
{ id: 338, name: 'Galaxy Gunship' },
{ id: 353, name: 'BFR' },
{ id: 432, name: 'Liberator' },
{ id: 441, name: 'Reaver' },
{ id: 446, name: 'Lightning' },
{ id: 459, name: 'Lodestar' },
{ id: 470, name: 'Magrider' },
{ id: 480, name: 'Phalanx Wall Turret' },
{ id: 532, name: 'Deliverer' },
{ id: 572, name: 'Mosquito' },
{ id: 632, name: 'Peregrine' },
{ id: 642, name: 'Eagle' },
{ id: 643, name: 'Peregrine' },
{ id: 671, name: 'Phantasm' },
{ id: 685, name: 'Manned Field Turret' },
{ id: 686, name: 'Osprey' },
{ id: 687, name: 'Avenger' },
{ id: 688, name: 'Orion' },
{ id: 697, name: 'Prowler' },
{ id: 707, name: 'Basilisk' },
{ id: 710, name: 'Wraith' },
{ id: 741, name: 'Router' },
{ id: 759, name: 'Shuttle' },
{ id: 784, name: 'Skyguard' },
{ id: 819, name: 'Cerebus Turret' },
{ id: 825, name: 'Shadow Turret' },
{ id: 826, name: 'Spitfire Turret' },
{ id: 847, name: 'Switchblade' },
{ id: 849, name: 'Trap' },
{ id: 860, name: 'Testobject?' },
{ id: 862, name: 'Marauder' },
{ id: 865, name: 'Thunderer' },
{ id: 896, name: 'Harasser' },
{ id: 898, name: 'Enforcer' },
{ id: 900, name: 'Thresher' },
{ id: 923, name: 'Vanguard' },
{ id: 943, name: 'Sentry Turret' },
{ id: 986, name: 'Vulture' },
{ id: 997, name: 'Wasp' }
]