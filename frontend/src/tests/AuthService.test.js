/**
 * @file AuthService.test.js
 * @description Unit tests for authService — the frontend ↔ backend API bridge.
 * Framework: Jest 29
 * Strategy: Mocks the axios instance (`api`) so no real HTTP calls are made.
 *
 * Coverage:
 *   - register()           POST /auth/register
 *   - login()              POST /auth/login
 *   - getProfile()         GET  /auth/me
 *   - updateProfile()      PUT  /auth/me
 *   - completeOnboarding() PATCH /auth/me/onboarding
 *   - changePassword()     PATCH /auth/me/password
 *   - logout()             POST /auth/logout
 */

import {
  register,
  login,
  getProfile,
  updateProfile,
  completeOnboarding,
  changePassword,
  logout,
} from '../services/authService'

// Mock the shared axios instance used by all service files
jest.mock('../services/api', () => ({
  get:   jest.fn(),
  post:  jest.fn(),
  put:   jest.fn(),
  patch: jest.fn(),
}))

import mockApi from '../services/api'

// Sample response fixtures
const MOCK_USER = {
  id: 'u123',
  name: 'Alice Smith',
  email: 'alice@focusflow.dev',
  onboarding_completed: false,
  preferences: { pomodoro_duration: 25, short_break: 5, long_break: 15, timezone: 'UTC', theme: 'light' },
  created_at: '2026-01-01T00:00:00Z',
}

const MOCK_TOKEN_RESPONSE = {
  access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
  token_type: 'bearer',
  user: MOCK_USER,
}

beforeEach(() => jest.clearAllMocks())

