/**
 * @file AuthPages.test.jsx
 * @description Unit tests for LoginPage and RegisterPage components
 * Framework: Jest 29 + React Testing Library
 *
 * Coverage:
 *   - Form renders (fields, buttons, links)
 *   - Button clicks → API called with correct args
 *   - Successful flow → correct navigation (/ or /onboarding)
 *   - Client-side validation (short password)
 *   - Server-side error → displayed on form
 *   - Loading state (button disabled, spinner shown)
 *   - Show/hide password toggle
 *   - Navigation links between login ↔ register
 *   - Error clears on subsequent submission attempt
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LoginPage    from '../pages/LoginPage'
import RegisterPage from '../pages/RegisterPage'

const mockLogin    = jest.fn()
const mockRegister = jest.fn()
const mockNavigate = jest.fn()

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin, register: mockRegister, user: null, loading: false }),
}))

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}))

function wrap(Component) {
  return render(<MemoryRouter><Component /></MemoryRouter>)
}

// Helpers
function fillLogin(email = 'alice@test.com', password = 'password123') {
  fireEvent.change(screen.getByLabelText(/email/i),    { target: { value: email } })
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: password } })
}

function fillRegister(name = 'Alice', email = 'alice@test.com', password = 'StrongPass1!') {
  fireEvent.change(screen.getByLabelText(/full name/i),        { target: { value: name } })
  fireEvent.change(screen.getByLabelText(/email/i),            { target: { value: email } })
  fireEvent.change(screen.getByLabelText(/^password$/i),       { target: { value: password } })
  fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: password } })
}

beforeEach(() => jest.clearAllMocks())

// ─────────────────────────────────────────────────────────────────────────────
// LoginPage
// ─────────────────────────────────────────────────────────────────────────────
describe('LoginPage', () => {

  /**
   * AUTH-01: Form renders all required elements
   */
  test('AUTH-01: renders email, password fields and Sign In button', () => {
    wrap(LoginPage)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  /**
   * AUTH-02: Successful login with onboarded user navigates to /
   * Input:  Valid creds, user has onboarding_completed = true
   * Oracle: navigate('/') called
   */
  test('AUTH-02: successful login navigates to / when onboarding is complete', async () => {
    mockLogin.mockResolvedValueOnce({ id: 'u1', name: 'Alice', onboarding_completed: true })
    wrap(LoginPage)
    fillLogin()
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('alice@test.com', 'password123')
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  /**
   * AUTH-03: Login with unboarded user navigates to /onboarding
   * Input:  Valid creds, user has onboarding_completed = false
   * Oracle: navigate('/onboarding') called
   */
  test('AUTH-03: navigates to /onboarding when user has not completed onboarding', async () => {
    mockLogin.mockResolvedValueOnce({ id: 'u1', name: 'Alice', onboarding_completed: false })
    wrap(LoginPage)
    fillLogin()
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/onboarding')
    })
  })

  /**
   * AUTH-04: Failed login shows server error message on form
   * Input:  login() rejects with 401
   * Oracle: Error text visible, navigate not called
   */
  test('AUTH-04: shows server error message when login fails', async () => {
    mockLogin.mockRejectedValueOnce({
      response: { data: { detail: 'Invalid email or password' } },
    })
    wrap(LoginPage)
    fillLogin('bad@test.com', 'wrongpass')
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  /**
   * AUTH-05: Login fallback error shown when no response detail
   * Input:  login() rejects with network error (no response)
   * Oracle: Generic fallback error message shown
   */
  test('AUTH-05: shows fallback error when server provides no detail', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Network Error'))
    wrap(LoginPage)
    fillLogin()
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument()
    })
  })

  /**
   * AUTH-06: Button is disabled and shows loading text during submission
   * Input:  login() is a promise that hasn't resolved yet
   * Oracle: Button text changes to 'Signing in…' while pending
   */
  test('AUTH-06: button shows loading state and is disabled during submission', async () => {
    // Create a promise we control so we can inspect mid-flight state
    let resolveLogin
    mockLogin.mockReturnValueOnce(new Promise(res => { resolveLogin = res }))
    wrap(LoginPage)
    fillLogin()
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    // Mid-flight: button should show loading text
    await waitFor(() => {
      expect(screen.getByText(/signing in/i)).toBeInTheDocument()
    })
    const btn = screen.getByText(/signing in/i).closest('button')
    expect(btn).toBeDisabled()

    // Cleanup
    resolveLogin({ id: 'u1', onboarding_completed: true })
  })

  /**
   * AUTH-07: Show/hide password toggle changes input type
   * Input:  Click the Show button
   * Oracle: Password input type switches to 'text', then back to 'password'
   */
  test('AUTH-07: show/hide toggle changes password field visibility', () => {
    wrap(LoginPage)
    const pwInput = screen.getByLabelText(/password/i)
    expect(pwInput.type).toBe('password')

    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    expect(pwInput.type).toBe('text')

    fireEvent.click(screen.getByRole('button', { name: /hide/i }))
    expect(pwInput.type).toBe('password')
  })

  /**
   * AUTH-08: "Sign up for free" link navigates to /register
   * Oracle: Link with correct href is present
   */
  test('AUTH-08: renders a link to the register page', () => {
    wrap(LoginPage)
    const link = screen.getByRole('link', { name: /sign up free/i })
    expect(link).toBeInTheDocument()
    expect(link.getAttribute('href')).toBe('/register')
  })

  /**
   * AUTH-09: Error resets on subsequent submission attempt
   * Input:  First attempt fails, second attempt starts
   * Oracle: Error disappears when the second submit is clicked
   */
  test('AUTH-09: previous error is cleared when re-submitting the form', async () => {
    mockLogin
      .mockRejectedValueOnce({ response: { data: { detail: 'Bad credentials' } } })
      .mockReturnValueOnce(new Promise(() => {})) // 2nd: hangs forever (we only need error gone)

    wrap(LoginPage)
    fillLogin()

    // First attempt — produce the error
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(screen.getByText(/bad credentials/i)).toBeInTheDocument())

    // Re-fill and submit again — error should clear immediately
    fillLogin()
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.queryByText(/bad credentials/i)).not.toBeInTheDocument()
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// RegisterPage
// ─────────────────────────────────────────────────────────────────────────────
describe('RegisterPage', () => {

  /**
   * AUTH-10: Form renders all required elements
   */
  test('AUTH-10: renders name, email, password fields and Create Account button', () => {
    wrap(RegisterPage)
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
  })

  /**
   * AUTH-11: Successful registration calls register() and navigates to /onboarding
   * Input:  Valid name, email, password (≥8 chars)
   * Oracle: register() called with correct args, navigate('/onboarding') called
   */
  test('AUTH-11: successful registration calls register() and navigates to /onboarding', async () => {
    mockRegister.mockResolvedValueOnce({ id: 'u1', name: 'Alice', onboarding_completed: false })
    wrap(RegisterPage)
    fillRegister()
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('Alice', 'alice@test.com', 'StrongPass1!')
      expect(mockNavigate).toHaveBeenCalledWith('/onboarding')
    })
  })

  /**
   * AUTH-12: Short password triggers client-side validation error
   * Input:  Password shorter than 8 characters
   * Oracle: 'at least 8 characters' shown, register() NOT called
   */
  test('AUTH-12: shows validation error for passwords shorter than 8 characters', async () => {
    wrap(RegisterPage)
    // Type weak password directly — button stays disabled, rule checklist shows
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'abc' } })
    // Button is disabled (pwScore < 4), clicking it won't trigger register()
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      // PasswordStrength checklist shows the "At least 8 characters" rule
      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument()
    })
    expect(mockRegister).not.toHaveBeenCalled()
  })

  /**
   * AUTH-13: Server error (409 duplicate email) is displayed on the form
   * Input:  register() rejects with "Email already registered"
   * Oracle: Error message visible on form, navigate NOT called
   */
  test('AUTH-13: shows server error when email is already registered', async () => {
    mockRegister.mockRejectedValueOnce({
      response: { data: { detail: 'Email already registered' } },
    })
    wrap(RegisterPage)
    fillRegister()
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText(/email already registered/i)).toBeInTheDocument()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  /**
   * AUTH-14: Button shows loading state during submission
   * Input:  register() is a pending promise
   * Oracle: Button text is 'Creating account…' and button is disabled
   */
  test('AUTH-14: button shows loading state and is disabled during submission', async () => {
    let resolveReg
    mockRegister.mockReturnValueOnce(new Promise(res => { resolveReg = res }))
    wrap(RegisterPage)
    fillRegister()
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText(/creating account/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/creating account/i).closest('button')).toBeDisabled()

    resolveReg({ id: 'u1', onboarding_completed: false })
  })

  /**
   * AUTH-15: Show/hide password toggle on register form
   * Input:  Click Show button
   * Oracle: Input type switches text ↔ password
   */
  test('AUTH-15: show/hide toggle changes password field type', () => {
    wrap(RegisterPage)
    const pwInput = screen.getByLabelText(/^password$/i)
    expect(pwInput.type).toBe('password')

    // Two Show buttons exist (password + confirm) — click the first (password)
    fireEvent.click(screen.getAllByRole('button', { name: /show/i })[0])
    expect(pwInput.type).toBe('text')

    fireEvent.click(screen.getByRole('button', { name: /hide/i }))
    expect(pwInput.type).toBe('password')
  })

  /**
   * AUTH-16: "Sign in" link navigates to /login
   * Oracle: Link with /login href is present
   */
  test('AUTH-16: renders a link to the login page', () => {
    wrap(RegisterPage)
    const link = screen.getByRole('link', { name: /sign in/i })
    expect(link).toBeInTheDocument()
    expect(link.getAttribute('href')).toBe('/login')
  })

  /**
   * AUTH-17: Password strength indicator appears after typing
   * Input:  A password with exactly 1 criterion met (length ≥ 8)
   * Oracle: 'Weak password' label rendered (score = 1)
   */
  test('AUTH-17: password strength indicator renders when password is entered', async () => {
    wrap(RegisterPage)
    // 'abcdefgh' → length ≥ 8 only → score 1 → 'Weak'
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'abcdefgh' } })
    await waitFor(() => {
      expect(screen.getByText(/weak password/i)).toBeInTheDocument()
    })
  })

  /**
   * AUTH-18: Strong password gets a positive strength label
   * Input:  Password meeting all 4 criteria
   * Oracle: 'Strong password' label visible
   */
  test('AUTH-18: strong password shows "Strong" strength label', async () => {
    wrap(RegisterPage)
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'SecurePass1!' } })
    await waitFor(() => {
      expect(screen.getByText(/strong password/i)).toBeInTheDocument()
    })
  })
})
