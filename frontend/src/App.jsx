/**
 * App.jsx - Root component
 *
 * Sets up React Router, wraps the app in AuthProvider and TimerProvider,
 * and defines protected vs public routes.
 */

import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { TimerProvider } from './context/TimerContext'

import LoginPage    from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import Layout       from './components/Layout'
import DashboardPage  from './pages/DashboardPage'
import TasksPage      from './pages/TasksPage'
import TimerPage      from './pages/TimerPage'
import CalendarPage   from './pages/CalendarPage'
import CanvasAIPage   from './pages/CanvasAIPage'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Loading…</div>
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <TimerProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login"    element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index           element={<DashboardPage />} />
              <Route path="board"    element={<TasksPage />} />
              <Route path="timer"    element={<TimerPage />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="ai"       element={<CanvasAIPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </TimerProvider>
    </AuthProvider>
  )
}
