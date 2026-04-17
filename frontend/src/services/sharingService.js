/**
 * Sharing Service
 *
 * Wraps all task-sharing and collaboration API calls.
 * Used by SharedTasksPage and share dialogs.
 * All functions return the response data directly (not the axios response).
 */

import api from './api'

// ── Task Sharing ────────────────────────────────────────────────────────────

/**
 * Share a task with another user by email.
 * @param {Object} data - { task_id, email, permission }
 * @returns {Promise<Object>} The created share record.
 */
export async function shareTask(data) {
  const res = await api.post('/sharing', data)
  return res.data
}

/**
 * Fetch tasks shared with the current user.
 * @returns {Promise<Array>} Array of shared task objects with owner info.
 */
export async function fetchSharedWithMe() {
  const res = await api.get('/sharing/shared-with-me')
  return res.data
}

/**
 * Fetch all shares for a specific task (who it's shared with).
 * @param {string} taskId - MongoDB task id.
 * @returns {Promise<Array>} Array of share records.
 */
export async function fetchTaskShares(taskId) {
  const res = await api.get(`/sharing/task/${taskId}`)
  return res.data
}

/**
 * Update a share's permission level.
 * @param {string} shareId - MongoDB share id.
 * @param {Object} updates - { permission }
 * @returns {Promise<Object>} Updated share record.
 */
export async function updateSharePermission(shareId, updates) {
  const res = await api.put(`/sharing/${shareId}`, updates)
  return res.data
}

/**
 * Revoke (delete) a task share.
 * @param {string} shareId - MongoDB share id.
 * @returns {Promise<void>}
 */
export async function revokeShare(shareId) {
  await api.delete(`/sharing/${shareId}`)
}

// ── Comments ────────────────────────────────────────────────────────────────

/**
 * Fetch all comments for a task.
 * @param {string} taskId - MongoDB task id.
 * @returns {Promise<Array>} Array of comment objects.
 */
export async function fetchComments(taskId) {
  const res = await api.get(`/tasks/${taskId}/comments`)
  return res.data
}

/**
 * Add a comment to a task.
 * @param {string} taskId - MongoDB task id.
 * @param {Object} data - { content }
 * @returns {Promise<Object>} The created comment.
 */
export async function addComment(taskId, data) {
  const res = await api.post(`/tasks/${taskId}/comments`, data)
  return res.data
}

/**
 * Update a comment.
 * @param {string} commentId - MongoDB comment id.
 * @param {Object} data - { content }
 * @returns {Promise<Object>} The updated comment.
 */
export async function updateComment(commentId, data) {
  const res = await api.put(`/comments/${commentId}`, data)
  return res.data
}

/**
 * Delete a comment.
 * @param {string} commentId - MongoDB comment id.
 * @returns {Promise<void>}
 */
export async function deleteComment(commentId) {
  await api.delete(`/comments/${commentId}`)
}

// ── Workspaces ──────────────────────────────────────────────────────────────

/**
 * Fetch all workspaces the user belongs to.
 * @returns {Promise<Array>} Array of workspace objects.
 */
export async function fetchWorkspaces() {
  const res = await api.get('/workspaces')
  return res.data
}

/**
 * Create a new workspace.
 * @param {Object} data - { name, description }
 * @returns {Promise<Object>} The created workspace.
 */
export async function createWorkspace(data) {
  const res = await api.post('/workspaces', data)
  return res.data
}

/**
 * Fetch a single workspace by id.
 * @param {string} workspaceId - MongoDB workspace id.
 * @returns {Promise<Object>} The workspace with members.
 */
export async function fetchWorkspace(workspaceId) {
  const res = await api.get(`/workspaces/${workspaceId}`)
  return res.data
}

/**
 * Add a member to a workspace.
 * @param {string} workspaceId - MongoDB workspace id.
 * @param {Object} data - { email, role }
 * @returns {Promise<Object>} The added member record.
 */
export async function addWorkspaceMember(workspaceId, data) {
  const res = await api.post(`/workspaces/${workspaceId}/members`, data)
  return res.data
}

/**
 * Fetch every task that belongs to a workspace.
 * @param {string} workspaceId - MongoDB workspace id.
 * @returns {Promise<Array>} Array of task objects.
 */
export async function fetchWorkspaceTasks(workspaceId) {
  const res = await api.get(`/workspaces/${workspaceId}/tasks`)
  return res.data
}

// ── Activity Feed ───────────────────────────────────────────────────────────

/**
 * Fetch the user's personal activity feed.
 * @param {number} limit - Max entries to return.
 * @returns {Promise<Array>} Array of activity entries.
 */
export async function fetchMyActivity(limit = 50) {
  const res = await api.get(`/activity/me?limit=${limit}`)
  return res.data
}

/**
 * Fetch activity feed for a specific task.
 * @param {string} taskId - MongoDB task id.
 * @param {number} limit - Max entries to return.
 * @returns {Promise<Array>} Array of activity entries.
 */
export async function fetchTaskActivity(taskId, limit = 50) {
  const res = await api.get(`/activity/task/${taskId}?limit=${limit}`)
  return res.data
}
