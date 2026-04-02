/**
 * AuthContext
 *
 * Global auth state: user, loading, login, register, logout, completeOnboarding.
 * Persists JWT + user to localStorage and re-hydrates on page reload.
 */

// ── Design Patterns ──────────────────────────────────────────────────────────
// Observer     — AuthContext provides global auth state; all consumers re-render
//                on login/logout automatically (React Context = pub/sub).
// Facade       — login(), register(), logout() facade the raw authService calls,
//                handling localStorage persistence transparently to callers.
// Singleton    — a single AuthProvider at the app root ensures one auth state.
// ─────────────────────────────────────────────────────────────────────────────
import React, { createContext, useContext, useState, useEffect } from 'react'
import {
  login as apiLogin,
  register as apiRegister,
  completeOnboarding as apiCompleteOnboarding,
  logout as apiLogout,
  getProfile,
} from '../services/authService'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  // Rehydrate from localStorage on mount — validate token with backend
  useEffect(() => {
    const token = localStorage.getItem('ff_token')
    if (!token) { setLoading(false); return }
    getProfile()
      .then(profile => setUser(profile))
      .catch(() => {
        localStorage.removeItem('ff_token')
        localStorage.removeItem('ff_user')
      })
      .finally(() => setLoading(false))
  }, [])

  function persist(token, userData) {
    localStorage.setItem('ff_token', token)
    localStorage.setItem('ff_user', JSON.stringify(userData))
    setUser(userData)
  }

  async function login(email, password) {
    const data = await apiLogin(email, password)
    persist(data.access_token, data.user)
    return data.user
  }

  async function register(name, email, password) {
    const data = await apiRegister(name, email, password)
    persist(data.access_token, data.user)
    return data.user
  }

  async function completeOnboarding(preferences) {
    const updatedUser = await apiCompleteOnboarding(preferences)
    const merged = { ...user, ...updatedUser }
    localStorage.setItem('ff_user', JSON.stringify(merged))
    setUser(merged)
    return merged
  }

  function logout() {
    apiLogout().catch(() => { /* fire-and-forget */ })
    localStorage.removeItem('ff_token')
    localStorage.removeItem('ff_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, completeOnboarding }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
