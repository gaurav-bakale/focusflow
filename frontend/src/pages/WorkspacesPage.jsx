/**
 * WorkspacesPage — Create and manage shared workspaces.
 *
 * Features:
 *   • List all workspaces the user belongs to
 *   • Create new workspaces
 *   • View workspace details with member list
 *   • Add members by email with role selection
 *   • Remove members / leave workspaces
 *   • Delete workspaces (owner only)
 */

import React, { useEffect, useState } from 'react'
import {
  fetchWorkspaces,
  createWorkspace,
  fetchWorkspace,
  addWorkspaceMember,
} from '../services/sharingService'
import api from '../services/api'

const ROLE_BADGE = {
  OWNER:  'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800',
  ADMIN:  'bg-amber-100  text-amber-700  border-amber-200  dark:bg-amber-950/40  dark:text-amber-400  dark:border-amber-800',
  MEMBER: 'bg-gray-100   text-gray-600   border-gray-200   dark:bg-gray-800       dark:text-gray-400   dark:border-gray-700',
}

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces]   = useState([])
  const [loading, setLoading]         = useState(true)

  // Create modal
  const [showCreate, setShowCreate]   = useState(false)
  const [createForm, setCreateForm]   = useState({ name: '', description: '' })
  const [createError, setCreateError] = useState('')

  // Detail modal
  const [detail, setDetail]           = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Add member form (inside detail)
  const [memberEmail, setMemberEmail] = useState('')
  const [memberRole, setMemberRole]   = useState('MEMBER')
  const [memberError, setMemberError] = useState('')
  const [memberSuccess, setMemberSuccess] = useState('')
  const [memberLoading, setMemberLoading] = useState(false)

  useEffect(() => { loadWorkspaces() }, [])

  async function loadWorkspaces() {
    try {
      const data = await fetchWorkspaces()
      setWorkspaces(Array.isArray(data) ? data : [])
    } catch (_) {
      setWorkspaces([])
    } finally {
      setLoading(false)
    }
  }

  // ── Create workspace ──────────────────────────────────────────────────────

  async function handleCreate(e) {
    e.preventDefault()
    if (!createForm.name.trim()) return
    setCreateError('')
    try {
      await createWorkspace({
        name: createForm.name.trim(),
        description: createForm.description.trim() || null,
      })
      setShowCreate(false)
      setCreateForm({ name: '', description: '' })
      await loadWorkspaces()
    } catch (err) {
      setCreateError(err.response?.data?.detail || 'Failed to create workspace')
    }
  }

  // ── Open detail ───────────────────────────────────────────────────────────

  async function openDetail(ws) {
    setDetailLoading(true)
    setDetail(null)
    setMemberEmail('')
    setMemberRole('MEMBER')
    setMemberError('')
    setMemberSuccess('')
    try {
      const data = await fetchWorkspace(ws.id)
      setDetail(data)
    } catch (_) {
      setDetail(ws)
    } finally {
      setDetailLoading(false)
    }
  }

  function closeDetail() {
    setDetail(null)
    setMemberError('')
    setMemberSuccess('')
  }

  // ── Add member ────────────────────────────────────────────────────────────

  async function handleAddMember(e) {
    e.preventDefault()
    if (!memberEmail.trim() || !detail) return
    setMemberLoading(true)
    setMemberError('')
    setMemberSuccess('')
    try {
      await addWorkspaceMember(detail.id, {
        email: memberEmail.trim(),
        role: memberRole,
      })
      setMemberSuccess(`Added ${memberEmail}`)
      setMemberEmail('')
      // Refresh detail
      const updated = await fetchWorkspace(detail.id)
      setDetail(updated)
    } catch (err) {
      setMemberError(err.response?.data?.detail || 'Failed to add member')
    } finally {
      setMemberLoading(false)
    }
  }

  // ── Remove member ─────────────────────────────────────────────────────────

  async function handleRemoveMember(userId) {
    if (!detail) return
    try {
      await api.delete(`/workspaces/${detail.id}/members/${userId}`)
      const updated = await fetchWorkspace(detail.id)
      setDetail(updated)
    } catch (err) {
      console.error('Failed to remove member:', err)
    }
  }

  // ── Delete workspace ──────────────────────────────────────────────────────

  async function handleDeleteWorkspace() {
    if (!detail) return
    if (!confirm(`Delete workspace "${detail.name}"? This cannot be undone.`)) return
    try {
      await api.delete(`/workspaces/${detail.id}`)
      closeDetail()
      await loadWorkspaces()
    } catch (err) {
      console.error('Failed to delete workspace:', err)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">
            Workspaces
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Collaborate with your team in shared workspaces
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-bold text-sm rounded-lg border-2 border-gray-900 dark:border-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
        >
          New Workspace
        </button>
      </div>

      {/* Workspace grid */}
      {workspaces.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 dark:text-gray-500 text-sm font-bold">
            No workspaces yet. Create one to start collaborating.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workspaces.map(ws => (
            <button
              key={ws.id}
              onClick={() => openDetail(ws)}
              className="text-left border-2 border-gray-200 dark:border-gray-700 rounded-lg p-5 hover:border-gray-400 dark:hover:border-gray-500 transition-colors bg-white dark:bg-gray-900"
            >
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1 truncate">
                {ws.name}
              </h3>
              {ws.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">
                  {ws.description}
                </p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  By <span className="font-bold text-gray-600 dark:text-gray-300">{ws.owner_name}</span>
                </span>
                <span className="text-xs font-bold text-gray-400 dark:text-gray-500">
                  {ws.members?.length || 0} member{(ws.members?.length || 0) !== 1 ? 's' : ''}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Create modal ──────────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div
            className="bg-white dark:bg-gray-900 border-2 border-gray-900 dark:border-gray-600 rounded-lg p-6 w-full max-w-md"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-extrabold text-gray-900 dark:text-gray-100 mb-4">
              New Workspace
            </h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Sprint 1"
                  required
                  className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">
                  Description
                </label>
                <textarea
                  value={createForm.description}
                  onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Optional description..."
                  rows={3}
                  className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none transition-colors resize-none"
                />
              </div>

              {createError && (
                <p className="text-xs font-bold text-red-600 dark:text-red-400">{createError}</p>
              )}

              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm font-bold border-2 border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 dark:text-gray-400 hover:border-gray-900 dark:hover:border-gray-400 transition-colors">
                  Cancel
                </button>
                <button type="submit"
                  className="px-5 py-2 text-sm font-bold border-2 border-gray-900 dark:border-gray-400 rounded-lg bg-gray-900 dark:bg-gray-700 text-white hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Detail modal ──────────────────────────────────────────────────── */}
      {(detail || detailLoading) && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={closeDetail}>
          <div
            className="bg-white dark:bg-gray-900 border-2 border-gray-900 dark:border-gray-600 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {detailLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              </div>
            ) : detail && (
              <>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h2 className="text-xl font-extrabold text-gray-900 dark:text-gray-100">
                    {detail.name}
                  </h2>
                  <button onClick={closeDetail}
                    className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-lg font-bold shrink-0">
                    &times;
                  </button>
                </div>
                {detail.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{detail.description}</p>
                )}
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                  Created by <span className="font-bold text-gray-600 dark:text-gray-300">{detail.owner_name}</span>
                </p>

                {/* Members list */}
                <div className="mb-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">
                    Members ({detail.members?.length || 0})
                  </h3>
                  <div className="space-y-2">
                    {(detail.members || []).map(m => (
                      <div key={m.user_id} className="flex items-center justify-between gap-2 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold text-white shrink-0"
                            style={{ background: 'linear-gradient(135deg, #6366f1, #a78bfa)' }}>
                            {(m.user_name || '?')[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{m.user_name}</p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{m.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase border rounded ${ROLE_BADGE[m.role] || ROLE_BADGE.MEMBER}`}>
                            {m.role}
                          </span>
                          {m.role !== 'OWNER' && (
                            <button
                              onClick={() => handleRemoveMember(m.user_id)}
                              className="text-[10px] font-bold text-red-400 hover:text-red-600"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Add member form */}
                <div className="border-t-2 border-gray-200 dark:border-gray-700 pt-4 mb-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">
                    Add Member
                  </h3>
                  <form onSubmit={handleAddMember} className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={memberEmail}
                        onChange={e => setMemberEmail(e.target.value)}
                        placeholder="member@example.com"
                        required
                        className="flex-1 px-3 py-1.5 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none transition-colors"
                      />
                      <select
                        value={memberRole}
                        onChange={e => setMemberRole(e.target.value)}
                        className="px-2 py-1.5 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none transition-colors"
                      >
                        <option value="MEMBER">Member</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                      <button type="submit" disabled={memberLoading}
                        className="px-3 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-bold text-xs rounded-lg border-2 border-gray-900 dark:border-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50">
                        {memberLoading ? '...' : 'Add'}
                      </button>
                    </div>
                    {memberError && (
                      <p className="text-xs font-bold text-red-600 dark:text-red-400">{memberError}</p>
                    )}
                    {memberSuccess && (
                      <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{memberSuccess}</p>
                    )}
                  </form>
                </div>

                {/* Delete workspace (owner only) */}
                <div className="border-t-2 border-gray-200 dark:border-gray-700 pt-4">
                  <button
                    onClick={handleDeleteWorkspace}
                    className="text-xs font-bold text-red-500 hover:text-red-700 border-2 border-red-200 dark:border-red-800 hover:border-red-400 dark:hover:border-red-600 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Delete Workspace
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
