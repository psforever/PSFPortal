/**
 * Packet Review: the shapes the world server sends, and the things the page derives from them.
 *
 * The page is the store. The world server keeps only a small shared window of recent specimens so
 * that several admins can read the same capture without provoking several captures; everything the
 * page has collected it keeps itself, and everything below -- the field designer, the diagram, the
 * generated Scala, the CSV -- works entirely on that local copy.
 */

/** One captured packet, exactly as `CapturedPacket` on the world server renders it. */
export interface CapturedPacket {
  id: number
  at: number
  /** Which opcode table names it: `game` or `control`. */
  space: 'game' | 'control'
  opcode: number
  name: string
  /** `Name (ID)` -- the one rendering the server and the portal both use. */
  label: string
  tier: PacketTier
  direction: 'in' | 'out'
  session: string
  /** Payload length in bytes, before any truncation applied to `hex`. */
  length: number
  hex: string
  truncated: boolean
  /** How the world server's own class renders it, when a layout exists. */
  decoded?: string
  /** Why it would not decode, when it would not. */
  error?: string
  charted: boolean
  /** The decoding class's own fields, when a class exists. Absent for uncharted opcodes. */
  fields?: PacketField[]
}

/** One field of a decoded packet, as the login server's own case class declares it. */
export interface PacketField {
  name: string
  scalaType: string
  value: string
}

export interface OpcodeEntry {
  space: 'game' | 'control'
  opcode: number
  name: string
  label: string
  charted: boolean
  /** Carries a credential; never selectable. */
  redacted: boolean
  armed: boolean
}

export interface CaptureState {
  active: boolean
  startedAt: number
  watchers: string[]
  game: number[]
  control: number[]
  seen: number
  dropped: number
  retained: number
  oldestId: number
  newestId: number
}

export type PacketTier = 'control' | 'plaintext' | 'encrypted'

/**
 * How the three kinds of packet are told apart on sight.
 *
 * Control packets are the transport itself -- bundling, sequencing, the crypto handshake -- and are
 * a different concern from anything the game says, so they get the secondary accent rather than
 * competing with the game traffic for attention. The other two split by whether the packet was
 * encrypted on the wire: encrypted is the ordinary steady state and reads as normal, while plaintext
 * is worth noticing, because anything in it was readable by anyone watching the connection.
 */
export const TIERS: Record<PacketTier, { label: string; colour: string; hint: string }> = {
  control: {
    label: 'Control',
    colour: 'var(--accent-secondary)',
    hint: 'Low-level transport: bundling, sequencing, the crypto handshake'
  },
  plaintext: {
    label: 'Plaintext',
    colour: 'var(--text-warning)',
    hint: 'Game packet sent before encryption was established -- readable on the wire'
  },
  encrypted: {
    label: 'Encrypted',
    colour: 'var(--accent-primary)',
    hint: 'Game packet carried inside the encrypted session'
  }
}

export function tierOf(tier: string): PacketTier {
  return tier === 'control' || tier === 'plaintext' ? tier : 'encrypted'
}

/**
 * A packet's direction, named by whoever SENT it.
 *
 * The world server records this from its own point of view -- `in` is a packet arriving, `out` one
 * being dispatched -- which is the right thing for it to store but the wrong thing to read. When you
 * are working out a layout, what matters is who wrote those bytes: a field means different things
 * depending on whether the client asserted it or the server did. Naming the sender says that
 * directly, where "in" makes you translate it every time.
 *
 * The raw `in`/`out` is left untouched in the capture record and the CSV export, which are the
 * machine-readable side of this.
 */
export const DIRECTIONS: Record<'in' | 'out', { sender: string; receiver: string; hint: string }> = {
  in: {
    sender: 'Client',
    receiver: 'Server',
    hint: 'Sent by the game client and received by the world server'
  },
  out: {
    sender: 'Server',
    receiver: 'Client',
    hint: 'Sent by the world server and received by the game client'
  }
}

export function directionOf(direction: string): (typeof DIRECTIONS)['in'] {
  return direction === 'out' ? DIRECTIONS.out : DIRECTIONS.in
}

/** Compact form for a column: `Client →` / `Server →`. */
export function senderLabel(direction: string): string {
  return `${directionOf(direction).sender} →`
}

/** Full form where there is room: `Client → Server`. */
export function directionLabel(direction: string): string {
  const d = directionOf(direction)
  return `${d.sender} → ${d.receiver}`
}

