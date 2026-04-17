/**
 * CustomCursor — dot + trailing ring that grows on interactive elements.
 *
 * Only mounts on fine-pointer devices (skips touch). Doesn't hide the native
 * cursor — sits on top with pointer-events: none as an accent layer.
 */

import React, { useEffect, useRef, useState } from 'react'

export default function CustomCursor() {
  const dotRef = useRef(null)
  const [hidden, setHidden]     = useState(true)
  const [active, setActive]     = useState(false)
  const [disabled, setDisabled] = useState(false)

  useEffect(() => {
    // Skip on coarse / touch pointers
    if (typeof window === 'undefined') return
    if (!window.matchMedia?.('(pointer: fine)').matches) {
      setDisabled(true)
      return
    }

    // Hide native cursor globally while this component is mounted
    document.documentElement.classList.add('custom-cursor')

    const dot = dotRef.current
    if (!dot) return

    let mx = window.innerWidth / 2
    let my = window.innerHeight / 2
    let raf

    function loop() {
      dot.style.transform = `translate3d(${mx}px, ${my}px, 0) translate(-50%, -50%)`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    const onMove = (e) => {
      mx = e.clientX
      my = e.clientY
      if (hidden) setHidden(false)
    }
    const onLeave = () => setHidden(true)
    const onEnter = () => setHidden(false)

    const interactiveSel = 'a, button, [role="button"], input, textarea, select, [data-cursor="hover"]'
    const onOver = (e) => {
      if (e.target.closest?.(interactiveSel)) setActive(true)
    }
    const onOut = (e) => {
      if (e.target.closest?.(interactiveSel)) setActive(false)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseenter', onEnter)
    document.addEventListener('mouseleave', onLeave)
    document.addEventListener('mouseover', onOver)
    document.addEventListener('mouseout', onOut)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseenter', onEnter)
      document.removeEventListener('mouseleave', onLeave)
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mouseout', onOut)
      document.documentElement.classList.remove('custom-cursor')
    }
  }, [hidden])

  if (disabled) return null

  // A single small forest dot. Scales up slightly on interactives.
  return (
    <div
      ref={dotRef}
      className="pointer-events-none fixed top-0 left-0 rounded-full"
      style={{
        width:  active ? 12 : 8,
        height: active ? 12 : 8,
        background: '#3a6758',
        opacity: hidden ? 0 : (active ? 1 : 0.85),
        transition:
          'opacity 0.2s ease, ' +
          'width 0.2s cubic-bezier(.22,1,.36,1), ' +
          'height 0.2s cubic-bezier(.22,1,.36,1)',
        zIndex: 9999,
      }}
    />
  )
}
