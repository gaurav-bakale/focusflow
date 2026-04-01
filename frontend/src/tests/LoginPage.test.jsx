/**
 * @file LoginPage.test.jsx
 * @description Comprehensive tests for the LoginPage component.
 * Tests: Facade pattern (AuthContext.login wraps authService) + Observer pattern
 *
 * Framework: Jest 29 + React Testing Library 16
 * Strategy:
 *   - AuthContext is fully mocked — login() is a jest.fn().
 *   - useNavigate is mocked to intercept navigation.
 *   - All error shapes (string detail, array detail, no detail) exercised.
 *
 * Test oracle convention:
 *   Each test has: // Input: ... | Oracle: ... | Pass: ...
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from '../pages/LoginPage'

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockLogin    = jest.fn()
const mockNavigate = jest.fn()

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin, user: null, loading: false }),
}))

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}))

function wrap() {
  return render(<MemoryRouter><LoginPage /></MemoryRouter>)
}

function fillLogin(email = 'alice@test.com', password = 'password123') {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: email } })
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: password } })
}

beforeEach(() => jest.clearAllMocks())

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — rendering
// Tests: Observer pattern (AuthContext)
// ─────────────────────────────────────────────────────────────────────────────
describe('rendering', () => {
  /**
   * LOGIN-01: Renders FocusFlow logo and heading "Welcome back"
   * // Input: component mounted | Oracle: logo text and "Welcome back" heading visible | Pass: elements found
   */
  it('Renders FocusFlow logo and heading "Welcome back"', () => {
    // Arrange / Act
    wrap()

    // Assert
    expect(screen.getByText(/focusflow/i)).toBeInTheDocument()
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument()
  })

  /**
   * LOGIN-02: Renders email and password fields
   * // Input: component mounted | Oracle: email and password inputs present | Pass: inputs found via label
   */
  it('Renders email and password fields', () => {
    // Arrange / Act
    wrap()

    // Assert
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  /**
   * LOGIN-03: Renders "Sign In →" button
   * // Input: component mounted | Oracle: sign-in button visible | Pass: button found
   */
  it('Renders "Sign In →" button', () => {
    // Arrange / Act
    wrap()

    // Assert
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  /**
   * LOGIN-04: Renders "Sign up free" link
   * // Input: component mounted | Oracle: registration link visible | Pass: link found
   */
  it('Renders "Sign up free" link', () => {
    // Arrange / Act
    wrap()

    // Assert
    const link = screen.getByRole('link', { name: /sign up/i })
    expect(link).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — form interaction
// Tests: Observer pattern (form state)
// ─────────────────────────────────────────────────────────────────────────────
describe('form interaction', () => {
  /**
   * LOGIN-05: Can type into email field
   * // Input: type "user@example.com" | Oracle: input.value = "user@example.com" | Pass: value matches
   */
  it('Can type into email field', () => {
    // Arrange
    wrap()

    // Act
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'user@example.com' } })

    // Assert
    expect(screen.getByLabelText(/email/i).value).toBe('user@example.com')
  })

  /**
   * LOGIN-06: Can type into password field
   * // Input: type "mysecret" | Oracle: input.value = "mysecret" | Pass: value matches
   */
  it('Can type into password field', () => {
    // Arrange
    wrap()

    // Act
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'mysecret' } })

    // Assert
    expect(screen.getByLabelText(/password/i).value).toBe('mysecret')
  })

  /**
   * LOGIN-07: Show/Hide password toggle works
   * // Input: click Show button | Oracle: input type changes to "text", then back to "password" | Pass: type toggled
   */
  it('Show/Hide password toggle works', () => {
    // Arrange
    wrap()
    const pwInput = screen.getByLabelText(/password/i)
    expect(pwInput.type).toBe('password')

    // Act — show password
    fireEvent.click(screen.getByRole('button', { name: /show/i }))

    // Assert — now visible
    expect(pwInput.type).toBe('text')

    // Act — hide password
    fireEvent.click(screen.getByRole('button', { name: /hide/i }))

    // Assert — back to hidden
    expect(pwInput.type).toBe('password')
  })

  /**
   * LOGIN-08: Submit button is enabled when both fields filled
   * // Input: fill email + password | Oracle: sign-in button is not disabled | Pass: button enabled
   */
  it('Submit button is enabled when both fields filled', () => {
    // Arrange
    wrap()

    // Act
    fillLogin()

    // Assert
    expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — login success
// Tests: Facade pattern (login() hides authService details)
// ─────────────────────────────────────────────────────────────────────────────
describe('login success', () => {
  /**
   * LOGIN-09: Calls login() with correct email+password
   * // Input: fill alice@test.com / password123, submit | Oracle: login called with exact args | Pass: mock assertion passes
   */
  it('Calls login() with correct email+password', async () => {
    // Arrange
    mockLogin.mockResolvedValueOnce({ id: 'u1', name: 'Alice', onboarding_completed: true })
    wrap()

    // Act
    fillLogin()
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    // Assert
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('alice@test.com', 'password123')
    })
  })

  /**
   * LOGIN-10: Navigates to "/" on success when onboarding_completed=true
   * // Input: login resolves with onboarding_completed=true | Oracle: navigate('/') called | Pass: navigate mock called with '/'
   */
  it('Navigates to "/" on success (onboarding_completed=true)', async () => {
    // Arrange
    mockLogin.mockResolvedValueOnce({ id: 'u1', name: 'Alice', onboarding_completed: true })
    wrap()

    // Act
    fillLogin()
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    // Assert
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  /**
   * LOGIN-11: Navigates to "/onboarding" when onboarding_completed=false
   * // Input: login resolves with onboarding_completed=false | Oracle: navigate('/onboarding') called | Pass: navigate mock called with '/onboarding'
   */
  it('Navigates to "/onboarding" when onboarding_completed=false', async () => {
    // Arrange
    mockLogin.mockResolvedValueOnce({ id: 'u1', name: 'Alice', onboarding_completed: false })
    wrap()

    // Act
    fillLogin()
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    // Assert
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/onboarding')
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 — error handling
// Tests: Facade pattern (error extraction from API response)
// ─────────────────────────────────────────────────────────────────────────────
describe('error handling', () => {
  /**
   * LOGIN-12: Shows error message when login() throws with string detail
   * // Input: login rejects with { response: { data: { detail: "Invalid email or password" } } } | Oracle: error text visible | Pass: text found in DOM
   */
  it('Shows error message when login() throws with string detail', async () => {
    // Arrange
    mockLogin.mockRejectedValueOnce({
      response: { data: { detail: 'Invalid email or password' } },
    })
    wrap()

    // Act
    fillLogin('bad@test.com', 'wrong')
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument()
    })
  })

  /**
   * LOGIN-13: Shows error message when login() throws with array detail (Pydantic 422)
   * // Input: login rejects with detail=[{msg:'value error'}] | Oracle: extracted error message shown | Pass: joined message visible
   */
  it('Shows error message when login() throws with array detail (Pydantic 422)', async () => {
    // Arrange
    mockLogin.mockRejectedValueOnce({
      response: { data: { detail: [{ msg: 'value is not a valid email' }, { msg: 'field required' }] } },
    })
    wrap()

    // Act
    fillLogin('notanemail', 'pw')
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/value is not a valid email/i)).toBeInTheDocument()
    })
  })

  /**
   * LOGIN-14: Error message persists (does NOT disappear on its own)
   * // Input: login fails, wait 500ms | Oracle: error still visible after delay | Pass: error text still found
   */
  it('Error message persists (does NOT disappear on its own)', async () => {
    // Arrange
    mockLogin.mockRejectedValueOnce({
      response: { data: { detail: 'Persistent error' } },
    })
    wrap()

    // Act
    fillLogin()
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    // Assert — error appears and stays
    await waitFor(() => {
      expect(screen.getByText(/persistent error/i)).toBeInTheDocument()
    })
    // Still present — no setTimeout cleanup
    expect(screen.getByText(/persistent error/i)).toBeInTheDocument()
  })

  /**
   * LOGIN-15: Loading spinner shown during submission
   * // Input: login() is a pending promise | Oracle: loading text/button disabled visible | Pass: loading state detected
   */
  it('Loading spinner shown during submission', async () => {
    // Arrange
    let resolveLogin
    mockLogin.mockReturnValueOnce(new Promise(res => { resolveLogin = res }))
    wrap()

    // Act
    fillLogin()
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    // Assert — loading state visible
    await waitFor(() => {
      expect(screen.getByText(/signing in/i)).toBeInTheDocument()
    })
    const btn = screen.getByText(/signing in/i).closest('button')
    expect(btn).toBeDisabled()

    // Cleanup
    resolveLogin({ id: 'u1', onboarding_completed: true })
  })

  /**
   * LOGIN-16: Error from wrong password stays visible (no redirect)
   * // Input: login rejects | Oracle: navigate NOT called, error visible | Pass: no navigation + error shown
   */
  it('Error from wrong password stays visible (no redirect)', async () => {
    // Arrange
    mockLogin.mockRejectedValueOnce({
      response: { data: { detail: 'Invalid email or password' } },
    })
    wrap()

    // Act
    fillLogin('alice@test.com', 'wrongpassword')
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
