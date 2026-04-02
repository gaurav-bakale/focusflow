/**
 * @file RegisterPage.test.jsx
 * @description Comprehensive unit tests for the RegisterPage component.
 *
 * Coverage:
 *  - All 4 PasswordStrength rule indicators (label text + ✓/○ icon)
 *  - Submit button disabled logic for every failure scenario
 *  - Inline confirm-password mismatch error
 *  - Successful submit: register() called with correct args + navigation
 *  - API error (400 duplicate email, array detail, no-detail fallback)
 *  - Client-side JS guards inside handleSubmit
 *
 * Strategy:
 *  - AuthContext is fully mocked — register() is a jest.fn()
 *  - useNavigate is mocked to intercept navigation
 *  - MemoryRouter wraps each render (Link requires router context)
 *  - All tests are isolated via beforeEach mock resets
 *  - No network calls, no real NLP, no real auth
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// ── Mocks — declared before any imports of the module under test ──────────────

const mockRegister = jest.fn()
const mockNavigate = jest.fn()

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ register: mockRegister, user: null, loading: false }),
}))

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}))

// Import AFTER mocks are set up
import RegisterPage from '../pages/RegisterPage'

// ── Constants ─────────────────────────────────────────────────────────────────

/** A password that satisfies all 4 rules: length≥8, uppercase, digit, special char. */
const STRONG_PW = 'StrongPass1!'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Wraps component in MemoryRouter (needed for Link) and renders it. */
function renderPage() {
  render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>
  )
}

/** Returns the most-used form elements. Uses specific label text to avoid ambiguity. */
function getFormEls() {
  return {
    nameInput:     screen.getByLabelText(/full name/i),
    emailInput:    screen.getByLabelText(/email address/i),
    // "^Password$" avoids matching "Confirm password"
    passwordInput: screen.getByLabelText(/^password$/i),
    confirmInput:  screen.getByLabelText(/confirm password/i),
    submitBtn:     screen.getByRole('button', { name: /create account/i }),
  }
}

/**
 * Fills all four form fields with valid data and matching passwords.
 * Returns the submit button so callers can click it immediately.
 */
async function fillValidForm(overrides = {}) {
  const opts = {
    name:     'Jane Smith',
    email:    'jane@example.com',
    password: STRONG_PW,
    confirm:  STRONG_PW,
    ...overrides,
  }
  const { nameInput, emailInput, passwordInput, confirmInput, submitBtn } = getFormEls()
  await userEvent.type(nameInput,     opts.name)
  await userEvent.type(emailInput,    opts.email)
  await userEvent.type(passwordInput, opts.password)
  await userEvent.type(confirmInput,  opts.confirm)
  return submitBtn
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockRegister.mockReset()
  mockNavigate.mockReset()
})

// =============================================================================
// Suite 1 — Basic rendering
// =============================================================================
describe('RegisterPage – rendering', () => {
  it('renders the "Create your account" heading', () => {
    renderPage()
    expect(screen.getByText(/create your account/i)).toBeInTheDocument()
  })

  it('renders name, email, password, and confirm password fields', () => {
    renderPage()
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
  })

  it('renders the submit button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
  })

  it('renders step indicators 1, 2, 3', () => {
    renderPage()
    const body = document.body.textContent
    expect(body).toContain('1')
    expect(body).toContain('2')
    expect(body).toContain('3')
  })

  it('renders a link to the login page', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument()
  })
})

