/**
 * useMagnetic — pulls an element toward the cursor within a radius.
 *
 * Usage:
 *   const ref = useMagnetic()
 *   <button ref={ref}>Click me</button>
 */

import { useEffect, useRef } from 'react'

export default function useMagnetic({ strength = 0.25, radius = 90 } = {}) {
  const ref = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.matchMedia?.('(pointer: fine)').matches) return

    let raf = null
    let tx = 0, ty = 0, cx = 0, cy = 0

    const apply = () => {
      const el = ref.current
      if (!el) { raf = null; return }
      cx += (tx - cx) * 0.18
      cy += (ty - cy) * 0.18
      el.style.transform = `translate(${cx}px, ${cy}px)`
      if (Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1) {
        raf = requestAnimationFrame(apply)
      } else {
        raf = null
      }
    }

    const onMove = (e) => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) return
      const mx = r.left + r.width / 2
      const my = r.top + r.height / 2
      const dx = e.clientX - mx
      const dy = e.clientY - my
      const dist = Math.hypot(dx, dy)
      if (dist < radius) {
        tx = dx * strength
        ty = dy * strength
      } else {
        tx = 0
        ty = 0
      }
      if (!raf) raf = requestAnimationFrame(apply)
    }

    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      if (raf) cancelAnimationFrame(raf)
      if (ref.current) ref.current.style.transform = ''
    }
  }, [strength, radius])

  return ref
}
