/**
 * API Client - Axios instance with JWT interceptor
 *
 * Centralises all HTTP communication with the FastAPI backend.
 * Automatically injects the Authorization header on every request
 * and redirects to /login on 401 responses.
 */

// ── Design Patterns ──────────────────────────────────────────────────────────
// Interceptor  — axios interceptors implement the Chain of Responsibility:
//                every request passes through the auth injector; every response
//                passes through the 401 handler before reaching the caller.
// Singleton    — a single axios instance (api) shared across all services.
// Proxy        — api acts as a proxy to the backend, adding auth transparently.
// ─────────────────────────────────────────────────────────────────────────────
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor: attach JWT ──────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ff_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Response interceptor: handle 401 ─────────────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Only redirect on 401 for authenticated routes — never for login/register
    // (wrong credentials return 401 from the auth endpoint itself)
    const url = err.config?.url || ''
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register')
    if (err.response?.status === 401 && !isAuthEndpoint) {
      localStorage.removeItem('ff_token')
      localStorage.removeItem('ff_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
