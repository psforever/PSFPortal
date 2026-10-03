import { useMemo, useState } from 'react'
import { MermaidModal } from '@/components/MermaidModal'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  CODEC_BY_KEY,
  type CapturedPacket,
  type DesignField,
  type PacketField,
  FIELD_CODECS,
  TIERS,
  applyLayout,
  directionLabel,
  directionOf,
  download,
  hexDump,
  hexToBytes,
  layoutBits,
  tierOf,
  toMermaid,
  toScala
} from '@/lib/packets'

type Tab = 'raw' | 'decoded' | 'design'

let fieldSeq = 0
function newField(name: string, codecKey = 'uint8L', bits = 8): DesignField {
  fieldSeq += 1
  return { id: `f${fieldSeq}`, name, codecKey, bits }
}

/**
 * The codec to start a field on, given the type the login server's class declares for it.
 *
 * A guess, and only a guess. The declared type survives into the runtime value and is exact, but the
 * WIDTH does not: a `uint4` and a `uint16L` are both an `Int` by the time the packet is decoded, so
 * the width lives in the codec and cannot be recovered from the class. These are the commonest
 * choice per type, offered as a starting point rather than a claim.
 */
function codecForType(scalaType: string): { key: string; bits: number } {
  if (scalaType.startsWith('Option[')) return codecForType(scalaType.slice(7, -1))
  switch (scalaType) {
    case 'Boolean':
      return { key: 'bool', bits: 1 }
    case 'Long':
      return { key: 'uint32L', bits: 32 }
    case 'Float':
    case 'Double':
      return { key: 'floatL', bits: 32 }
    case 'String':
      return { key: 'string', bits: 0 }
    case 'PlanetSideGUID':
      return { key: 'guid', bits: 16 }
    case 'Int':
      return { key: 'uint8L', bits: 8 }
    default:
      // A nested structure or something unrecognised: a byte, so it is visibly a placeholder rather
      // than a plausible-looking field that happens to be wrong.
      return { key: 'bytes', bits: 8 }
  }
}

/**
 * A starting layout for a packet.
 *
 * When the login server already has a class for this opcode, the names come from that class rather
 * than from `unk1, unk2, unk3` -- retyping a known field list is tedious and easy to get subtly
 * wrong, and the names are the half of a layout that is genuinely recoverable. Widths are not:
 * they live in the codec, so they start on a per-type guess and are yours to correct.
 *
 * For an uncharted opcode there is no class to read, so the packet is offered a byte at a time as
 * somewhere to begin, and working out the layout means merging and splitting those while watching
 * what the values do across several specimens.
 */
function seedLayout(packet: CapturedPacket): DesignField[] {
  const known: PacketField[] | undefined = packet.fields
  if (known && known.length > 0) {
    return [
      newField('opcode', 'uint8L', 8),
      ...known.map((f) => {
        const codec = codecForType(f.scalaType)
        return newField(f.name, codec.key, codec.bits || 8)
      })
    ]
  }
  const bytes = hexToBytes(packet.hex)
  const fields: DesignField[] = [newField('opcode', 'uint8L', 8)]
  const rest = Math.min(Math.max(bytes.length - 1, 0), 32)
  for (let i = 0; i < rest; i++) fields.push(newField(`unk${i + 1}`, 'uint8L', 8))
  return fields
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      variant="ghost"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(
          () => {
            setDone(true)
            window.setTimeout(() => setDone(false), 1500)
          },
          () => {}
        )
      }}
    >
      {done ? 'Copied' : label}
    </Button>
  )
}

/**
 * One captured packet, read three ways: the raw stream, the class the login server decodes it into,
 * and -- for the packets that have no such class yet -- a field designer that turns a proposed layout
 * into both a Mermaid packet diagram and a scodec-backed Scala class ready to paste into the project.
 *
 * Rendered inline underneath its own row in the capture table rather than in a panel of its own, so
 * the packet you clicked and what it says stay next to each other however far down the list it sits.
 */
