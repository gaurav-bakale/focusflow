/**
 * SketchLine — A hand-drawn SVG underline that animates in.
 *
 * Usage: wrap a parent with className="sketch-hover" and place
 * <SketchLine color="..." /> inside it. The line draws on hover.
 * Add className="sketch-active" to parent to keep it drawn.
 */

import React from 'react'

const PATHS = [
  // Slightly wavy, like a quick pen stroke
  'M0,3 C8,1 16,5 24,3 C32,1 40,5 48,3 C56,1 64,5 72,2 C80,4 88,1 96,3 C104,5 112,2 120,3 C128,4 136,1 144,3 C152,5 160,2 168,3 C176,1 184,5 192,3 C200,1 208,4 216,3 C224,2 232,5 240,3 C248,1 256,4 264,3 C272,2 280,5 288,3 C296,1 300,3 300,3',
  // More jittery variant
  'M0,3 C6,1 12,5 20,2 C28,5 36,1 44,4 C52,1 60,5 68,2 C76,4 84,1 92,3 C100,5 108,2 116,4 C124,1 132,5 140,2 C148,4 156,1 164,3 C172,5 180,2 188,4 C196,1 204,5 212,3 C220,1 228,4 236,2 C244,5 252,1 260,3 C268,5 276,2 284,4 C292,1 300,3 300,3',
]

export default function SketchLine({ color = '#34D399', width = '100%', thickness = 3 }) {
  // Pick a deterministic path based on color to add variety
  const pathIndex = color.charCodeAt(color.length - 1) % PATHS.length
  const d = PATHS[pathIndex]

  return (
    <span className="sketch-line absolute bottom-0 left-0 right-0 block" style={{ height: thickness + 4 }}>
      <svg
        viewBox="0 0 300 6"
        preserveAspectRatio="none"
        style={{ width, height: thickness + 4, display: 'block' }}
      >
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
}
