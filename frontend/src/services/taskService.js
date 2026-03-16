/**
 * Task Service
 *
 * Wraps all task-related API calls. Used by TasksPage and DashboardPage.
 * All functions return the response data directly (not the axios response).
 */

import api from './api'

/**
 * Fetch all tasks for the current user.
 * @returns {Promise<Array>} Array of task objects.
 */
export async function fetchTasks() {
  const res = await api.get('/tasks')
  return res.data
}

/**
 * Create a new task.
 * @param {Object} taskData - { title, description, priority, deadline, status }
 * @returns {Promise<Object>} The created task with server-assigned id.
 */
export async function createTask(taskData) {
  const res = await api.post('/tasks', taskData)
  return res.data
}

/**
 * Update an existing task by id.
 * @param {string} taskId - MongoDB task id.
 * @param {Object} updates - Partial task fields to update.
 * @returns {Promise<Object>} The updated task.
 */
export async function updateTask(taskId, updates) {
  const res = await api.put(`/tasks/${taskId}`, updates)
  return res.data
}

/**
 * Mark a task as complete (sets status to DONE).
 * @param {string} taskId - MongoDB task id.
 * @returns {Promise<Object>} Updated task with is_complete=true.
 */
export async function markTaskComplete(taskId) {
  const res = await api.patch(`/tasks/${taskId}/complete`)
  return res.data
}

/**
 * Delete a task permanently.
 * @param {string} taskId - MongoDB task id.
 * @returns {Promise<void>}
 */
export async function deleteTask(taskId) {
  await api.delete(`/tasks/${taskId}`)
}
