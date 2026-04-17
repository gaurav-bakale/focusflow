import '@testing-library/jest-dom'

// ── Canvas stub ───────────────────────────────────────────────────────────────
// jsdom doesn't implement canvas. WebGLBackground + canvas-confetti both call
// getContext; returning a no-op 2D/WebGL context keeps them from throwing.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function () {
    return {
      fillRect: () => {}, clearRect: () => {}, getImageData: () => ({ data: [] }),
      putImageData: () => {}, createImageData: () => [], setTransform: () => {},
      drawImage: () => {}, save: () => {}, restore: () => {},
      beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, closePath: () => {},
      stroke: () => {}, fill: () => {}, translate: () => {}, scale: () => {},
      rotate: () => {}, arc: () => {}, measureText: () => ({ width: 0 }),
      transform: () => {}, rect: () => {}, clip: () => {},
      // WebGL stubs
      viewport: () => {}, createShader: () => ({}), shaderSource: () => {},
      compileShader: () => {}, getShaderParameter: () => true,
      createProgram: () => ({}), attachShader: () => {}, linkProgram: () => {},
      getProgramParameter: () => true, useProgram: () => {},
      createBuffer: () => ({}), bindBuffer: () => {}, bufferData: () => {},
      getAttribLocation: () => 0, enableVertexAttribArray: () => {},
      vertexAttribPointer: () => {}, getUniformLocation: () => ({}),
      uniform1f: () => {}, uniform2f: () => {}, uniform3fv: () => {},
      drawArrays: () => {}, deleteBuffer: () => {}, deleteProgram: () => {},
      deleteShader: () => {},
    }
  }
}

// ── Confetti stub ─────────────────────────────────────────────────────────────
jest.mock('canvas-confetti', () => jest.fn())
