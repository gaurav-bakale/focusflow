/**
 * @file AuthContext.test.jsx
 * @description Unit tests for AuthContext — the global auth state provider.
 * Framework: Jest 29 + @testing-library/react
 *
 * Key security feature under test:
 *   On mount, if `ff_token` exists in localStorage, AuthProvider calls getProfile()
 *   (GET /api/auth/me) to validate the token with the backend.
 *   - On success  → sets user from the response, loading=false
 *   - On failure  → clears localStorage (ff_token + ff_user), sets user=null, loading=false
 *
 * Coverage:
 *   AUTH-CTX-01: No token → loading=false, user=null, getProfile NOT called
 *   AUTH-CTX-02: Valid token + getProfile resolves → user set, loading=false
 *   AUTH-CTX-03: Valid token + getProfile rejects → localStorage cleared, user=null, loading=false
 *   AUTH-CTX-04: login() stores token + user in localStorage, sets user state
 *   AUTH-CTX-05: logout() clears localStorage, sets user=null
 */

import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '../context/AuthContext'

// ── Mock authService ──────────────────────────────────────────────────────────
// All service functions are replaced with jest.fn() so no real HTTP calls occur.
jest.mock('../services/authService', () => ({
  getProfile:          jest.fn(),
  login:               jest.fn(),
  register:            jest.fn(),
  logout:              jest.fn(),
  completeOnboarding:  jest.fn(),
}))

import {
  getProfile as mockGetProfile,
  login      as mockLoginApi,
  logout     as mockLogoutApi,
} from '../services/authService'

// ── Fixtures ──────────────────────────────────────────────────────────────────
const MOCK_USER = {
  id: 'u1',
  name: 'Alice',
  email: 'alice@focusflow.dev',
  preferences: { pomodoro_duration: 25, short_break: 5, long_break: 15 },
}
const MOCK_TOKEN = 'test.jwt.token'

// ── Wrapper ───────────────────────────────────────────────────────────────────
const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>

// ── Setup / Teardown ──────────────────────────────────────────────────────────
beforeEach(() => {
  // Start every test with a clean localStorage and no pending mock state
  localStorage.clear()
  jest.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// AUTH-CTX-01
// ─────────────────────────────────────────────────────────────────────────────
describe('AUTH-CTX-01: no token in localStorage', () => {
  /**
   * When there is no ff_token, the provider should skip the getProfile call
   * and immediately settle into loading=false with user=null.
   */
  test('loading becomes false, user is null, getProfile is never called', async () => {
    // Ensure localStorage has no token (already cleared in beforeEach)
    const { result } = renderHook(() => useAuth(), { wrapper })

    // Wait for the effect to run and loading to settle
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.user).toBeNull()
    expect(mockGetProfile).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AUTH-CTX-02
// ─────────────────────────────────────────────────────────────────────────────
describe('AUTH-CTX-02: valid token + getProfile resolves', () => {
  /**
   * When ff_token is present and getProfile() resolves successfully,
   * the user should be set from the response and loading should become false.
   */
  test('user is set from profile response and loading becomes false', async () => {
    localStorage.setItem('ff_token', MOCK_TOKEN)
    mockGetProfile.mockResolvedValueOnce(MOCK_USER)

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(mockGetProfile).toHaveBeenCalledTimes(1)
    expect(result.current.user).toEqual(MOCK_USER)
    // Token must NOT have been cleared on success
    expect(localStorage.getItem('ff_token')).toBe(MOCK_TOKEN)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AUTH-CTX-03
// ─────────────────────────────────────────────────────────────────────────────
describe('AUTH-CTX-03: valid token + getProfile rejects (expired/invalid)', () => {
  /**
   * When ff_token is present but getProfile() rejects (e.g. 401 expired token),
   * the provider must:
   *   1. Remove ff_token from localStorage
   *   2. Remove ff_user from localStorage
   *   3. Leave user as null
   *   4. Set loading=false
   */
  test('localStorage is cleared, user stays null, loading becomes false', async () => {
    localStorage.setItem('ff_token', MOCK_TOKEN)
    localStorage.setItem('ff_user', JSON.stringify(MOCK_USER))
    mockGetProfile.mockRejectedValueOnce(new Error('401 Unauthorized'))

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(mockGetProfile).toHaveBeenCalledTimes(1)
    expect(result.current.user).toBeNull()
    expect(localStorage.getItem('ff_token')).toBeNull()
    expect(localStorage.getItem('ff_user')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AUTH-CTX-04
// ─────────────────────────────────────────────────────────────────────────────
describe('AUTH-CTX-04: login()', () => {
  /**
   * login() should call the API service, persist the token and user to
   * localStorage, and update the user state in the context.
   */
  test('stores token + user in localStorage and sets user state', async () => {
    // No pre-existing token → mount quickly without getProfile
    mockGetProfile.mockResolvedValue(MOCK_USER) // guard — should not be called in this path
    const loginResponse = { access_token: MOCK_TOKEN, user: MOCK_USER }
    mockLoginApi.mockResolvedValueOnce(loginResponse)

    const { result } = renderHook(() => useAuth(), { wrapper })

    // Wait for the initial mount effect to finish
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.login('alice@focusflow.dev', 'Secret123!')
    })

    expect(mockLoginApi).toHaveBeenCalledWith('alice@focusflow.dev', 'Secret123!')
    expect(result.current.user).toEqual(MOCK_USER)
    expect(localStorage.getItem('ff_token')).toBe(MOCK_TOKEN)
    expect(JSON.parse(localStorage.getItem('ff_user'))).toEqual(MOCK_USER)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AUTH-CTX-05
// ─────────────────────────────────────────────────────────────────────────────
describe('AUTH-CTX-05: logout()', () => {
  /**
   * logout() should:
   *   1. Fire the logout API call (fire-and-forget — failure is swallowed)
   *   2. Remove ff_token and ff_user from localStorage
   *   3. Set user to null in state
   */
  test('clears localStorage and sets user to null', async () => {
    // Start with a logged-in session
    localStorage.setItem('ff_token', MOCK_TOKEN)
    localStorage.setItem('ff_user', JSON.stringify(MOCK_USER))
    mockGetProfile.mockResolvedValueOnce(MOCK_USER)
    mockLogoutApi.mockResolvedValueOnce(undefined)

    const { result } = renderHook(() => useAuth(), { wrapper })

    // Wait for rehydration to finish
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.user).toEqual(MOCK_USER)

    // Now log out
    act(() => {
      result.current.logout()
    })

    expect(result.current.user).toBeNull()
    expect(localStorage.getItem('ff_token')).toBeNull()
    expect(localStorage.getItem('ff_user')).toBeNull()
  })

  test('logout() swallows API errors and still clears state', async () => {
    localStorage.setItem('ff_token', MOCK_TOKEN)
    mockGetProfile.mockResolvedValueOnce(MOCK_USER)
    // Simulate the logout API itself throwing
    mockLogoutApi.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))

    // Should not throw even though API fails
    expect(() =>
      act(() => { result.current.logout() })
    ).not.toThrow()

    expect(result.current.user).toBeNull()
    expect(localStorage.getItem('ff_token')).toBeNull()
  })
})
