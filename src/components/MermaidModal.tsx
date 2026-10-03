import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui'

/**
 * Renders a Mermaid diagram in a modal, over the page.
 *
 * Mermaid is a large dependency and only a handful of pages ever draw a diagram, so it is pulled in
 * with a dynamic `import()` the first time a chart is actually opened rather than being carried in
 * the main bundle by everyone who loads the portal. That is also why the loading state below is real
 * rather than decorative: the first open pays for the download.
 *
 * `securityLevel: 'strict'` matters because the diagram source is assembled from text a user typed
 * (field names, in the packet designer) and the result is injected as markup. Strict runs Mermaid's
 * sanitiser over the SVG before it reaches the DOM.
 *
 * Rendered through a portal into `document.body` rather than in place. `position: fixed` is measured
 * against the viewport ONLY while no ancestor establishes a containing block, and `clip-path` does
 * establish one -- which every `Panel` sets, for its notched corners. Left in the tree, the overlay
 * would be positioned against the panel it was opened from and clipped to it, so it would cover the
 * content pane and nothing else. The portal puts it outside that ancestor entirely.
 */
export function MermaidModal({
  diagram,
  title,
  onClose
}: {
  diagram: string
  title: string
  onClose: () => void
}) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2)}`)

  useEffect(() => {
    let cancelled = false
    setSvg(null)
    setError(null)
    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'dark',
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          themeVariables: {
            // Enough of the portal's palette that the chart does not look pasted in from elsewhere.
            background: '#0D0D0D',
            primaryColor: '#141414',
            primaryTextColor: '#E0D5BE',
            primaryBorderColor: '#00ed3f',
            lineColor: '#4A4A40',
            textColor: '#E0D5BE'
          }
        })
        const { svg: rendered } = await mermaid.render(idRef.current, diagram)
        if (!cancelled) setSvg(rendered)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'The diagram could not be rendered.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [diagram])

  // Escape closes, as it does for any modal. Bound to the document so it works wherever focus is.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const downloadSvg = () => {
    if (!svg) return
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}.svg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(5, 5, 5, 0.85)' }}
      // Only a click that both starts and ends on the backdrop closes; otherwise a drag that began
      // on the diagram and released outside it would dismiss the modal.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="flex max-h-full w-full max-w-5xl flex-col border bg-[var(--surface)]"
        style={{ borderColor: 'var(--border)', clipPath: 'var(--clip-corner-md)' }}
      >
        <header
          className="flex items-center gap-3 border-b px-4 py-2"
          style={{ borderColor: 'var(--border)' }}
        >
          <h3
            className="text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: 'var(--accent-primary)' }}
          >
            {title}
          </h3>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={downloadSvg} disabled={!svg}>
              Download SVG
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </header>

        <div className="overflow-auto p-4">
          {!svg && !error && (
            <p className="animate-pulse text-sm" style={{ color: 'var(--text-muted)' }}>
              Rendering…
            </p>
          )}
          {error && (
            <div className="space-y-2">
              <p className="text-sm" style={{ color: 'var(--text-danger)' }}>
                The diagram could not be rendered.
              </p>
              <pre
                className="overflow-x-auto whitespace-pre-wrap p-3 text-xs font-mono border"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                {error}
              </pre>
            </div>
          )}
          {svg && (
            <div
              className="mermaid-chart flex justify-center [&_svg]:h-auto [&_svg]:max-w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
