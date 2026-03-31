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

export async function updateBlock(blockId, blockData) {
  const res = await api.put(`/calendar/blocks/${blockId}`, blockData)
  return res.data
}

export async function deleteBlock(blockId) {
  await api.delete(`/calendar/blocks/${blockId}`)
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
