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
        <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor:'#ecefe7', borderTopColor:'#3a6758' }} />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-1" style={{ fontFamily:'Epilogue,sans-serif', color:'#2e342d' }}>
            Workspaces
          </h1>
          <p className="text-sm" style={{ color:'#767c74' }}>
            Collaborate with your team in shared workspaces
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2.5 font-bold text-sm rounded-xl text-white transition-colors"
          style={{ background:'#3a6758' }}
        >
          + New Workspace
        </button>
      </div>

      {/* Workspace grid */}
      {workspaces.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <svg width="88" height="80" viewBox="0 0 88 80" fill="none">
            {/* Three building blocks / workspace cards */}
            <rect x="4" y="28" width="24" height="36" rx="5" fill="#ecefe7" stroke="#dee4da" strokeWidth="1.5"/>
            <rect x="32" y="16" width="24" height="48" rx="5" fill="#f3f4ee" stroke="#dee4da" strokeWidth="1.5"/>
            <rect x="60" y="24" width="24" height="40" rx="5" fill="#ecefe7" stroke="#dee4da" strokeWidth="1.5"/>
            {/* Windows on buildings */}
            <rect x="9" y="34" width="6" height="5" rx="1.5" fill="#dee4da"/>
            <rect x="19" y="34" width="6" height="5" rx="1.5" fill="#dee4da"/>
            <rect x="9" y="44" width="6" height="5" rx="1.5" fill="#dee4da"/>
            <rect x="37" y="22" width="6" height="5" rx="1.5" fill="#dee4da"/>
            <rect x="47" y="22" width="6" height="5" rx="1.5" fill="#dee4da"/>
            <rect x="37" y="32" width="6" height="5" rx="1.5" fill="#dee4da"/>
            <rect x="65" y="30" width="6" height="5" rx="1.5" fill="#dee4da"/>
            <rect x="75" y="30" width="6" height="5" rx="1.5" fill="#dee4da"/>
            {/* Green plus badge */}
            <circle cx="44" cy="70" r="10" fill="#3a6758"/>
            <path d="M44 65v10M39 70h10" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <p className="text-sm font-semibold" style={{ color:'#5b6159' }}>No workspaces yet</p>
          <p className="text-xs" style={{ color:'#aeb4aa' }}>Create one to start collaborating with your team.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workspaces.map(ws => (
            <button
              key={ws.id}
              onClick={() => openDetail(ws)}
              className="text-left rounded-2xl p-5 transition-all"
              style={{ background:'#ffffff', border:'1px solid #dee4da', boxShadow:'0 2px 8px rgba(46,52,45,0.05)' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow='0 4px 20px rgba(46,52,45,0.10)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow='0 2px 8px rgba(46,52,45,0.05)'}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0" style={{ background:'#ecefe7' }}>
                  🏢
                </div>
                <h3 className="text-sm font-bold truncate" style={{ color:'#2e342d' }}>
                  {ws.name}
                </h3>
              </div>
              {ws.description && (
                <p className="text-xs mb-3 line-clamp-2" style={{ color:'#767c74' }}>
                  {ws.description}
                </p>
              )}
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs" style={{ color:'#aeb4aa' }}>
                  By <span className="font-semibold" style={{ color:'#5b6159' }}>{ws.owner_name}</span>
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background:'#ecefe7', color:'#3a6758' }}>
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
            className="w-full max-w-md rounded-2xl p-6"
            style={{ background:'#ffffff', border:'1px solid #dee4da', boxShadow:'0 8px 40px rgba(46,52,45,0.12)' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-extrabold mb-4" style={{ fontFamily:'Epilogue,sans-serif', color:'#2e342d' }}>
              New Workspace
            </h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color:'#5b6159' }}>
                  Name
                </label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={e => setCreateForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Sprint 1"
                  required
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-colors"
                  style={{ border:'1.5px solid #dee4da', background:'#f3f4ee', color:'#2e342d' }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color:'#5b6159' }}>
                  Description
                </label>
                <textarea
                  value={createForm.description}
                  onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Optional description..."
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-colors resize-none"
                  style={{ border:'1.5px solid #dee4da', background:'#f3f4ee', color:'#2e342d' }}
                />
              </div>

              {createError && (
                <p className="text-xs font-semibold" style={{ color:'#b91c1c' }}>{createError}</p>
              )}

              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm font-semibold rounded-xl transition-colors"
                  style={{ border:'1.5px solid #dee4da', color:'#5b6159', background:'transparent' }}>
                  Cancel
                </button>
                <button type="submit"
                  className="px-5 py-2 text-sm font-bold rounded-xl text-white transition-colors"
                  style={{ background:'#3a6758' }}>
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
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6"
            style={{ background:'#ffffff', border:'1px solid #dee4da', boxShadow:'0 8px 40px rgba(46,52,45,0.12)' }}
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
