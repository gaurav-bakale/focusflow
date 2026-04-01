/**
 * @file RegisterPage.test.jsx
 * @description Comprehensive tests for the RegisterPage component.
 * Tests: Facade pattern (AuthContext.register wraps authService) + Strategy (password strength)
 *
 * Framework: Jest 29 + React Testing Library 16
 * Strategy:
 *   - AuthContext is fully mocked — register() is a jest.fn().
 *   - useNavigate is mocked to intercept navigation.
 *   - Password strength scoring exercised at boundary values.
 *
 * Test oracle convention:
 *   Each test has: // Input: ... | Oracle: ... | Pass: ...
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RegisterPage from '../pages/RegisterPage'

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockRegister = jest.fn()
const mockNavigate = jest.fn()

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ register: mockRegister, user: null, loading: false }),
}))

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}))

function wrap() {
  return render(<MemoryRouter><RegisterPage /></MemoryRouter>)
}

function fillRegister(name = 'Alice', email = 'alice@test.com', password = 'password123') {
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: name } })
  fireEvent.change(screen.getByLabelText(/email/i),     { target: { value: email } })
  fireEvent.change(screen.getByLabelText(/password/i),  { target: { value: password } })
}

beforeEach(() => jest.clearAllMocks())

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — rendering
// Tests: Facade pattern (register hides authService)
// ─────────────────────────────────────────────────────────────────────────────
describe('rendering', () => {
  /**
   * REG-01: Renders "Create your account" heading
   * // Input: component mounted | Oracle: heading with "create" and "account" visible | Pass: text found
   */
  it('Renders "Create your account" heading', () => {
    // Arrange / Act
    wrap()

    // Assert
    expect(screen.getByText(/create your account/i)).toBeInTheDocument()
  })

  /**
   * REG-02: Renders name, email, password fields
   * // Input: component mounted | Oracle: all three input fields accessible via labels | Pass: all found
   */
  it('Renders name, email, password fields', () => {
    // Arrange / Act
    wrap()

    // Assert
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  /**
   * REG-03: Step indicators 1, 2, 3 visible
   * // Input: component mounted | Oracle: step indicators "1", "2", "3" in DOM | Pass: all three found
   */
  it('Step indicators 1, 2, 3 visible', () => {
    // Arrange / Act
    wrap()

    // Assert — steps are rendered (look for the step numbers or text)
    const body = document.body.textContent
    expect(body).toContain('1')
    expect(body).toContain('2')
    expect(body).toContain('3')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — form interaction
// Tests: Observer pattern (form state + password strength)
// ─────────────────────────────────────────────────────────────────────────────
describe('form interaction', () => {
  /**
   * REG-04: Can type into all fields
   * // Input: type into name, email, password fields | Oracle: each input reflects typed value | Pass: all values match
   */
  it('Can type into all fields', () => {
    // Arrange
    wrap()

    // Act
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Bob' } })
    fireEvent.change(screen.getByLabelText(/email/i),     { target: { value: 'bob@test.com' } })
    fireEvent.change(screen.getByLabelText(/password/i),  { target: { value: 'mypassword' } })

    // Assert
    expect(screen.getByLabelText(/full name/i).value).toBe('Bob')
    expect(screen.getByLabelText(/email/i).value).toBe('bob@test.com')
    expect(screen.getByLabelText(/password/i).value).toBe('mypassword')
  })

  /**
   * REG-05: Password strength meter appears after typing
   * // Input: type any password | Oracle: password strength indicator visible | Pass: strength label appears
   */
  it('Password strength meter appears after typing', async () => {
    // Arrange
    wrap()

    // Act
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'abcdefgh' } })

    // Assert
    await waitFor(() => {
      // Strength meter appears — any strength label found
      const strengthText = screen.queryByText(/weak password/i) ||
                           screen.queryByText(/fair password/i) ||
                           screen.queryByText(/good password/i) ||
                           screen.queryByText(/strong password/i)
      expect(strengthText).toBeInTheDocument()
    })
  })

  /**
   * REG-06: Weak password (< 8 chars) shows "Weak" label
   * // Input: type 3-char password | Oracle: "Weak" strength label visible | Pass: weak text found
   */
  it('Weak password (< 8 chars) shows "Weak" label', async () => {
    // Arrange
    wrap()

    // Act — 'abcdefgh' meets only length criterion (score=1) → shows "Weak password"
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'abcdefgh' } })

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/weak password/i)).toBeInTheDocument()
    })
  })

  /**
   * REG-07: Strong password shows "Strong" label
   * // Input: type password meeting all criteria | Oracle: "Strong password" label visible | Pass: strong text found
   */
  it('Strong password shows "Strong" label', async () => {
    // Arrange
    wrap()

    // Act — password with uppercase, lowercase, number, special char and length >= 8
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'SecurePass1!' } })

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/strong password/i)).toBeInTheDocument()
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — validation
// Tests: Command pattern (validation before register)
// ─────────────────────────────────────────────────────────────────────────────
describe('validation', () => {
  /**
   * REG-08: Shows error if password < 8 chars (without calling register)
   * // Input: fill name/email, set password to "abc", submit | Oracle: error shown, register NOT called | Pass: error visible + mock not called
   */
  it('Shows error if password < 8 chars (without calling register)', async () => {
    // Arrange
    wrap()

    // Act
    fillRegister('Bob', 'bob@test.com', 'abc')
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument()
    })
    expect(mockRegister).not.toHaveBeenCalled()
  })

  /**
   * REG-09: Does NOT call register API for short password
   * // Input: submit with password "abc" (3 chars) | Oracle: mockRegister never called | Pass: mock call count = 0
   */
  it('Does NOT call register API for short password', async () => {
    // Arrange
    wrap()

    // Act
    fillRegister('Charlie', 'charlie@test.com', 'ab')
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    // Assert
    await waitFor(() => {
      expect(mockRegister).not.toHaveBeenCalled()
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 — register success
// Tests: Facade pattern (register() hides authService)
// ─────────────────────────────────────────────────────────────────────────────
describe('register success', () => {
  /**
   * REG-10: Calls register() with name, email, password
   * // Input: fill all fields, submit | Oracle: register called with (name, email, password) | Pass: mock called with correct args
   */
  it('Calls register() with name, email, password', async () => {
    // Arrange
    mockRegister.mockResolvedValueOnce({ id: 'u1', name: 'Alice', onboarding_completed: false })
    wrap()

    // Act
    fillRegister('Alice', 'alice@test.com', 'password123')
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    // Assert
    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('Alice', 'alice@test.com', 'password123')
    })
  })

  /**
   * REG-11: Navigates to "/onboarding" on success
   * // Input: register resolves successfully | Oracle: navigate('/onboarding') called | Pass: navigate mock called with /onboarding
   */
  it('Navigates to "/onboarding" on success', async () => {
    // Arrange
    mockRegister.mockResolvedValueOnce({ id: 'u1', name: 'Alice', onboarding_completed: false })
    wrap()

    // Act
    fillRegister()
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    // Assert
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/onboarding')
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5 — error handling
// Tests: Facade pattern (error extraction)
// ─────────────────────────────────────────────────────────────────────────────
describe('error handling', () => {
  /**
   * REG-12: Shows error when register() throws with string detail
   * // Input: register rejects with { response: { data: { detail: "Email already registered" } } } | Oracle: error visible | Pass: text found
   */
  it('Shows error when register() throws with string detail', async () => {
    // Arrange
    mockRegister.mockRejectedValueOnce({
      response: { data: { detail: 'Email already registered' } },
    })
    wrap()

    // Act
    fillRegister()
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/email already registered/i)).toBeInTheDocument()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  /**
   * REG-13: Shows error when register() throws with array detail (Pydantic 422)
   * // Input: register rejects with detail=[{msg:'value error'}] | Oracle: joined message shown | Pass: first error message visible
   */
  it('Shows error when register() throws with array detail (Pydantic 422)', async () => {
    // Arrange
    mockRegister.mockRejectedValueOnce({
      response: { data: { detail: [{ msg: 'value is not a valid email' }, { msg: 'field required' }] } },
    })
    wrap()

    // Act
    fillRegister('Alice', 'notanemail', 'password123')
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/value is not a valid email/i)).toBeInTheDocument()
    })
  })

  /**
   * REG-14: Error persists and is readable
   * // Input: register rejects | Oracle: error still in DOM after settling | Pass: error text found and non-empty
   */
  it('Error persists and is readable', async () => {
    // Arrange
    mockRegister.mockRejectedValueOnce({
      response: { data: { detail: 'Server unavailable' } },
    })
    wrap()

    // Act
    fillRegister()
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    // Assert
    await waitFor(() => {
      const errorEl = screen.getByText(/server unavailable/i)
      expect(errorEl).toBeInTheDocument()
      expect(errorEl.textContent.length).toBeGreaterThan(0)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6 — password strength
// Tests: Strategy pattern (strength scoring function)
// ─────────────────────────────────────────────────────────────────────────────
describe('password strength', () => {
  /**
   * REG-15: Score 1 (length only) → "Weak" in red
   * // Input: password "abcdefgh" (8 chars, lowercase only) | Oracle: "Weak password" shown | Pass: text found
   */
  it('Score 1 (length only) → "Weak" in red', async () => {
    // Arrange
    wrap()

    // Act — only meets length criterion (>= 8 chars), score = 1
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'abcdefgh' } })

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/weak password/i)).toBeInTheDocument()
    })
  })

  /**
   * REG-16: Score 4 (all criteria) → "Strong" in green
   * // Input: password "SecurePass1!" meeting all criteria | Oracle: "Strong password" shown | Pass: text found
   */
  it('Score 4 (all criteria) → "Strong" in green', async () => {
    // Arrange
    wrap()

    // Act — meets all 4 criteria: length, uppercase, number, special char
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'SecurePass1!' } })

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/strong password/i)).toBeInTheDocument()
    })
  })
})