/**
 * A key for a captured packet that stays unique across a page reload.
 *
 * `id` is only unique within one capture run: the world server resets its counter when the last
 * watcher leaves, so packets collected before a refresh and packets collected after it can carry the
 * same id. Left alone that means duplicate React keys and a selection that jumps to the wrong row.
 * Session and timestamp together settle it -- an id repeats only if the same connection produced the
 * same id in the same millisecond, which a restarted counter does not do.
 */
export function uidOf(packet: CapturedPacket): string {
  return `${packet.session}:${packet.id}:${packet.at}`
}

/* ------------------------------------------------------------------ *
 * Session persistence
 * ------------------------------------------------------------------ */

/** What survives a reload. Bumped if the shape changes, so an old blob is discarded not misread. */
const STORE_KEY = 'psfportal.packet-review.v1'

/** How many specimens are written back. The in-memory history may be larger. */
const MAX_PERSISTED = 1000

export interface PersistedReview {
  packets: CapturedPacket[]
  chosen: { game: number[]; control: number[] }
  selectedUid: string | null
  collecting: boolean
  space: 'game' | 'control'
}

/**
 * Restore the page's state from the last write, or null if there is nothing usable.
 *
 * `sessionStorage` rather than `localStorage` on purpose: it survives a reload, which is what was
 * asked for, and it goes away when the tab does -- which keeps captured player traffic from
 * outliving the tab that collected it, the same principle the capture lease enforces server-side.
 */
export function loadReview(): PersistedReview | null {
  try {
    const raw = sessionStorage.getItem(STORE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedReview
    if (!Array.isArray(parsed?.packets)) return null
    return {
      packets: parsed.packets,
      chosen: {
        game: Array.isArray(parsed.chosen?.game) ? parsed.chosen.game : [],
        control: Array.isArray(parsed.chosen?.control) ? parsed.chosen.control : []
      },
      selectedUid: parsed.selectedUid ?? null,
      collecting: Boolean(parsed.collecting),
      space: parsed.space === 'control' ? 'control' : 'game'
    }
  } catch {
    // A corrupt or unreadable blob is not worth failing the page over; start fresh instead.
    return null
  }
}

/**
 * Write the page's state back, trimming until it fits.
 *
 * Packets carry their full hex, so a long session can exceed the storage quota. Rather than losing
 * everything to a thrown write, this drops the oldest half and tries again -- the newest specimens
 * are the ones being worked on, and the CSV export is the answer for keeping the rest.
 */
export function saveReview(state: PersistedReview): void {
  let packets = state.packets.slice(0, MAX_PERSISTED)
  for (;;) {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify({ ...state, packets }))
      return
    } catch {
      if (packets.length === 0) return
      packets = packets.slice(0, Math.floor(packets.length / 2))
    }
  }
}

/** Forget everything kept for this page. Only Clear does this. */
export function clearReview(): void {
  try {
    sessionStorage.removeItem(STORE_KEY)
  } catch {
    /* nothing useful to do; the in-memory state is cleared regardless */
  }
}

/* ------------------------------------------------------------------ *
 * Field designer
 * ------------------------------------------------------------------ */

/**
 * A codec offered when laying fields over a packet.
 *
 * `bits` is the fixed width where there is one; a null width means the codec reads a length from the
 * stream itself, which the preview cannot follow, so those fields end the readable part of the
 * layout rather than producing a wrong offset for everything after them.
 */
export interface FieldCodec {
  key: string
  /** What appears in the generated `Codec`. */
  codec: string
  /** The Scala type of the decoded value. */
  scala: string
  bits: number | null
  /** Fixed-width codecs whose width the designer lets you set. */
  sized?: boolean
  /** Little-endian byte ordering, which changes how the preview reads the bits. */
  little?: boolean
  /** Contributes no field to the case class. */
  padding?: boolean
}

