/**
 * API Client - Axios instance with JWT interceptor
 */
import axios from 'axios'

// VITE_API_URL is injected at build time by Vite for production.
// In Jest (test environment), this global won't exist so we fall back to '/api'.
// eslint-disable-next-line no-undef
const BASE_URL = (typeof __VITE_API_URL__ !== 'undefined' ? __VITE_API_URL__ : null) || '/api'

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ff_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
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