// =============================================================================
// Suite 2 — PasswordStrength rule indicators
// =============================================================================
describe('RegisterPage – PasswordStrength rule indicators', () => {
  it('shows no rule labels when password field is empty', () => {
    renderPage()
    // PasswordStrength returns null when password === ''
    expect(screen.queryByText('At least 8 characters')).not.toBeInTheDocument()
    expect(screen.queryByText(/one uppercase letter/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/one number/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/one special character/i)).not.toBeInTheDocument()
  })

  it('shows all 4 rule labels once any character is typed', async () => {
    renderPage()
    const { passwordInput } = getFormEls()
    await userEvent.type(passwordInput, 'a')

    expect(screen.getByText('At least 8 characters')).toBeInTheDocument()
    expect(screen.getByText(/one uppercase letter/i)).toBeInTheDocument()
    expect(screen.getByText(/one number/i)).toBeInTheDocument()
    expect(screen.getByText(/one special character/i)).toBeInTheDocument()
  })

  // ── Rule 1: length ──────────────────────────────────────────────────────────

  it('length rule shows ✓ when password has 8+ characters', async () => {
    renderPage()
    const { passwordInput } = getFormEls()
    await userEvent.type(passwordInput, 'abcdefgh')  // 8 chars

    const ruleEl = screen.getByText('At least 8 characters')
    expect(ruleEl.previousSibling.textContent).toBe('✓')
  })

  it('length rule shows ○ when password has fewer than 8 characters', async () => {
    renderPage()
    const { passwordInput } = getFormEls()
    await userEvent.type(passwordInput, 'abc')

    const ruleEl = screen.getByText('At least 8 characters')
    expect(ruleEl.previousSibling.textContent).toBe('○')
  })

  // ── Rule 2: uppercase ───────────────────────────────────────────────────────

  it('uppercase rule shows ✓ when password has an uppercase letter', async () => {
    renderPage()
    const { passwordInput } = getFormEls()
    await userEvent.type(passwordInput, 'abcdefgH')

    const ruleEl = screen.getByText(/one uppercase letter/i)
    expect(ruleEl.previousSibling.textContent).toBe('✓')
  })

  it('uppercase rule shows ○ when password has no uppercase letter', async () => {
    renderPage()
    const { passwordInput } = getFormEls()
    await userEvent.type(passwordInput, 'abcdefgh')

    const ruleEl = screen.getByText(/one uppercase letter/i)
    expect(ruleEl.previousSibling.textContent).toBe('○')
  })

  // ── Rule 3: number ──────────────────────────────────────────────────────────

  it('number rule shows ✓ when password contains a digit', async () => {
    renderPage()
    const { passwordInput } = getFormEls()
    await userEvent.type(passwordInput, 'abcdefg1')

    const ruleEl = screen.getByText(/one number/i)
    expect(ruleEl.previousSibling.textContent).toBe('✓')
  })

  it('number rule shows ○ when password has no digit', async () => {
    renderPage()
    const { passwordInput } = getFormEls()
    await userEvent.type(passwordInput, 'abcdefgh')

    const ruleEl = screen.getByText(/one number/i)
    expect(ruleEl.previousSibling.textContent).toBe('○')
  })

  // ── Rule 4: special character ───────────────────────────────────────────────

  it('special-char rule shows ✓ when password contains a special character', async () => {
    renderPage()
    const { passwordInput } = getFormEls()
    await userEvent.type(passwordInput, 'abcdefg!')

    const ruleEl = screen.getByText(/one special character/i)
    expect(ruleEl.previousSibling.textContent).toBe('✓')
  })

  it('special-char rule shows ○ when password has no special character', async () => {
    renderPage()
    const { passwordInput } = getFormEls()
    await userEvent.type(passwordInput, 'Abcdefg1')  // uppercase + digit, no special

    const ruleEl = screen.getByText(/one special character/i)
    expect(ruleEl.previousSibling.textContent).toBe('○')
  })

  // ── All 4 rules passing ─────────────────────────────────────────────────────

  it('all 4 rules show ✓ when a strong password is entered', async () => {
    renderPage()
    const { passwordInput } = getFormEls()
    await userEvent.type(passwordInput, STRONG_PW)

    expect(screen.getByText('At least 8 characters').previousSibling.textContent).toBe('✓')
    expect(screen.getByText(/one uppercase letter/i).previousSibling.textContent).toBe('✓')
    expect(screen.getByText(/one number/i).previousSibling.textContent).toBe('✓')
    expect(screen.getByText(/one special character/i).previousSibling.textContent).toBe('✓')
  })

  // ── Strength labels ─────────────────────────────────────────────────────────

  it('shows "Weak password" for a password that meets only 1 rule', async () => {
    renderPage()
    const { passwordInput } = getFormEls()
    await userEvent.type(passwordInput, 'abcdefgh')  // only length ≥ 8

    await waitFor(() => expect(screen.getByText('Weak password')).toBeInTheDocument())
  })

  it('shows "Strong password" when all 4 rules pass', async () => {
    renderPage()
    const { passwordInput } = getFormEls()
    await userEvent.type(passwordInput, STRONG_PW)

    await waitFor(() => expect(screen.getByText('Strong password')).toBeInTheDocument())
  })

  it('shows "Fair password" when 2 rules pass', async () => {
    renderPage()
    const { passwordInput } = getFormEls()
    // length ≥ 8 + uppercase → score 2
    await userEvent.type(passwordInput, 'AbcdefgH')

    await waitFor(() => expect(screen.getByText('Fair password')).toBeInTheDocument())
  })

  it('shows "Good password" when 3 rules pass', async () => {
    renderPage()
    const { passwordInput } = getFormEls()
    // length ≥ 8 + uppercase + digit → score 3
    await userEvent.type(passwordInput, 'Abcdefg1')

    await waitFor(() => expect(screen.getByText('Good password')).toBeInTheDocument())
  })
})

