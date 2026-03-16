/**
 * AuthContext
 *
 * Provides global authentication state: current user, login, logout.
 * Persists JWT token to localStorage and re-hydrates on page reload.
 */

import React, { createContext, useContext, useState, useEffect } from 'react'
import { login as apiLogin, register as apiRegister } from '../services/authService'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Rehydrate user from localStorage on mount
  useEffect(() => {
    const token = localStorage.getItem('ff_token')
    const stored = localStorage.getItem('ff_user')
    if (token && stored) {
      setUser(JSON.parse(stored))
    }
    setLoading(false)
  }, [])

  async function login(email, password) {
    const data = await apiLogin(email, password)
    localStorage.setItem('ff_token', data.access_token)
    localStorage.setItem('ff_user', JSON.stringify(data.user))
    setUser(data.user)
    return data.user
  }

  async function register(name, email, password) {
    const data = await apiRegister(name, email, password)
    localStorage.setItem('ff_token', data.access_token)
    localStorage.setItem('ff_user', JSON.stringify(data.user))
    setUser(data.user)
    return data.user
  }

  function logout() {
    localStorage.removeItem('ff_token')
    localStorage.removeItem('ff_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
