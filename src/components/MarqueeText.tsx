import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Text in a box of fixed height. When it does not fit, it drifts up and back down instead of making
 * the box taller.
 *
 * This exists because a growing panel is not merely untidy in a dialog: the loadout window is centred,
 * so a taller detail panel resizes and re-centres the whole dialog, moving the grid out from under the
 * pointer that triggered it. Clamping to a fixed height fixes that, but then a long description is
 * simply cut off -- so the overflow scrolls back and forth and stays readable.
 *
 * Only overflowing content animates; short text sits still. The distance and duration are measured
 * from the real rendered text rather than guessed from its length, because wrapping makes character
 * count a poor predictor of height.
 */
export function MarqueeText({
  children,
  height,
  className,
  style,
  /** Pixels travelled per second. Slow enough to read while still completing a pass. */
  speed = 14
}: {
  children: React.ReactNode
  /** The box's fixed height in pixels. */
  height: number
  className?: string
  style?: React.CSSProperties
  /** Pixels travelled per second. */
  speed?: number
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [shift, setShift] = useState(0)

  // Measured in a layout effect so the first paint already has the right animation -- otherwise a long
  // description visibly jumps as the animation is attached a frame later.
  useLayoutEffect(() => {
    const box = boxRef.current
    const inner = innerRef.current
    if (!box || !inner) return

    const measure = () => {
      const overflow = inner.scrollHeight - box.clientHeight
      setShift(overflow > 2 ? overflow : 0)
    }

    measure()

    // Content can reflow after mount -- a font finishing loading, the panel changing width. Watch for
    // it rather than measuring once and trusting it forever.
    const ro = new ResizeObserver(measure)
    ro.observe(inner)
    ro.observe(box)
    return () => ro.disconnect()
  }, [children, height])

  // Restart the animation whenever the content changes, so a newly hovered item begins from the top
  // rather than wherever the previous one happened to be.
  const [runId, setRunId] = useState(0)
  useEffect(() => setRunId((n) => n + 1), [children])

  return (
    <div
      ref={boxRef}
      className={className}
      style={{ ...style, height, overflow: 'hidden', position: 'relative' }}
    >
      <div
        key={runId}
        ref={innerRef}
        className={shift > 0 ? 'marquee-y' : undefined}
        style={
          shift > 0
            ? ({
                '--marquee-shift': `-${shift}px`,
                // Constant speed regardless of length, with a floor so a barely-overflowing block
                // does not whip past.
                '--marquee-time': `${Math.max(3, shift / speed).toFixed(1)}s`
              } as React.CSSProperties)
            : undefined
        }
      >
        {children}
      </div>
    </div>
  )
}