export const FIELD_CODECS: FieldCodec[] = [
  { key: 'bool', codec: 'bool', scala: 'Boolean', bits: 1 },
  { key: 'uint', codec: 'uint', scala: 'Int', bits: 4, sized: true },
  { key: 'uintL', codec: 'uintL', scala: 'Int', bits: 4, sized: true, little: true },
  { key: 'uint2', codec: 'uint2', scala: 'Int', bits: 2 },
  { key: 'uint4', codec: 'uint4', scala: 'Int', bits: 4 },
  { key: 'uint8', codec: 'uint8', scala: 'Int', bits: 8 },
  { key: 'uint8L', codec: 'uint8L', scala: 'Int', bits: 8, little: true },
  { key: 'uint16', codec: 'uint16', scala: 'Int', bits: 16 },
  { key: 'uint16L', codec: 'uint16L', scala: 'Int', bits: 16, little: true },
  { key: 'uint24', codec: 'uint24', scala: 'Int', bits: 24 },
  { key: 'uint32', codec: 'uint32', scala: 'Long', bits: 32 },
  { key: 'uint32L', codec: 'uint32L', scala: 'Long', bits: 32, little: true },
  { key: 'int32L', codec: 'int32L', scala: 'Int', bits: 32, little: true },
  { key: 'floatL', codec: 'floatL', scala: 'Float', bits: 32, little: true },
  { key: 'guid', codec: 'PlanetSideGUID.codec', scala: 'PlanetSideGUID', bits: 16 },
  { key: 'ignore', codec: 'ignore', scala: '', bits: 8, sized: true, padding: true },
  { key: 'bytes', codec: 'bytes', scala: 'ByteVector', bits: 8, sized: true },
  { key: 'string', codec: 'PacketHelpers.encodedString', scala: 'String', bits: null },
  { key: 'wstring', codec: 'PacketHelpers.encodedWideString', scala: 'String', bits: null }
]

export const CODEC_BY_KEY: Record<string, FieldCodec> = Object.fromEntries(
  FIELD_CODECS.map((c) => [c.key, c])
)

/** One field in a layout being designed against a packet. */
export interface DesignField {
  id: string
  name: string
  codecKey: string
  /** Width for the codecs whose width is adjustable; ignored for the rest. */
  bits: number
}

/** The width this field actually occupies, or null when the stream decides. */
export function fieldBits(field: DesignField): number | null {
  const codec = CODEC_BY_KEY[field.codecKey]
  if (!codec) return null
  if (codec.bits === null) return null
  return codec.sized ? Math.max(1, field.bits) : codec.bits
}

/** How the field appears inside a generated `Codec`. */
export function fieldCodecExpr(field: DesignField): string {
  const codec = CODEC_BY_KEY[field.codecKey]
  if (!codec) return 'bool'
  if (!codec.sized) return codec.codec
  if (codec.key === 'bytes') return `bytes(${Math.max(1, Math.ceil(field.bits / 8))})`
  return `${codec.codec}(${Math.max(1, field.bits)})`
}

/* ------------------------------------------------------------------ *
 * Reading values out of the captured bytes
 * ------------------------------------------------------------------ */

/** Hex string -> bytes. Tolerates whitespace, ignores a trailing half-byte. */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '')
  const out = new Uint8Array(Math.floor(clean.length / 2))
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16)
  return out
}

/** Read `count` bits starting at `offset`, most significant bit first. */
function readBitsMsb(bytes: Uint8Array, offset: number, count: number): number | null {
  if (offset + count > bytes.length * 8) return null
  let value = 0
  for (let i = 0; i < count; i++) {
    const bit = offset + i
    const b = (bytes[bit >> 3] >> (7 - (bit & 7))) & 1
    value = value * 2 + b
  }
  return value
}

/**
 * The value this field reads out of the packet, or null when it cannot be read exactly.
 *
 * The preview only ever shows a value it is certain of. scodec's little-endian codecs are exactly a
 * byte reversal when the width is a multiple of eight, and are indistinguishable from big-endian
 * when the width is eight or fewer bits -- both of those are reproduced here. A little-endian field
 * that is neither (a `uintL(12)`, say) goes through scodec's bit-level reordering, which is not
 * reproduced, and reads as unavailable rather than as a plausible wrong number. Getting this wrong
 * silently would be worse than useless in a tool whose whole purpose is working out a layout.
 */
