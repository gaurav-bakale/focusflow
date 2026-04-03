/**
 * CommentThread — Displays and manages comments for a task.
 *
 * Props:
 *   taskId  (string)  — MongoDB task id to load/post comments for
 *   visible (boolean) — whether the thread is shown
 *
 * Features:
 *   • Lists all comments oldest-first with author name and timestamp
 *   • Add new comment form
 *   • Edit own comments inline
 *   • Delete own comments
 */

import React, { useEffect, useState, useCallback } from 'react'
import {
  fetchComments,
  addComment,
  updateComment,
  deleteComment,
} from '../services/sharingService'

export default function CommentThread({ taskId, visible }) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [posting, setPosting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [error, setError] = useState('')

  const loadComments = useCallback(async () => {
    if (!taskId) return
    setLoading(true)
    try {
      const data = await fetchComments(taskId)
      setComments(Array.isArray(data) ? data : [])
    } catch (_) {
      setComments([])
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    if (visible && taskId) loadComments()
  }, [visible, taskId, loadComments])

  async function handlePost(e) {
    e.preventDefault()
    if (!newContent.trim()) return
    setPosting(true)
    setError('')
    try {
      await addComment(taskId, { content: newContent.trim() })
      setNewContent('')
      await loadComments()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to post comment')
    } finally {
      setPosting(false)
    }
  }

  function startEdit(comment) {
    setEditingId(comment.id)
    setEditContent(comment.content)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditContent('')
  }

  async function handleUpdate(e) {
    e.preventDefault()
    if (!editContent.trim()) return
    try {
      await updateComment(editingId, { content: editContent.trim() })
      cancelEdit()
      await loadComments()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update comment')
    }
  }

  async function handleDelete(commentId) {
    try {
      await deleteComment(commentId)
      setComments(prev => prev.filter(c => c.id !== commentId))
    } catch (err) {
      console.error('Failed to delete comment:', err)
    }
  }

  if (!visible) return null

  function formatTime(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
  }

  return (
    <div className="border-t-2 border-gray-200 dark:border-gray-700 pt-4 mt-4">
      <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">
        Comments
      </h3>

      {/* Comments list */}
      {loading ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">Loading comments...</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">No comments yet.</p>
      ) : (
        <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
          {comments.map(comment => (
            <div key={comment.id} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg">
              {editingId === comment.id ? (
                /* Inline edit form */
                <form onSubmit={handleUpdate} className="space-y-2">
                  <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    rows={2}
                    className="w-full px-2 py-1.5 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none transition-colors resize-none"
                  />
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={cancelEdit}
                      className="text-[10px] font-bold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                      Cancel
                    </button>
                    <button type="submit"
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-200">
                      Save
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-extrabold text-white shrink-0"
                        style={{ background: 'linear-gradient(135deg, #6366f1, #a78bfa)' }}>
                        {(comment.user_name || '?')[0].toUpperCase()}
                      </div>
                      <span className="text-xs font-bold text-gray-900 dark:text-gray-100">
                        {comment.user_name || 'Unknown'}
                      </span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        {formatTime(comment.created_at)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => startEdit(comment)}
                        className="text-[10px] font-bold text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(comment.id)}
                        className="text-[10px] font-bold text-red-400 hover:text-red-600">
                        Delete
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {comment.content}
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New comment form */}
      <form onSubmit={handlePost} className="flex gap-2">
        <input
          type="text"
          value={newContent}
          onChange={e => setNewContent(e.target.value)}
          placeholder="Add a comment..."
          className="flex-1 px-3 py-1.5 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none transition-colors"
        />
        <button type="submit" disabled={posting || !newContent.trim()}
          className="px-3 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-bold text-xs rounded-lg border-2 border-gray-900 dark:border-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors disabled:opacity-50">
          {posting ? '...' : 'Post'}
        </button>
      </form>

      {error && (
        <p className="text-xs font-bold text-red-600 dark:text-red-400 mt-1">{error}</p>
      )}
    </div>
  )
}
