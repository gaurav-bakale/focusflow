/**
 * Timer Service
 */
import api from './api'

export async function logSession(sessionData) {
  const res = await api.post('/timer/sessions', sessionData)
  return res.data
}

export async function fetchSessions() {
  const res = await api.get('/timer/sessions')
  return res.data
}

export async function fetchStats() {
  const res = await api.get('/timer/stats')
  return res.data
}

/**
 * Calendar Service
 */
export async function fetchBlocks() {
  const res = await api.get('/calendar/blocks')
  return res.data
}

export async function createBlock(blockData) {
  const res = await api.post('/calendar/blocks', blockData)
  return res.data
}

/**
 * Create multiple calendar blocks in a single request.
 * Used for recurring-task series so the whole batch is created atomically.
 * @param {Array} blocks  Array of block-create payloads (each with title, start_time, etc.)
 * @returns {Promise<Array>} Created TimeBlockResponse array.
 */
export async function createBlocksBulk(blocks) {
  if (!blocks || blocks.length === 0) return []
  const res = await api.post('/calendar/blocks/bulk', { blocks })
  return res.data
}

/**
 * Update a block with optional edit scope.
 * @param {string} blockId
 * @param {object} blockData
 * @param {'this'|'this_and_future'} [scope='this']
 */
export async function updateBlock(blockId, blockData, scope = 'this') {
  const res = await api.put(`/calendar/blocks/${blockId}?scope=${scope}`, blockData)
  return res.data
}

/**
 * Delete a block with optional delete scope.
 * @param {string} blockId
 * @param {'this'|'this_and_future'} [scope='this']
 */
export async function deleteBlock(blockId, scope = 'this') {
  await api.delete(`/calendar/blocks/${blockId}?scope=${scope}`)
}

/**
 * AI Service
 */
export async function breakdownTask(taskId, taskTitle, taskDescription = '') {
  const res = await api.post('/ai/breakdown', {
    task_id: taskId,
    task_title: taskTitle,
    task_description: taskDescription,
  })
  return res.data
}

export async function prioritizeTasks(tasks) {
  const res = await api.post('/ai/prioritize', { tasks })
  return res.data
}

export async function generateTasks(goal) {
  const res = await api.post('/ai/generate-tasks', { goal })
  return res.data
}

export async function refineTasks(goal, tasks, feedback) {
  const res = await api.post('/ai/refine-tasks', { goal, tasks, feedback })
  return res.data
}

export async function aiSchedule(tasks, availableHours = 8) {
  const res = await api.post('/ai/schedule', { tasks, available_hours: availableHours })
  return res.data
}

export async function aiFrog(tasks) {
  const res = await api.post('/ai/frog', { tasks })
  return res.data
}

export async function aiTips() {
  const res = await api.post('/ai/tips')
  return res.data
}

/**
 * Notification Service
 */
export async function fetchNotifications(unreadOnly = false) {
  const res = await api.get('/notifications/', { params: { unread_only: unreadOnly } })
  return res.data
}

export async function fetchUnreadCount() {
  const res = await api.get('/notifications/count')
  return res.data
}

export async function markNotificationRead(id) {
  const res = await api.patch(`/notifications/${id}/read`)
  return res.data
}

export async function markAllNotificationsRead() {
  const res = await api.patch('/notifications/read-all')
  return res.data
}

export async function deleteNotification(id) {
  await api.delete(`/notifications/${id}`)
}

/**
 * Export user data as CSV or JSON.
 * Triggers a file download in the browser.
 *
 * @param {string} type   - "tasks" | "sessions" | "blocks" | "all"
 * @param {string} format - "csv" | "json"
 */
export async function exportData(type, format = 'json') {
  const url = type === 'all'
    ? '/export/all'
    : `/export/${type}?format=${format}`

  const res = await api.get(url, { responseType: 'blob' })

  // Build filename from Content-Disposition header or fallback
  const disposition = res.headers['content-disposition'] || ''
  const match = disposition.match(/filename="(.+)"/)
  const filename = match ? match[1] : `focusflow_${type}.${format}`

  // Trigger browser download
  const blob = new Blob([res.data])
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}