export function readField(
  bytes: Uint8Array,
  offset: number,
  field: DesignField
): { value: string; exact: boolean } | null {
  const codec = CODEC_BY_KEY[field.codecKey]
  const width = fieldBits(field)
  if (!codec || width === null) return null
  if (offset + width > bytes.length * 8) return null

  if (codec.key === 'bytes') {
    const start = offset >> 3
    const len = Math.ceil(width / 8)
    if (offset % 8 !== 0) return { value: '(not byte-aligned)', exact: false }
    return {
      value: Array.from(bytes.slice(start, start + len))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' '),
      exact: true
    }
  }

  if (!codec.little || width <= 8) {
    const raw = readBitsMsb(bytes, offset, width)
    if (raw === null) return null
    if (codec.key === 'bool') return { value: raw ? 'true' : 'false', exact: true }
    return { value: String(raw), exact: true }
  }

  if (width % 8 === 0) {
    // Little-endian at a whole number of bytes is exactly a byte reversal.
    const octets: number[] = []
    for (let i = 0; i < width / 8; i++) {
      const b = readBitsMsb(bytes, offset + i * 8, 8)
      if (b === null) return null
      octets.push(b)
    }
    octets.reverse()
    let value = 0
    for (const o of octets) value = value * 256 + o
    if (codec.key === 'floatL') {
      const buf = new ArrayBuffer(4)
      const view = new DataView(buf)
      octets.forEach((o, i) => view.setUint8(i, o))
      return { value: String(view.getFloat32(0, false)), exact: true }
    }
    if (codec.key === 'int32L' && value > 0x7fffffff) value -= 0x100000000
    return { value: String(value), exact: true }
  }

  // Little-endian at a width that is neither <= 8 bits nor a whole number of bytes. scodec reorders
  // the bits in a way this preview does not reproduce, so it says so rather than guessing.
  return { value: '(little-endian bit order not previewed)', exact: false }
}

/** Walk the layout over a packet, giving each field its offset and value. */
export function applyLayout(
  hex: string,
  fields: DesignField[]
): { field: DesignField; offset: number; bits: number | null; value: string | null; exact: boolean }[] {
  const bytes = hexToBytes(hex)
  let offset = 0
  let stopped = false
  return fields.map((field) => {
    const bits = fieldBits(field)
    if (stopped || bits === null) {
      // A variable-width codec reads its own length from the stream, so nothing after it has a
      // knowable offset. The layout stays visible; the values stop.
      stopped = true
      return { field, offset, bits, value: null, exact: false }
    }
    const read = readField(bytes, offset, field)
    const at = offset
    offset += bits
    return { field, offset: at, bits, value: read?.value ?? null, exact: read?.exact ?? false }
  })
}

/** Total bits the fixed-width part of a layout occupies. */
export function layoutBits(fields: DesignField[]): number {
  let total = 0
  for (const f of fields) {
    const bits = fieldBits(f)
    if (bits === null) break
    total += bits
  }
  return total
}

/* ------------------------------------------------------------------ *
 * Mermaid
 * ------------------------------------------------------------------ */

/**
 * A Mermaid packet diagram of the layout.
 *
 * Mermaid's packet diagram addresses bits by absolute range, `start-end: "label"`, and a
 * single-bit field is written as a bare index. Fields whose width the stream decides cannot be given
 * a range and are left out, with a note, rather than being drawn at a made-up size.
 */
