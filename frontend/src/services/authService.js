/**
 * Auth Service — all authentication + profile API calls
 */
import api from './api'

export async function register(name, email, password) {
  const res = await api.post('/auth/register', { name, email, password })
  return res.data
}

export async function login(email, password) {
  const res = await api.post('/auth/login', { email, password })
  return res.data
}

export async function getProfile() {
  const res = await api.get('/auth/me')
  return res.data
}

export async function updateProfile(data) {
  const res = await api.put('/auth/me', data)
  return res.data
}

export async function completeOnboarding(preferences) {
  const res = await api.patch('/auth/me/onboarding', { preferences })
  return res.data
}

export async function changePassword(currentPassword, newPassword) {
  const res = await api.patch('/auth/me/password', {
    current_password: currentPassword,
    new_password: newPassword,
  })
  return res.data
}

export async function logout() {
  await api.post('/auth/logout')
}
