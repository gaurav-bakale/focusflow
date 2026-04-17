/**
 * Odometer — slot-machine digit roll.
 *
 * Renders a number where each digit column animates vertically to its target.
 * Non-digit characters pass through. Supports optional decimals + suffix.
 *
 * Usage:
 *   <Odometer value={42} />
 *   <Odometer value={3.7} decimals={1} suffix="h" />
 *   <Odometer value={85} suffix="%" />
 */

import React from 'react'

function Digit({ d, delayMs }) {
  const n = parseInt(d, 10)
  return (
    <span
      className="inline-block overflow-hidden align-top"
      style={{ height: '1em', lineHeight: 1 }}
      aria-hidden="true"
    >
      <span
        className="inline-block"
        style={{
          transform: `translateY(-${n}em)`,
          transition: `transform 900ms cubic-bezier(.22,1,.36,1) ${delayMs}ms`,
        }}
      >
        {[0,1,2,3,4,5,6,7,8,9].map(i => (
          <span key={i} className="block" style={{ height: '1em', lineHeight: 1 }}>{i}</span>
        ))}
      </span>
    </span>
  )
}

export default function Odometer({ value, decimals = 0, suffix = '' }) {
  const safe = Number.isFinite(+value) ? +value : 0
  const str = decimals > 0 ? safe.toFixed(decimals) : String(Math.round(safe))

  // Stagger each digit for a nicer cascade
  const chars = str.split('')
  return (
    <span className="inline-flex items-baseline">
      <span className="sr-only">{str}{suffix}</span>
      <span aria-hidden="true" className="inline-flex items-baseline">
        {chars.map((c, i) => (
          /\d/.test(c)
            ? <Digit key={i} d={c} delayMs={i * 70} />
            : <span key={i}>{c}</span>
        ))}
        {suffix && <span>{suffix}</span>}
      </span>
    </span>
  )
}
