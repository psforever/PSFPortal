/**
 * Battle rank / command rank tables, extracted from the retail client (`planetside.exe`).
 *
 * The BEP->BR table lives at 0x00ca7d10 in the image: 41 entries of { level, cumulative BEP
 * threshold }, levels 0-40. The client's converter (0x0092d4a0) scans the thresholds and returns
 * the highest level whose threshold the BEP meets. Note the original's quirk, preserved here:
 * past BR30 the thresholds climb by exactly 1 BEP per level (10,977,545 + n), so BR31-40 are a
 * data plateau rather than a real progression -- everyone at 10,977,545+ is effectively BR30+.
 *
 * The CEP->CR table follows it at 0x00ca7e58: 6 entries, levels 0-5 (CR0 = not a commander).
 */

/** Index = battle rank; value = cumulative BEP required to hold that rank. */
const BEP_THRESHOLDS: readonly number[] = [
  0, // 0: sentinel
  0, // 1
  1_000, // 2
  3_000, // 3
  7_500, // 4
  15_000, // 5
  30_000, // 6
  45_000, // 7
  67_500, // 8
  101_250, // 9
  126_563, // 10
  158_203, // 11
  197_754, // 12
  247_192, // 13
  308_990, // 14
  386_238, // 15
  482_798, // 16
  603_497, // 17
  754_371, // 18
  942_964, // 19
  1_178_705, // 20
  1_473_381, // 21
  1_841_727, // 22
  2_302_158, // 23
  2_877_698, // 24
  3_597_122, // 25
  4_496_403, // 26
  5_620_503, // 27
  7_025_629, // 28
  8_782_036, // 29
  10_977_545, // 30
  10_977_546, // 31 -- plateau: +1 BEP per level from here
  10_977_547, // 32
  10_977_548, // 33
  10_977_549, // 34
  10_977_550, // 35
  10_977_551, // 36
  10_977_552, // 37
  10_977_553, // 38
  10_977_554, // 39
  10_977_555 // 40
]

/** Index = command rank; value = cumulative CEP required to hold that rank. */
const CEP_THRESHOLDS: readonly number[] = [
  0, // 0: not a commander
  50_000, // 1
  100_000, // 2
  175_000, // 3
  300_000, // 4
  500_000 // 5
]

/**
 * The experience a rank begins at.
 *
 * A rank is not stored anywhere -- only experience is, and the rank is derived from it -- so setting
 * a character to BR12 means writing BR12's threshold. This is the same table the derivation reads,
 * so the two cannot disagree.
 */
export function bepForBattleRank(rank: number): number {
  return BEP_THRESHOLDS[Math.min(Math.max(rank, 1), MAX_BATTLE_RANK)]
}

export function cepForCommandRank(rank: number): number {
  return CEP_THRESHOLDS[Math.min(Math.max(rank, 0), MAX_COMMAND_RANK)]
}

export const MAX_BATTLE_RANK = BEP_THRESHOLDS.length - 1
export const MAX_COMMAND_RANK = CEP_THRESHOLDS.length - 1

function rankFor(table: readonly number[], xp: number): number {
  const n = Number(xp) || 0
  let rank = 0
  for (let level = 1; level < table.length; level++) {
    if (n >= table[level]) rank = level
    else break
  }
  return rank
}

/** Battle rank for a BEP total. BEP 0 -> BR1 (the client's floor). */
export function battleRank(bep: number | string): number {
  return Math.max(1, rankFor(BEP_THRESHOLDS, Number(bep)))
}

/** Command rank for a CEP total. CEP below 50,000 -> CR0 (no command rank). */
export function commandRank(cep: number | string): number {
  return rankFor(CEP_THRESHOLDS, Number(cep))
}

export interface RankProgress {
  rank: number
  /** XP earned within the current rank. */
  into: number
  /** XP span of the current rank; 0 at max rank (no next rank to progress toward). */
  needed: number
}

/** Progress within the current battle rank. */
export function battleRankProgress(bep: number | string): RankProgress {
  const rank = battleRank(bep)
  const needed =
    rank >= MAX_BATTLE_RANK ? 0 : BEP_THRESHOLDS[rank + 1] - BEP_THRESHOLDS[rank]
  return { rank, into: Number(bep) - BEP_THRESHOLDS[rank], needed }
}

/** Progress within the current command rank. */
export function commandRankProgress(cep: number | string): RankProgress {
  const rank = commandRank(cep)
  const needed =
    rank >= MAX_COMMAND_RANK ? 0 : CEP_THRESHOLDS[rank + 1] - CEP_THRESHOLDS[rank]
  return { rank, into: Number(cep) - CEP_THRESHOLDS[rank], needed }
}