export function toMermaid(packet: CapturedPacket, fields: DesignField[]): string {
  const lines: string[] = ['packet-beta', `title ${packet.name} (${packet.opcode})`]
  let offset = 0
  let dropped = 0
  for (const field of fields) {
    const bits = fieldBits(field)
    if (bits === null) {
      dropped++
      continue
    }
    const label = (field.name || CODEC_BY_KEY[field.codecKey]?.key || 'field').replace(/"/g, "'")
    lines.push(bits === 1 ? `${offset}: "${label}"` : `${offset}-${offset + bits - 1}: "${label}"`)
    offset += bits
  }
  if (lines.length === 2) lines.push('0-7: "opcode"')
  if (dropped > 0) {
    lines.push(`%% ${dropped} variable-width field(s) omitted: their width is read from the stream`)
  }
  return lines.join('\n')
}

/* ------------------------------------------------------------------ *
 * Scala
 * ------------------------------------------------------------------ */

/** Turn an opcode name into something usable as a Scala identifier. */
function className(packet: CapturedPacket): string {
  const base = packet.name.replace(/[^A-Za-z0-9]/g, '')
  return /^[A-Za-z]/.test(base) ? base : `Packet${packet.opcode}`
}

/**
 * A scodec-backed packet class for this layout, in the shape the rest of the packet package uses.
 *
 * This is a starting point rather than a finished packet: it compiles and it round-trips the fields
 * as laid out, which is what makes it worth pasting into the project and iterating on against a real
 * client. Variable-width fields are emitted as their codec and left for the author to place, since
 * where they sit changes what everything after them means.
 */
export function toScala(packet: CapturedPacket, fields: DesignField[]): string {
  const name = className(packet)
  const pkg = packet.space === 'control' ? 'control' : 'game'
  const trait = packet.space === 'control' ? 'PlanetSideControlPacket' : 'PlanetSideGamePacket'
  const opcodeObj = packet.space === 'control' ? 'ControlPacketOpcode' : 'GamePacketOpcode'

  const real = fields.filter((f) => !CODEC_BY_KEY[f.codecKey]?.padding)
  const params = real.map((f, i) => `    ${f.name || `unk${i + 1}`}: ${CODEC_BY_KEY[f.codecKey]?.scala ?? 'Int'}`)

  const codecLines = fields.map((f, i) => {
    const expr = fieldCodecExpr(f)
    const meta = CODEC_BY_KEY[f.codecKey]
    // Padding contributes to the wire format but not to the case class, so it is not named.
    if (meta?.padding) return `      ${expr}`
    return `      ("${f.name || `unk${i + 1}`}" | ${expr})`
  })

  const usesHelpers = fields.some((f) => fieldCodecExpr(f).startsWith('PacketHelpers.'))
  const usesGuid = fields.some((f) => f.codecKey === 'guid')
  const usesBytes = fields.some((f) => f.codecKey === 'bytes')

  const imports = [
    `import net.psforever.packet.{${[opcodeObj, 'Marshallable', usesHelpers ? 'PacketHelpers' : '', trait]
      .filter(Boolean)
      .join(', ')}}`,
    usesGuid ? 'import net.psforever.types.PlanetSideGUID' : '',
    'import scodec.Codec',
    'import scodec.codecs._',
    usesBytes ? 'import scodec.bits.ByteVector' : ''
  ].filter(Boolean)

  return `// Copyright (c) ${new Date().getFullYear()} PSForever
package net.psforever.packet.${pkg}

${imports.join('\n')}

/**
  * Drafted against captured traffic in Packet Review; the field names and widths are a reading of
  * ${packet.length} observed bytes, not a confirmed layout. Verify against a real client before relying on it.
  */
final case class ${name}(
${params.join(',\n')}
) extends ${trait} {
  def opcode = ${opcodeObj}.${packet.name}
  def encode = ${name}.encode(this)
}

object ${name} extends Marshallable[${name}] {
  implicit val codec: Codec[${name}] = (
${codecLines.join(' ::\n')}
  ).as[${name}]
}
`
}

/* ------------------------------------------------------------------ *
 * CSV
 * ------------------------------------------------------------------ */

/** Columns in the exported CSV, in order. */
export const CSV_COLUMNS = [
  'id',
  'captured_at',
  'epoch_ms',
  'space',
  'opcode',
  'name',
  'tier',
  'direction',
  'session',
  'length_bytes',
  'truncated',
  'charted',
  'hex',
  'decoded',
  'error'
] as const

/** Quote one field per RFC 4180: wrap when it contains a delimiter, quote or newline; double quotes. */
function csvField(value: unknown): string {
  const s = value === undefined || value === null ? '' : String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * The collected packets as RFC 4180 CSV.
 *
 * Written to the spec rather than to whatever a given spreadsheet tolerates: comma delimited, CRLF
 * line endings, a header row, and fields quoted only where the spec requires it, with embedded
 * quotes doubled. `decoded` in particular contains commas and quotes as a matter of course, so this
 * is the difference between a file that reloads correctly and one that looks fine until it doesn't.
 * No byte-order mark -- it is not part of the spec, and strict parsers choke on it.
 */
export function toCsv(packets: CapturedPacket[]): string {
  const rows = [CSV_COLUMNS.join(',')]
  for (const p of packets) {
    rows.push(
      [
        p.id,
        new Date(p.at).toISOString(),
        p.at,
        p.space,
        p.opcode,
        p.name,
        p.tier,
        p.direction,
        p.session,
        p.length,
        p.truncated,
        p.charted,
        p.hex,
        p.decoded ?? '',
        p.error ?? ''
      ]
        .map(csvField)
        .join(',')
    )
  }
  return rows.join('\r\n') + '\r\n'
}

/** Offer `content` to the browser as a download. */
export function download(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** A hex dump with an offset gutter and an ASCII column, as a packet is usually read. */
export function hexDump(hex: string): string {
  const bytes = hexToBytes(hex)
  const lines: string[] = []
  for (let i = 0; i < bytes.length; i += 16) {
    const slice = Array.from(bytes.slice(i, i + 16))
    const hexPart = slice.map((b) => b.toString(16).padStart(2, '0')).join(' ').padEnd(47, ' ')
    const ascii = slice.map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('')
    lines.push(`${i.toString(16).padStart(4, '0')}  ${hexPart}  ${ascii}`)
  }
  return lines.join('\n') || '(empty)'
}