// =============================================================================
// Suite 3 — Submit button disabled logic
// =============================================================================
describe('RegisterPage – submit button disabled logic', () => {
  it('is disabled on initial render (empty fields)', () => {
    renderPage()
    expect(getFormEls().submitBtn).toBeDisabled()
  })

  it('is disabled when password fails all rules (too short)', async () => {
    renderPage()
    const { passwordInput, submitBtn } = getFormEls()
    await userEvent.type(passwordInput, 'weak')
    expect(submitBtn).toBeDisabled()
  })

  it('is disabled when password passes all rules but confirm is empty', async () => {
    renderPage()
    const { passwordInput, submitBtn } = getFormEls()
    await userEvent.type(passwordInput, STRONG_PW)
    expect(submitBtn).toBeDisabled()
  })

  it('is disabled when password passes all rules but confirm mismatches', async () => {
    renderPage()
    const { passwordInput, confirmInput, submitBtn } = getFormEls()
    await userEvent.type(passwordInput, STRONG_PW)
    await userEvent.type(confirmInput, 'DifferentPass9@')
    expect(submitBtn).toBeDisabled()
  })

  it('is disabled when passwords match but not all 4 rules are satisfied', async () => {
    renderPage()
    const { passwordInput, confirmInput, submitBtn } = getFormEls()
    const weak = 'weakpass'  // length < 8 fails (7 chars), no uppercase/digit/special
    await userEvent.type(passwordInput, weak)
    await userEvent.type(confirmInput, weak)
    expect(submitBtn).toBeDisabled()
  })

  it('is disabled when 3 of 4 rules pass and passwords match (no special char)', async () => {
    renderPage()
    const { passwordInput, confirmInput, submitBtn } = getFormEls()
    const threeRules = 'Abcdefg1'  // length + uppercase + digit, missing special char
    await userEvent.type(passwordInput, threeRules)
    await userEvent.type(confirmInput, threeRules)
    expect(submitBtn).toBeDisabled()
  })

  it('is ENABLED when all 4 rules pass AND passwords match', async () => {
    renderPage()
    const { passwordInput, confirmInput, submitBtn } = getFormEls()
    await userEvent.type(passwordInput, STRONG_PW)
    await userEvent.type(confirmInput, STRONG_PW)
    expect(submitBtn).not.toBeDisabled()
  })
})

// =============================================================================
// Suite 4 — Inline confirm-password mismatch error
// =============================================================================
describe('RegisterPage – confirm password mismatch error', () => {
  it('shows no mismatch error when confirm field is empty', () => {
    renderPage()
    expect(screen.queryByText('Passwords do not match')).not.toBeInTheDocument()
  })

  it('shows mismatch error when confirm differs from password', async () => {
    renderPage()
    const { passwordInput, confirmInput } = getFormEls()
    await userEvent.type(passwordInput, STRONG_PW)
    await userEvent.type(confirmInput, 'WrongPass9!')

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
  })

  it('hides mismatch error once confirm matches password', async () => {
    renderPage()
    const { passwordInput, confirmInput } = getFormEls()
    await userEvent.type(passwordInput, STRONG_PW)
    await userEvent.type(confirmInput, 'Wrong!')
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()

    // Clear confirm and type the correct value
    await userEvent.clear(confirmInput)
    await userEvent.type(confirmInput, STRONG_PW)
    expect(screen.queryByText('Passwords do not match')).not.toBeInTheDocument()
  })

  it('the confirm input border turns red-ish when mismatched', async () => {
    renderPage()
    const { passwordInput, confirmInput } = getFormEls()
    await userEvent.type(passwordInput, STRONG_PW)
    await userEvent.type(confirmInput, 'wrong')

    // The component applies a red border via inline style when mismatch
    expect(confirmInput.style.border).toMatch(/239,68,68/)
  })

  it('the confirm input border turns green-ish when matched', async () => {
    renderPage()
    const { passwordInput, confirmInput } = getFormEls()
    await userEvent.type(passwordInput, STRONG_PW)
    await userEvent.type(confirmInput, STRONG_PW)

    // The component applies a green border via inline style when match
    expect(confirmInput.style.border).toMatch(/52,211,153/)
  })
})

// =============================================================================
// Suite 5 — Successful registration
// =============================================================================
describe('RegisterPage – successful registration', () => {
  it('calls register() with name, email, and password on valid submit', async () => {
    mockRegister.mockResolvedValue(undefined)
    renderPage()
    const submitBtn = await fillValidForm()

    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledTimes(1)
      expect(mockRegister).toHaveBeenCalledWith('Jane Smith', 'jane@example.com', STRONG_PW)
    })
  })

  it('navigates to /onboarding after successful register()', async () => {
    mockRegister.mockResolvedValue(undefined)
    renderPage()
    const submitBtn = await fillValidForm()

    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/onboarding')
    })
  })

  it('does not show an error banner after a successful submission', async () => {
    mockRegister.mockResolvedValue(undefined)
    renderPage()
    const submitBtn = await fillValidForm()

    fireEvent.click(submitBtn)

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled())

    expect(screen.queryByText(/registration failed/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/email already/i)).not.toBeInTheDocument()
  })

  it('passes the exact confirm password value only once to register() (not confirm)', async () => {
    mockRegister.mockResolvedValue(undefined)
    renderPage()
    const submitBtn = await fillValidForm()

    fireEvent.click(submitBtn)

    await waitFor(() => {
      // register() should receive 3 args: name, email, password — NOT confirm
      expect(mockRegister).toHaveBeenCalledWith(
        expect.any(String),  // name
        expect.any(String),  // email
        STRONG_PW            // password (not 4 args)
      )
      expect(mockRegister.mock.calls[0]).toHaveLength(3)
    })
  })
})