// ─────────────────────────────────────────────────────────────────────────────
// register()
// ─────────────────────────────────────────────────────────────────────────────
describe('register()', () => {

  /**
   * SVC-01: Sends correct POST request and returns token + user
   * Input:  name, email, password
   * Oracle: POST /auth/register called; returns access_token and user object
   */
  test('SVC-01: sends POST to /auth/register with correct payload', async () => {
    mockApi.post.mockResolvedValueOnce({ data: MOCK_TOKEN_RESPONSE })

    const result = await register('Alice Smith', 'alice@focusflow.dev', 'SecurePass1!')

    expect(mockApi.post).toHaveBeenCalledWith('/auth/register', {
      name: 'Alice Smith',
      email: 'alice@focusflow.dev',
      password: 'SecurePass1!',
    })
    expect(result.access_token).toBeDefined()
    expect(result.user.email).toBe('alice@focusflow.dev')
  })

  /**
   * SVC-02: Propagates server error (409 duplicate email)
   * Input:  register() receives 409 response
   * Oracle: Promise rejects with the original error
   */
  test('SVC-02: propagates 409 error when email is already registered', async () => {
    const err = { response: { status: 409, data: { detail: 'Email already registered' } } }
    mockApi.post.mockRejectedValueOnce(err)

    await expect(register('Bob', 'alice@focusflow.dev', 'Pass1234!')).rejects.toEqual(err)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// login()
// ─────────────────────────────────────────────────────────────────────────────
describe('login()', () => {

  /**
   * SVC-03: Sends correct POST request and returns token + user
   * Input:  email, password
   * Oracle: POST /auth/login called; returns access_token and user object
   */
  test('SVC-03: sends POST to /auth/login with email and password', async () => {
    const loginResponse = { ...MOCK_TOKEN_RESPONSE, user: { ...MOCK_USER, onboarding_completed: true } }
    mockApi.post.mockResolvedValueOnce({ data: loginResponse })

    const result = await login('alice@focusflow.dev', 'SecurePass1!')

    expect(mockApi.post).toHaveBeenCalledWith('/auth/login', {
      email: 'alice@focusflow.dev',
      password: 'SecurePass1!',
    })
    expect(result.access_token).toBeDefined()
    expect(result.user.onboarding_completed).toBe(true)
  })

  /**
   * SVC-04: Propagates 401 on wrong credentials
   * Input:  login() receives 401 response
   * Oracle: Promise rejects with the original error
   */
  test('SVC-04: propagates 401 error for invalid credentials', async () => {
    const err = { response: { status: 401, data: { detail: 'Invalid email or password' } } }
    mockApi.post.mockRejectedValueOnce(err)

    await expect(login('wrong@test.com', 'badpass')).rejects.toEqual(err)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getProfile()
// ─────────────────────────────────────────────────────────────────────────────
describe('getProfile()', () => {

  /**
   * SVC-05: GET /auth/me returns current user profile
   * Oracle: GET called; returns full user profile with preferences
   */
  test('SVC-05: sends GET to /auth/me and returns user profile', async () => {
    mockApi.get.mockResolvedValueOnce({ data: MOCK_USER })

    const result = await getProfile()

    expect(mockApi.get).toHaveBeenCalledWith('/auth/me')
    expect(result.id).toBe('u123')
    expect(result.preferences).toBeDefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// updateProfile()
// ─────────────────────────────────────────────────────────────────────────────
describe('updateProfile()', () => {

  /**
   * SVC-06: PUT /auth/me sends updated fields and returns updated user
   * Input:  { name: 'Alice Updated' }
   * Oracle: PUT called with correct body; returns updated user
   */
  test('SVC-06: sends PUT to /auth/me with updated profile data', async () => {
    const updated = { ...MOCK_USER, name: 'Alice Updated' }
    mockApi.put.mockResolvedValueOnce({ data: updated })

    const result = await updateProfile({ name: 'Alice Updated' })

    expect(mockApi.put).toHaveBeenCalledWith('/auth/me', { name: 'Alice Updated' })
    expect(result.name).toBe('Alice Updated')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// completeOnboarding()
// ─────────────────────────────────────────────────────────────────────────────
describe('completeOnboarding()', () => {

  /**
   * SVC-07: PATCH /auth/me/onboarding sends preferences and returns updated user
   * Input:  preferences object matching OnboardingPreferences schema
   * Oracle: PATCH called with { preferences: {...} }; returns user with onboarding_completed=true
   */
  test('SVC-07: sends PATCH to /auth/me/onboarding with wrapped preferences', async () => {
    const prefs = { pomodoro_duration: 30, short_break: 5, long_break: 20, timezone: 'Asia/Kolkata', theme: 'dark' }
    const updatedUser = { ...MOCK_USER, onboarding_completed: true, preferences: prefs }
    mockApi.patch.mockResolvedValueOnce({ data: updatedUser })

    const result = await completeOnboarding(prefs)

    expect(mockApi.patch).toHaveBeenCalledWith('/auth/me/onboarding', prefs)
    expect(result.onboarding_completed).toBe(true)
    expect(result.preferences.timezone).toBe('Asia/Kolkata')
  })

  /**
   * SVC-08: Propagates error if onboarding call fails
   */
  test('SVC-08: propagates error when onboarding API call fails', async () => {
    const err = { response: { status: 500, data: { detail: 'Internal server error' } } }
    mockApi.patch.mockRejectedValueOnce(err)

    await expect(completeOnboarding({ pomodoro_duration: 25 })).rejects.toEqual(err)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// changePassword()
// ─────────────────────────────────────────────────────────────────────────────
describe('changePassword()', () => {

  /**
   * SVC-09: PATCH /auth/me/password sends current and new passwords
   * Oracle: Correct endpoint + body; resolves successfully
   */
  test('SVC-09: sends PATCH to /auth/me/password with correct field names', async () => {
    mockApi.patch.mockResolvedValueOnce({ data: { message: 'Password updated' } })

    const result = await changePassword('OldPass1!', 'NewPass2@')

    expect(mockApi.patch).toHaveBeenCalledWith('/auth/me/password', {
      current_password: 'OldPass1!',
      new_password: 'NewPass2@',
    })
    expect(result.message).toBe('Password updated')
  })

  /**
   * SVC-10: Propagates 400 error when current password is wrong
   */
  test('SVC-10: propagates 400 error when current password is incorrect', async () => {
    const err = { response: { status: 400, data: { detail: 'Current password is incorrect' } } }
    mockApi.patch.mockRejectedValueOnce(err)

    await expect(changePassword('WrongOld!', 'NewPass2@')).rejects.toEqual(err)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// logout()
// ─────────────────────────────────────────────────────────────────────────────
describe('logout()', () => {

  /**
   * SVC-11: POST /auth/logout — fire-and-forget, resolves silently
   */
  test('SVC-11: sends POST to /auth/logout and resolves', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { message: 'Logged out' } })

    await expect(logout()).resolves.not.toThrow()
    expect(mockApi.post).toHaveBeenCalledWith('/auth/logout')
  })
})
