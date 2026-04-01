/**
 * @file api.test.js
 * @description Tests for the axios API client interceptor logic.
 * Tests: Interceptor pattern (Chain of Responsibility) + Singleton + Proxy pattern
 *
 * Framework: Jest 29
 * Strategy:
 *   - axios is mocked at the module level.
 *   - Request/response interceptors exercised by simulating axios calls.
 *   - localStorage manipulation verified directly.
 *   - window.location.href redirect verified via mock.
 *
 * Test oracle convention:
 *   Each test has: // Input: ... | Oracle: ... | Pass: ...
 */

// ── Mock axios before importing api ───────────────────────────────────────────
const mockRequestInterceptors  = []
const mockResponseInterceptors = []

// Capture interceptors so we can invoke them directly
const mockAxiosInstance = {
  interceptors: {
    request: {
      use: jest.fn((fn) => { mockRequestInterceptors.push(fn); return 0 }),
    },
    response: {
      use: jest.fn((onFulfilled, onRejected) => {
        mockResponseInterceptors.push({ onFulfilled, onRejected }); return 0
      }),
    },
  },
  get:    jest.fn(),
  post:   jest.fn(),
  put:    jest.fn(),
  delete: jest.fn(),
}

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => mockAxiosInstance),
  },
}))

// Import api AFTER mock is set up so the interceptors are registered
const { default: api } = require('../services/api')

// ── Helpers ───────────────────────────────────────────────────────────────────
function invokeRequestInterceptor(config) {
  // Run all registered request interceptors in order
  return mockRequestInterceptors.reduce((cfg, fn) => fn(cfg), config)
}

async function invokeResponseSuccess(response) {
  let result = response
  for (const { onFulfilled } of mockResponseInterceptors) {
    if (onFulfilled) result = await onFulfilled(result)
  }
  return result
}

async function invokeResponseError(err) {
  let caughtErr = err
  for (const { onRejected } of mockResponseInterceptors) {
    if (onRejected) {
      try {
        return await onRejected(caughtErr)
      } catch (e) {
        caughtErr = e
      }
    }
  }
  throw caughtErr
}

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  // Reset location mock
  delete window.location
  window.location = { href: '' }
})

afterEach(() => {
  localStorage.clear()
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — request interceptor
// Tests: Interceptor pattern (Chain of Responsibility) + Proxy pattern
// ─────────────────────────────────────────────────────────────────────────────
describe('request interceptor', () => {
  /**
   * API-01: Attaches Authorization header when token in localStorage
   * // Input: localStorage has ff_token="my-jwt-token", request config {} | Oracle: config.headers.Authorization = "Bearer my-jwt-token" | Pass: header set
   */
  it('Attaches Authorization header when token in localStorage', () => {
    // Arrange
    localStorage.setItem('ff_token', 'my-jwt-token')
    const config = { headers: {} }

    // Act
    const result = invokeRequestInterceptor(config)

    // Assert
    expect(result.headers.Authorization).toBe('Bearer my-jwt-token')
  })

  /**
   * API-02: Does NOT attach header when no token
   * // Input: localStorage empty, request config {} | Oracle: config.headers.Authorization undefined | Pass: no Authorization header
   */
  it('Does NOT attach header when no token', () => {
    // Arrange
    localStorage.removeItem('ff_token')
    const config = { headers: {} }

    // Act
    const result = invokeRequestInterceptor(config)

    // Assert
    expect(result.headers.Authorization).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — response interceptor
// Tests: Interceptor pattern (Chain of Responsibility) + Singleton pattern
// ─────────────────────────────────────────────────────────────────────────────
describe('response interceptor', () => {
  /**
   * API-03: On 401 from non-auth endpoint: clears localStorage and redirects to /login
   * // Input: 401 response from /tasks | Oracle: localStorage cleared, window.location.href = /login | Pass: storage cleared + redirect
   */
  it('On 401 from non-auth endpoint: clears localStorage and redirects to /login', async () => {
    // Arrange
    localStorage.setItem('ff_token', 'old-token')
    localStorage.setItem('ff_user', JSON.stringify({ id: 'u1' }))
    const err = {
      config:   { url: '/tasks' },
      response: { status: 401 },
    }

    // Act
    await expect(invokeResponseError(err)).rejects.toMatchObject({ response: { status: 401 } })

    // Assert
    expect(localStorage.getItem('ff_token')).toBeNull()
    expect(localStorage.getItem('ff_user')).toBeNull()
    expect(window.location.href).toBe('/login')
  })

  /**
   * API-04: On 401 from /auth/login endpoint: does NOT redirect (just rejects)
   * // Input: 401 response from /auth/login | Oracle: window.location.href unchanged, error rejected | Pass: no redirect
   */
  it('On 401 from /auth/login endpoint: does NOT redirect (just rejects)', async () => {
    // Arrange
    const err = {
      config:   { url: '/auth/login' },
      response: { status: 401 },
    }

    // Act
    await expect(invokeResponseError(err)).rejects.toBeDefined()

    // Assert — no redirect happened
    expect(window.location.href).not.toBe('/login')
  })

  /**
   * API-05: On 401 from /auth/register endpoint: does NOT redirect
   * // Input: 401 response from /auth/register | Oracle: no redirect, error rejected | Pass: href unchanged
   */
  it('On 401 from /auth/register endpoint: does NOT redirect', async () => {
    // Arrange
    const err = {
      config:   { url: '/auth/register' },
      response: { status: 401 },
    }

    // Act
    await expect(invokeResponseError(err)).rejects.toBeDefined()

    // Assert
    expect(window.location.href).not.toBe('/login')
  })

  /**
   * API-06: On 200: passes through response unchanged
   * // Input: successful 200 response object | Oracle: same object returned | Pass: response identity preserved
   */
  it('On 200: passes through response unchanged', async () => {
    // Arrange
    const response = { status: 200, data: { tasks: [] } }

    // Act
    const result = await invokeResponseSuccess(response)

    // Assert
    expect(result).toBe(response)
    expect(result.data).toEqual({ tasks: [] })
  })

  /**
   * API-07: On 500: rejects with error
   * // Input: 500 error | Oracle: error is rejected (not swallowed) | Pass: promise rejects
   */
  it('On 500: rejects with error', async () => {
    // Arrange
    const err = {
      config:   { url: '/tasks' },
      response: { status: 500, data: { detail: 'Internal Server Error' } },
    }

    // Act / Assert — should reject, not redirect
    await expect(invokeResponseError(err)).rejects.toMatchObject({
      response: { status: 500 },
    })
    // No redirect for 500
    expect(window.location.href).not.toBe('/login')
  })
})