// =============================================================================
// Suite 6 — API error handling (400 duplicate email, other errors)
// =============================================================================
describe('RegisterPage – API error handling', () => {
  it('shows the API string detail when register() rejects with a 400 response', async () => {
    mockRegister.mockRejectedValue({
      response: { data: { detail: 'Email already registered.' }, status: 400 },
    })
    renderPage()
    const submitBtn = await fillValidForm({ email: 'duplicate@example.com' })

    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText('Email already registered.')).toBeInTheDocument()
    })
  })

  it('does NOT navigate when register() throws a 400 duplicate-email error', async () => {
    mockRegister.mockRejectedValue({
      response: { data: { detail: 'Email already registered.' }, status: 400 },
    })
    renderPage()
    const submitBtn = await fillValidForm()

    fireEvent.click(submitBtn)

    await waitFor(() => expect(screen.getByText('Email already registered.')).toBeInTheDocument())
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('shows a fallback error when register() rejects with no response object', async () => {
    mockRegister.mockRejectedValue(new Error('Network Error'))
    renderPage()
    const submitBtn = await fillValidForm()

    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText('Registration failed. Please try again.')).toBeInTheDocument()
    })
  })

  it('shows joined detail messages when API detail is an array of objects (Pydantic 422)', async () => {
    mockRegister.mockRejectedValue({
      response: {
        data: {
          detail: [
            { msg: 'Name is required.' },
            { msg: 'Email is invalid.' },
          ],
        },
      },
    })
    renderPage()
    const submitBtn = await fillValidForm()

    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText('Name is required. · Email is invalid.')).toBeInTheDocument()
    })
  })

  it('re-enables the submit button after a failed API call (loading resets)', async () => {
    mockRegister.mockRejectedValue({
      response: { data: { detail: 'Email already registered.' } },
    })
    renderPage()
    const { passwordInput, confirmInput } = getFormEls()
    await userEvent.type(passwordInput, STRONG_PW)
    await userEvent.type(confirmInput, STRONG_PW)
    const submitBtn = getFormEls().submitBtn

    fireEvent.click(submitBtn)

    await waitFor(() => expect(screen.getByText('Email already registered.')).toBeInTheDocument())

    // After error, loading is false again — button should be enabled
    expect(submitBtn).not.toBeDisabled()
  })

  it('error banner is visible (not hidden) after API rejection', async () => {
    mockRegister.mockRejectedValue({
      response: { data: { detail: 'Server error, try again.' } },
    })
    renderPage()
    const submitBtn = await fillValidForm()

    fireEvent.click(submitBtn)

    await waitFor(() => {
      const banner = screen.getByText('Server error, try again.')
      expect(banner).toBeVisible()
    })
  })
})

// =============================================================================
// Suite 7 — Client-side JS guards inside handleSubmit
// =============================================================================
describe('RegisterPage – client-side submit guards', () => {
  it('does not call register() when submitted with a weak password via JS', async () => {
    renderPage()
    const { nameInput, emailInput, passwordInput, confirmInput } = getFormEls()
    await userEvent.type(nameInput, 'Jane')
    await userEvent.type(emailInput, 'jane@example.com')
    await userEvent.type(passwordInput, 'weak')
    await userEvent.type(confirmInput, 'weak')

    // Trigger form submit directly — bypasses the disabled-button guard
    fireEvent.submit(passwordInput.closest('form'))

    await waitFor(() => {
      expect(mockRegister).not.toHaveBeenCalled()
    })
  })

  it('does not call register() when submitted with mismatched passwords via JS', async () => {
    renderPage()
    const { nameInput, emailInput, passwordInput, confirmInput } = getFormEls()
    await userEvent.type(nameInput, 'Jane')
    await userEvent.type(emailInput, 'jane@example.com')
    await userEvent.type(passwordInput, STRONG_PW)
    // Set a different confirm value via fireEvent (faster than clearing + retyping)
    fireEvent.change(confirmInput, { target: { value: 'DifferentPass9@' } })

    fireEvent.submit(passwordInput.closest('form'))

    await waitFor(() => {
      expect(mockRegister).not.toHaveBeenCalled()
    })
  })
})
