/**
 * WebGLBackground — animated noise-shader gradient mesh.
 *
 * A single full-screen fragment shader with domain-warped fBm noise.
 * Four colors in the palette shift with time of day + current focus phase,
 * and cross-fade smoothly when either changes.
 *
 * Perf: one triangle, ~4 octaves fBm, DPR capped at 1.5. Sub-millisecond
 * on any modern GPU. Respects prefers-reduced-motion (static frame).
 */

import React, { useEffect, useRef } from 'react'
import { useTimer } from '../context/TimerContext'
import { PHASES } from '../context/timerPhases'

// ── Palettes ──────────────────────────────────────────────────────────────────
// All intentionally pale — UI text must stay legible on top.
const hex = (h) => {
  const n = h.replace('#', '')
  return [
    parseInt(n.slice(0,2), 16) / 255,
    parseInt(n.slice(2,4), 16) / 255,
    parseInt(n.slice(4,6), 16) / 255,
  ]
}

const PALETTES = {
  morning:   ['#fde8d3', '#f5ead0', '#e5eed5', '#ece0e8'].map(hex), // peach → mint → lilac
  afternoon: ['#f5edd8', '#e4ead0', '#f0e5c3', '#dde6e8'].map(hex), // butter → sage → sky
  evening:   ['#f0dadc', '#e5ddea', '#f5e2d0', '#e0d5e3'].map(hex), // rose → lavender → plum
  night:     ['#d8dde8', '#c8cfdf', '#d0d5dd', '#dae2eb'].map(hex), // dusk blue-greys
  focus:     ['#d4e6d0', '#c3d9bd', '#a8c4a0', '#dae8d4'].map(hex), // forest
  shortBrk:  ['#d8ecdd', '#c8e0d1', '#e0f0e4', '#b8d8c0'].map(hex), // mint
  longBrk:   ['#d5e3ec', '#c2d4e0', '#e0ebf0', '#b4c9d8'].map(hex), // sky
}

function paletteForContext(phase, hour) {
  if (phase === PHASES.FOCUS)       return PALETTES.focus
  if (phase === PHASES.SHORT_BREAK) return PALETTES.shortBrk
  if (phase === PHASES.LONG_BREAK)  return PALETTES.longBrk
  if (hour < 6 || hour >= 21)       return PALETTES.night
  if (hour < 11)                    return PALETTES.morning
  if (hour < 17)                    return PALETTES.afternoon
  return PALETTES.evening
}

// ── Shaders ───────────────────────────────────────────────────────────────────
const VERT = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

const FRAG = `
precision highp float;

uniform vec2  uResolution;
uniform float uTime;
uniform vec3  uC1;
uniform vec3  uC2;
uniform vec3  uC3;
uniform vec3  uC4;

// Classic Ashima 2D simplex noise
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * snoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  // Correct aspect so blobs don't look stretched
  vec2 p = uv;
  p.x *= uResolution.x / uResolution.y;

  float t = uTime * 0.04;

  // Two warp layers
  vec2 q = vec2(fbm(p + vec2(0.0, t)),
                fbm(p + vec2(5.2, t * 0.8)));
  vec2 r = vec2(fbm(p + q * 1.4 + vec2(1.7, 9.2) + t),
                fbm(p + q * 1.4 + vec2(8.3, 2.8) + t));

  float n = fbm(p + r * 1.6);
  n = clamp(0.5 + 0.5 * n, 0.0, 1.0);

  // Four-color blend along n
  vec3 c = mix(uC1, uC2, smoothstep(0.0, 0.40, n));
  c      = mix(c,   uC3, smoothstep(0.35, 0.75, n));
  c      = mix(c,   uC4, smoothstep(0.70, 1.0,  n));

  // Base tint — pull everything closer to warm off-white so the gradient
  // reads as a whisper behind UI chrome rather than a marble texture.
  vec3 base = vec3(0.980, 0.980, 0.960);
  c = mix(base, c, 0.52);

  // Soft vignette toward the base for edge calm
  float vig = smoothstep(0.95, 0.15, distance(uv, vec2(0.5)));
  c = mix(c, base, 0.18 * (1.0 - vig));

  gl_FragColor = vec4(c, 1.0);
}
`

// ── Component ─────────────────────────────────────────────────────────────────
export default function WebGLBackground() {
  const canvasRef = useRef(null)
  const { phase } = useTimer()
  const phaseRef  = useRef(phase)
  useEffect(() => { phaseRef.current = phase }, [phase])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false })
    if (!gl) return

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    // Compile shaders
    function compile(type, src) {
      const s = gl.createShader(type)
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(s))
        gl.deleteShader(s)
        return null
      }
      return s
    }
    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) return

    const program = gl.createProgram()
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program))
      return
    }
    gl.useProgram(program)

    // Full-screen triangle (covers clip space 3x larger than viewport)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const aPosition = gl.getAttribLocation(program, 'aPosition')
    gl.enableVertexAttribArray(aPosition)
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0)

    const uTime = gl.getUniformLocation(program, 'uTime')
    const uRes  = gl.getUniformLocation(program, 'uResolution')
    const uC1   = gl.getUniformLocation(program, 'uC1')
    const uC2   = gl.getUniformLocation(program, 'uC2')
    const uC3   = gl.getUniformLocation(program, 'uC3')
    const uC4   = gl.getUniformLocation(program, 'uC4')

    // Current + target colors for smooth crossfade
    const initialPal = paletteForContext(phaseRef.current, new Date().getHours())
    const current = initialPal.map(c => [...c])
    let   target  = initialPal.map(c => [...c])

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const w = Math.floor(canvas.clientWidth  * dpr)
      const h = Math.floor(canvas.clientHeight * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width  = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    // Re-evaluate palette every 60s (for time-of-day transitions)
    // and whenever phase changes.
    function refreshTarget() {
      target = paletteForContext(phaseRef.current, new Date().getHours())
    }
    const timeInterval = setInterval(refreshTarget, 60 * 1000)

    // Render loop
    let raf
    const start = performance.now()
    function frame(now) {
      // Re-check target each frame — phase may have flipped
      refreshTarget()
      // Ease current toward target
      const ease = 0.015
      for (let i = 0; i < 4; i++) {
        for (let c = 0; c < 3; c++) {
          current[i][c] += (target[i][c] - current[i][c]) * ease
        }
      }
      const t = reduced ? 0 : (now - start) / 1000
      gl.uniform1f(uTime, t)
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform3fv(uC1, current[0])
      gl.uniform3fv(uC2, current[1])
      gl.uniform3fv(uC3, current[2])
      gl.uniform3fv(uC4, current[3])
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      clearInterval(timeInterval)
      ro.disconnect()
      gl.deleteBuffer(buf)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  )
}
