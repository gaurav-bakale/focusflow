/**
 * App.jsx — Root component
 *
 * Routing logic:
 *   Public:    /login, /register
 *   Onboarding: /onboarding  (requires auth, redirects to / if already done)
 *   Protected: / and sub-routes (requires auth + onboarding complete)
 */

import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { TimerProvider } from './context/TimerContext'
import { ThemeProvider } from './context/ThemeContext'
import { NotificationProvider } from './context/NotificationContext'
import ToastContainer from './components/ToastContainer'

import LoginPage      from './pages/LoginPage'
import RegisterPage   from './pages/RegisterPage'
import OnboardingPage from './pages/OnboardingPage'
import Layout         from './components/Layout'
import DashboardPage  from './pages/DashboardPage'
import TasksPage      from './pages/TasksPage'
import TimerPage      from './pages/TimerPage'
import CalendarPage   from './pages/CalendarPage'
import CanvasAIPage      from './pages/CanvasAIPage'
import SharedTasksPage   from './pages/SharedTasksPage'
import WorkspacesPage    from './pages/WorkspacesPage'
import SettingsPage      from './pages/SettingsPage'

function Spinner() {
  return (
    <div className="flex items-center justify-center h-screen bg-white dark:bg-gray-950">
      <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  )
}

/** Redirect logged-in users away from public pages */
function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  if (!user) return children
  return <Navigate to={user.onboarding_completed ? '/' : '/onboarding'} replace />
}

/** Requires auth. If onboarding not done, redirect there first. */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  if (user.onboarding_completed === false) return <Navigate to="/onboarding" replace />
  return children
}

/** Requires auth, but redirects to / if onboarding already completed. */
function OnboardingRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  if (user.onboarding_completed) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <NotificationProvider>
      <TimerProvider>
        <BrowserRouter>
          <ToastContainer />
          <Routes>
            {/* Public */}
            <Route path="/login"    element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

            {/* Onboarding (auth required, skipped if done) */}
            <Route path="/onboarding" element={<OnboardingRoute><OnboardingPage /></OnboardingRoute>} />

            {/* Protected app shell */}
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
              <Route path="shared"   element={<SharedTasksPage />} />
              <Route path="workspaces" element={<WorkspacesPage />} />
              <Route path="settings"  element={<SettingsPage />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </TimerProvider>
      </NotificationProvider>
    </AuthProvider>
    </ThemeProvider>
  )
}
