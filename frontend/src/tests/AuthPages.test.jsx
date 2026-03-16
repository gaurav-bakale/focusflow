/**
 * @file AuthPages.test.jsx
 * @description Unit tests for LoginPage and RegisterPage components
 * Framework: Jest 29 + React Testing Library
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LoginPage    from '../pages/LoginPage'
import RegisterPage from '../pages/RegisterPage'

// Mock AuthContext
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

beforeEach(() => jest.clearAllMocks())

// ─────────────────────────────────────────────────────────────────────────────
// LoginPage tests
// ─────────────────────────────────────────────────────────────────────────────
describe('LoginPage', () => {

  /**
   * AUTH-01: Login form renders correctly
   * Input:  Component mounted
   * Oracle: Email field, password field, and Sign In button present
   * Success: All 3 elements in DOM
   * Failure: Missing form elements
   */
  test('AUTH-01: renders email, password fields and Sign In button', () => {
    wrap(LoginPage)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  /**
   * AUTH-02: Successful login calls login() and navigates to /
   * Input:  Valid email and password, login() resolves
   * Oracle: mockLogin called with correct args, navigate('/')called
   * Success: Both function calls confirmed
   * Failure: Navigate not called or wrong args
   */
  test('AUTH-02: calls login() with correct credentials and navigates home', async () => {
    mockLogin.mockResolvedValueOnce({ id: 'u1', name: 'Alice' })
    wrap(LoginPage)

    fireEvent.change(screen.getByLabelText(/email/i),    { target: { value: 'alice@test.com' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('alice@test.com', 'password123')
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  /**
   * AUTH-03: Failed login shows error message
   * Input:  login() rejects with 401 error
   * Oracle: Error message rendered in DOM
   * Success: Error text visible on screen
   * Failure: No error displayed or navigation occurs
   */
  test('AUTH-03: shows error message when login fails', async () => {
    mockLogin.mockRejectedValueOnce({
      response: { data: { detail: 'Invalid email or password' } }
    })
    wrap(LoginPage)

    fireEvent.change(screen.getByLabelText(/email/i),    { target: { value: 'bad@test.com' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrongpass' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// RegisterPage tests
// ─────────────────────────────────────────────────────────────────────────────
describe('RegisterPage', () => {

  /**
   * AUTH-04: Register form renders correctly
   * Input:  Component mounted
   * Oracle: Name, Email, Password fields and Create Account button present
   * Success: All 4 elements in DOM
   * Failure: Missing fields
   */
  test('AUTH-04: renders name, email, password fields and Create Account button', () => {
    wrap(RegisterPage)
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
  })

  /**
   * AUTH-05: Short password shows validation error (client-side)
   * Input:  Password with only 4 characters
   * Oracle: Error 'at least 8 characters' shown, register() NOT called
   * Success: Error message visible, register not invoked
   * Failure: Register called with short password
   */
  test('AUTH-05: shows validation error for passwords shorter than 8 characters', async () => {
    wrap(RegisterPage)

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Bob' } })
    fireEvent.change(screen.getByLabelText(/email/i),     { target: { value: 'bob@test.com' } })
    fireEvent.change(screen.getByLabelText(/password/i),  { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument()
    })
    expect(mockRegister).not.toHaveBeenCalled()
  })
})
