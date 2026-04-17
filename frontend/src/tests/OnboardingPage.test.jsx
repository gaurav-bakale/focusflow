/**
 * @file OnboardingPage.test.jsx
 * @description Unit tests for the multi-step OnboardingPage component
 * Framework: Jest 29 + React Testing Library
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import OnboardingPage from '../pages/OnboardingPage'

const mockCompleteOnboarding = jest.fn()
const mockNavigate           = jest.fn()

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Alice Smith', email: 'alice@test.com', onboarding_completed: false },
    completeOnboarding: mockCompleteOnboarding,
  }),
}))

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}))

function wrap() {
  return render(<MemoryRouter><OnboardingPage /></MemoryRouter>)
}

beforeEach(() => jest.clearAllMocks())

// ─────────────────────────────────────────────────────────────────────────────

/**
 * ON-01: Step 1 renders Pomodoro settings
 */
test('ON-01: renders Step 1 with Pomodoro duration controls', () => {
  wrap()
  expect(screen.getByText(/set your pomodoro rhythm/i)).toBeInTheDocument()
  expect(screen.getByText(/focus session/i)).toBeInTheDocument()
  expect(screen.getByText(/short break/i)).toBeInTheDocument()
  expect(screen.getByText(/long break/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument()
})

/**
 * ON-02: Step 1 → Step 2 navigation via Continue button
 */
test('ON-02: clicking Continue advances to step 2', () => {
  wrap()
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  expect(screen.getByText(/set your timezone/i)).toBeInTheDocument()
  expect(screen.getByText(/timezone/i)).toBeInTheDocument()
})

/**
 * ON-03: Back button on Step 2 returns to Step 1
 */
test('ON-03: Back button on step 2 returns to step 1', () => {
  wrap()
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  fireEvent.click(screen.getByRole('button', { name: /back/i }))
  expect(screen.getByText(/set your pomodoro rhythm/i)).toBeInTheDocument()
})

/**
 * ON-04: Step 2 → Step 3 navigation
 */
test('ON-04: advancing through all steps reaches the summary step', () => {
  wrap()
  // Step 1 → 2
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  // Step 2 → 3
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  expect(screen.getByText(/you're all set/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /go to dashboard/i })).toBeInTheDocument()
})

/**
 * ON-05: Step 3 summary shows selected preferences
 */
test('ON-05: summary step shows default preferences', () => {
  wrap()
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  // Default 25 min focus duration should appear in summary
  expect(screen.getByText('25 min')).toBeInTheDocument()
  expect(screen.getByText('5 min')).toBeInTheDocument()
  expect(screen.getByText('15 min')).toBeInTheDocument()
})

/**
 * ON-06: Submitting step 3 calls completeOnboarding and navigates to /
 */
test('ON-06: finishing onboarding calls completeOnboarding and navigates home', async () => {
  mockCompleteOnboarding.mockResolvedValueOnce({ onboarding_completed: true })
  wrap()
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  fireEvent.click(screen.getByRole('button', { name: /go to dashboard/i }))

  await waitFor(() => {
    expect(mockCompleteOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({
        pomodoro_duration: 25,
        short_break: 5,
        long_break: 15,
        timezone: 'UTC',
        theme: 'light',
      })
    )
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })
})

/**
 * ON-07: Error from completeOnboarding is displayed on step 3
 */
test('ON-07: shows error message when onboarding API call fails', async () => {
  mockCompleteOnboarding.mockRejectedValueOnce({
    response: { data: { detail: 'Service unavailable' } },
  })
  wrap()
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  fireEvent.click(screen.getByRole('button', { name: /go to dashboard/i }))

  await waitFor(() => {
    expect(screen.getByText(/service unavailable/i)).toBeInTheDocument()
  })
  expect(mockNavigate).not.toHaveBeenCalled()
})

/**
 * ON-08: Step 2 timezone dropdown is present and defaults to UTC
 */
test('ON-08: step 2 shows timezone selector defaulting to UTC', () => {
  wrap()
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  const select = screen.getByRole('combobox')
  expect(select).toBeInTheDocument()
  expect(select.value).toBe('UTC')
})