export function PacketDetail({ packet, onClose }: { packet: CapturedPacket; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>(packet.charted && packet.decoded ? 'decoded' : 'raw')
  const [fields, setFields] = useState<DesignField[]>(() => seedLayout(packet))
  const [charting, setCharting] = useState(false)

  const applied = useMemo(() => applyLayout(packet.hex, fields), [packet.hex, fields])
  const mermaid = useMemo(() => toMermaid(packet, fields), [packet, fields])
  const scala = useMemo(() => toScala(packet, fields), [packet, fields])

  const usedBits = layoutBits(fields)
  const availableBits = hexToBytes(packet.hex).length * 8
  const tier = TIERS[tierOf(packet.tier)]

  const update = (id: string, patch: Partial<DesignField>) =>
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))

  const remove = (id: string) => setFields((prev) => prev.filter((f) => f.id !== id))

  const move = (id: string, by: number) =>
    setFields((prev) => {
      const i = prev.findIndex((f) => f.id === id)
      const j = i + by
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(i, 1)
      next.splice(j, 0, item)
      return next
    })

  const tabs: { key: Tab; label: string; enabled: boolean }[] = [
    { key: 'raw', label: 'Raw stream', enabled: true },
    { key: 'decoded', label: 'Decoded class', enabled: true },
    { key: 'design', label: 'Design a class', enabled: true }
  ]

  return (
    <div
      className="border-l-2 bg-[var(--background)] px-4 py-3"
      // Keyed off the packet's own tier, so the detail is visibly continuous with the coloured row
      // that opened it.
      style={{ borderColor: tier.colour }}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-mono" style={{ color: tier.colour }}>
            {packet.label}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>specimen #{packet.id}</span>
          <span
            className="px-2 py-0.5 text-[10px] uppercase tracking-[0.18em]"
            style={{ border: `1px solid ${tier.colour}`, color: tier.colour }}
            title={tier.hint}
          >
            {tier.label}
          </span>
          <span style={{ color: 'var(--text-muted)' }} title={directionOf(packet.direction).hint}>
            {directionLabel(packet.direction)}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>{packet.length} bytes</span>
          <span className="font-mono" style={{ color: 'var(--text-muted)' }}>
            {packet.session}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>{new Date(packet.at).toLocaleString()}</span>
          <Button variant="ghost" className="ml-auto" onClick={onClose}>
            Close
          </Button>
        </div>

        {packet.truncated && (
          <p className="text-xs" style={{ color: 'var(--text-warning)' }}>
            This packet was longer than the world server keeps; the stream below is the first{' '}
            {hexToBytes(packet.hex).length} of {packet.length} bytes.
          </p>
        )}

        <div className="flex gap-2 border-b" style={{ borderColor: 'var(--border)' }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-3 py-2 text-[10px] uppercase tracking-[0.2em] border-b-2 transition',
                tab === t.key ? 'border-[var(--accent-primary)]' : 'border-transparent'
              )}
              style={{ color: tab === t.key ? 'var(--accent-primary)' : 'var(--text-muted)' }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'raw' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CopyButton text={packet.hex} label="Copy hex" />
              <CopyButton text={hexDump(packet.hex)} label="Copy dump" />
            </div>
            <pre
              className="overflow-x-auto p-3 text-xs font-mono border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              {hexDump(packet.hex)}
            </pre>
          </div>
        )}

        {tab === 'decoded' && (
          <div className="space-y-2">
            {packet.decoded ? (
              <>
                <CopyButton text={packet.decoded} label="Copy" />
                <pre
                  className="overflow-x-auto whitespace-pre-wrap p-3 text-xs font-mono border"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  {packet.decoded}
                </pre>
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-sm" style={{ color: 'var(--text-warning)' }}>
                  {packet.charted
                    ? 'A layout for this opcode exists, but these bytes did not fit it.'
                    : 'No layout for this opcode has been worked out yet, so the login server has no class to render it as.'}
                </p>
                {packet.error && (
                  <pre
                    className="overflow-x-auto whitespace-pre-wrap p-3 text-xs font-mono border"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                  >
                    {packet.error}
                  </pre>
                )}
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Use <strong>Design a class</strong> to lay a layout over the bytes and generate one.
                </p>
              </div>
            )}
          </div>
        )}

        {tab === 'design' && (
          <div className="space-y-4">
            {packet.fields && packet.fields.length > 0 && (
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                Seeded with the {packet.fields.length} field
                {packet.fields.length === 1 ? '' : 's'} declared by{' '}
                <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>
                  {packet.name}
                </span>{' '}
                in the login server. The names and types are read from that class and are exact; the
                widths are a per-type guess, because a width lives in the codec rather than the class
                and cannot be recovered from a decoded packet.
              </p>
            )}
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Lay fields over the stream and watch what they read. The layout accounts for {usedBits}{' '}
              of {availableBits} bits
              {usedBits > availableBits && ' — more than this packet contains'}.
              {usedBits < availableBits && ` (${availableBits - usedBits} unaccounted)`}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {['', 'Name', 'Codec', 'Bits', 'Offset', 'Value', ''].map((h, i) => (
                      <th
                        key={i}
                        className="py-1 px-2 text-left text-[10px] uppercase tracking-[0.18em] border-b"
                        style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {applied.map(({ field, offset, bits, value, exact }, i) => {
                    const meta = CODEC_BY_KEY[field.codecKey]
                    return (
                      <tr key={field.id}>
                        <td className="py-1 px-1 border-b" style={{ borderColor: 'var(--border)' }}>
                          <div className="flex flex-col">
                            <button
                              onClick={() => move(field.id, -1)}
                              disabled={i === 0}
                              className="leading-none disabled:opacity-30"
                              style={{ color: 'var(--text-muted)' }}
                              aria-label="Move up"
                            >
                              ▲
                            </button>
                            <button
                              onClick={() => move(field.id, 1)}
                              disabled={i === applied.length - 1}
                              className="leading-none disabled:opacity-30"
                              style={{ color: 'var(--text-muted)' }}
                              aria-label="Move down"
                            >
                              ▼
                            </button>
                          </div>
                        </td>
                        <td className="py-1 px-2 border-b" style={{ borderColor: 'var(--border)' }}>
                          <input
                            value={field.name}
                            onChange={(e) => update(field.id, { name: e.target.value })}
                            className="w-28 px-1 py-0.5 bg-[var(--background)] border text-xs font-mono outline-none"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                          />
                        </td>
                        <td className="py-1 px-2 border-b" style={{ borderColor: 'var(--border)' }}>
                          <select
                            value={field.codecKey}
                            onChange={(e) => {
                              const next = CODEC_BY_KEY[e.target.value]
                              update(field.id, {
                                codecKey: e.target.value,
                                bits: next?.bits ?? field.bits
                              })
                            }}
                            className="px-1 py-0.5 bg-[var(--background)] border text-xs font-mono outline-none"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                          >
                            {FIELD_CODECS.map((c) => (
                              <option key={c.key} value={c.key}>
                                {c.key}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1 px-2 border-b" style={{ borderColor: 'var(--border)' }}>
                          {meta?.sized ? (
                            <input
                              type="number"
                              min={1}
                              max={64}
                              value={field.bits}
                              onChange={(e) => update(field.id, { bits: Number(e.target.value) || 1 })}
                              className="w-14 px-1 py-0.5 bg-[var(--background)] border text-xs font-mono outline-none"
                              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                            />
                          ) : (
                            <span className="font-mono" style={{ color: 'var(--text-muted)' }}>
                              {bits ?? 'var'}
                            </span>
                          )}
                        </td>
                        <td
                          className="py-1 px-2 border-b font-mono"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                        >
                          {bits === null ? '—' : offset}
                        </td>
                        <td
                          className="py-1 px-2 border-b font-mono"
                          style={{
                            borderColor: 'var(--border)',
                            color: exact ? 'var(--text-secondary)' : 'var(--text-muted)'
                          }}
                        >
                          {value ?? '—'}
                        </td>
                        <td className="py-1 px-2 border-b" style={{ borderColor: 'var(--border)' }}>
                          <button
                            onClick={() => remove(field.id)}
                            style={{ color: 'var(--text-danger)' }}
                            aria-label="Remove field"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setFields((p) => [...p, newField(`unk${p.length}`)])}>
                Add field
              </Button>
              <Button variant="ghost" onClick={() => setFields(seedLayout(packet))}>
                Reset layout
              </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h4
                    className="text-[10px] uppercase tracking-[0.2em] mr-auto"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Mermaid packet diagram
                  </h4>
                  <CopyButton text={mermaid} />
                  <Button variant="ghost" onClick={() => setCharting(true)}>
                    Open as Chart
                  </Button>
                </div>
                <pre
                  className="overflow-x-auto p-3 text-xs font-mono border"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  {mermaid}
                </pre>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h4
                    className="text-[10px] uppercase tracking-[0.2em] mr-auto"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Scala packet class
                  </h4>
                  <CopyButton text={scala} />
                  <Button
                    variant="ghost"
                    onClick={() =>
                      download(
                        `${packet.name.replace(/[^A-Za-z0-9]/g, '')}.scala`,
                        scala,
                        'text/plain;charset=utf-8'
                      )
                    }
                  >
                    Download
                  </Button>
                </div>
                <pre
                  className="overflow-x-auto p-3 text-xs font-mono border"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  {scala}
                </pre>
              </div>
            </div>

            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              The generated class is a draft, not a finished packet: it round-trips the fields as laid
              out here, which makes it worth iterating on against real traffic, but the names and
              widths are a reading of {packet.length} bytes rather than a confirmed layout. Check it
              against several specimens before trusting it.
            </p>

            {charting && (
              <MermaidModal
                diagram={mermaid}
                title={`${packet.label} — packet layout`}
                onClose={() => setCharting(false)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
