/**
 * @file TaskService.test.js
 * @description Unit tests for FocusFlow Task Service
 *
 * Framework: Jest 29
 * Strategy: Axios is fully mocked — no real HTTP calls are made.
 * Coverage areas: createTask, fetchTasks, updateTask, markTaskComplete, deleteTask
 *
 * Test Oracle Convention:
 *   Each test declares its Input, Expected Output, Success condition, and Failure condition.
 */

import {
  fetchTasks,
  createTask,
  updateTask,
  markTaskComplete,
  deleteTask,
} from '../services/taskService'

// Mock the entire axios module
jest.mock('axios')

// Re-create the api module's axios instance behaviour with a simple mock
// taskService uses `api` (our axios instance), so we mock the underlying axios methods
jest.mock('../services/api', () => ({
  get:    jest.fn(),
  post:   jest.fn(),
  put:    jest.fn(),
  patch:  jest.fn(),
  delete: jest.fn(),
}))

// Then import the mock to use in tests
import mockApi from '../services/api'

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1: createTask
// ─────────────────────────────────────────────────────────────────────────────
describe('createTask()', () => {
  beforeEach(() => jest.clearAllMocks())

  /**
   * TC-01: Create a valid task
   * Input:  { title: 'Write unit tests', priority: 'HIGH', deadline: '2025-04-01' }
   * Oracle: Returns task with id='abc123', title and priority matching input
   * Success: result.id defined AND result.priority === 'HIGH'
   * Failure: Promise rejects OR id is undefined
   */
  test('TC-01: creates a task and returns it with a server-assigned id', async () => {
    const payload = { title: 'Write unit tests', priority: 'HIGH', deadline: '2025-04-01' }
    const mockTask = { id: 'abc123', user_id: 'u1', ...payload, status: 'TODO', subtasks: [], is_complete: false }
    mockApi.post.mockResolvedValueOnce({ data: mockTask })

    const result = await createTask(payload)

    expect(mockApi.post).toHaveBeenCalledWith('/tasks', payload)
    expect(result.id).toBe('abc123')
    expect(result.priority).toBe('HIGH')
    expect(result.title).toBe('Write unit tests')
  })

  /**
   * TC-02: Reject creation when title is missing
   * Input:  { priority: 'LOW' } — no title field
   * Oracle: Promise rejects with error message containing 'required'
   * Success: Error is thrown
   * Failure: Task is created without a title
   */
  test('TC-02: throws an error when title is missing', async () => {
    mockApi.post.mockRejectedValueOnce(new Error('title is required'))
    await expect(createTask({ priority: 'LOW' })).rejects.toThrow('title is required')
  })

  /**
   * TC-03: Create a task with only a title (minimal valid input)
   * Input:  { title: 'Minimal task' }
   * Oracle: Returns task with defaults (priority=MEDIUM, status=TODO)
   * Success: result.priority === 'MEDIUM'
   * Failure: Error thrown or wrong defaults
   */
  test('TC-03: creates a task with default priority when not specified', async () => {
    const mockTask = { id: 'def456', title: 'Minimal task', priority: 'MEDIUM', status: 'TODO', subtasks: [], is_complete: false }
    mockApi.post.mockResolvedValueOnce({ data: mockTask })

    const result = await createTask({ title: 'Minimal task' })

    expect(result.priority).toBe('MEDIUM')
    expect(result.status).toBe('TODO')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2: fetchTasks
// ─────────────────────────────────────────────────────────────────────────────
describe('fetchTasks()', () => {
  beforeEach(() => jest.clearAllMocks())

  /**
   * TC-04: Fetch all tasks for the current user
   * Input:  (no arguments — uses JWT from localStorage)
   * Oracle: Returns an array of 2 task objects, each with id and title
   * Success: Array.isArray(result) === true AND result.length === 2
   * Failure: Returns empty array or throws
   */
  test('TC-04: returns an array of tasks for the authenticated user', async () => {
    const mockTasks = [
      { id: '1', title: 'Task A', priority: 'HIGH',   is_complete: false },
      { id: '2', title: 'Task B', priority: 'MEDIUM', is_complete: true  },
    ]
    mockApi.get.mockResolvedValueOnce({ data: mockTasks })

    const result = await fetchTasks()

    expect(mockApi.get).toHaveBeenCalledWith('/tasks')
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(2)
    expect(result[0]).toHaveProperty('id')
    expect(result[0]).toHaveProperty('title')
  })

  /**
   * TC-05: Returns empty array when user has no tasks
   * Input:  (authenticated user with no tasks)
   * Oracle: Returns []
   * Success: result.length === 0
   * Failure: Error thrown or non-empty result
   */
  test('TC-05: returns an empty array when the user has no tasks', async () => {
    mockApi.get.mockResolvedValueOnce({ data: [] })
    const result = await fetchTasks()
    expect(result).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3: updateTask
// ─────────────────────────────────────────────────────────────────────────────
describe('updateTask()', () => {
  beforeEach(() => jest.clearAllMocks())

  /**
   * TC-06: Update a task's priority
   * Input:  taskId='abc123', updates={ priority: 'LOW' }
   * Oracle: Returns updated task with priority='LOW'
   * Success: result.priority === 'LOW'
   * Failure: Priority unchanged or PUT not called
   */
  test('TC-06: updates the task and returns the updated object', async () => {
    const updated = { id: 'abc123', title: 'Write unit tests', priority: 'LOW', status: 'TODO' }
    mockApi.put.mockResolvedValueOnce({ data: updated })

    const result = await updateTask('abc123', { priority: 'LOW' })

    expect(mockApi.put).toHaveBeenCalledWith('/tasks/abc123', { priority: 'LOW' })
    expect(result.priority).toBe('LOW')
  })

  /**
   * TC-07: Update a task's status to IN_PROGRESS
   * Input:  taskId='abc123', updates={ status: 'IN_PROGRESS' }
   * Oracle: Returns task with status='IN_PROGRESS'
   * Success: result.status === 'IN_PROGRESS'
   * Failure: Status unchanged
   */
  test('TC-07: updates task status to IN_PROGRESS', async () => {
    const updated = { id: 'abc123', title: 'Task', priority: 'HIGH', status: 'IN_PROGRESS' }
    mockApi.put.mockResolvedValueOnce({ data: updated })

    const result = await updateTask('abc123', { status: 'IN_PROGRESS' })

    expect(result.status).toBe('IN_PROGRESS')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4: markTaskComplete
// ─────────────────────────────────────────────────────────────────────────────
describe('markTaskComplete()', () => {
  beforeEach(() => jest.clearAllMocks())

  /**
   * TC-08: Mark a task as complete
   * Input:  taskId='abc123'
   * Oracle: Returns task with is_complete=true and status='DONE'
   * Success: result.is_complete === true
   * Failure: is_complete remains false or error thrown
   */
  test('TC-08: sets is_complete to true and status to DONE', async () => {
    const completed = { id: 'abc123', title: 'Write unit tests', status: 'DONE', is_complete: true }
    mockApi.patch.mockResolvedValueOnce({ data: completed })

    const result = await markTaskComplete('abc123')

    expect(mockApi.patch).toHaveBeenCalledWith('/tasks/abc123/complete')
    expect(result.is_complete).toBe(true)
    expect(result.status).toBe('DONE')
  })

  /**
   * TC-09: Throws 404 when task id does not exist
   * Input:  taskId='nonexistent-id'
   * Oracle: Promise rejects with 'Task not found'
   * Success: Error containing 'not found' is thrown
   * Failure: Resolves without error
   */
  test('TC-09: throws an error when the task id does not exist', async () => {
    mockApi.patch.mockRejectedValueOnce(new Error('Task not found'))
    await expect(markTaskComplete('nonexistent-id')).rejects.toThrow('Task not found')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5: deleteTask
// ─────────────────────────────────────────────────────────────────────────────
describe('deleteTask()', () => {
  beforeEach(() => jest.clearAllMocks())

  /**
   * TC-10: Successfully delete a task
   * Input:  taskId='abc123'
   * Oracle: DELETE called on correct endpoint, resolves without error
   * Success: mockApi.delete called with '/tasks/abc123'
   * Failure: Error thrown or wrong endpoint called
   */
  test('TC-10: calls the correct delete endpoint and resolves', async () => {
    mockApi.delete.mockResolvedValueOnce({})

    await deleteTask('abc123')

    expect(mockApi.delete).toHaveBeenCalledWith('/tasks/abc123')
  })

  /**
   * TC-11: Throws 404 when deleting non-existent task
   * Input:  taskId='ghost-id'
   * Oracle: Promise rejects with 'Task not found'
   * Success: Error is thrown
   * Failure: Resolves silently
   */
  test('TC-11: throws an error when the task to delete does not exist', async () => {
    mockApi.delete.mockRejectedValueOnce(new Error('Task not found'))
    await expect(deleteTask('ghost-id')).rejects.toThrow('Task not found')
  })
})
