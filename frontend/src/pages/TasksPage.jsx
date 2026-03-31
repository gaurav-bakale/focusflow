/**
 * TasksPage - Full task management with categories
 */

import React, { useEffect, useState } from 'react'
import { fetchTasks, createTask, updateTask, deleteTask, markTaskComplete } from '../services/taskService'

export default function TasksPage() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM',
    deadline: '',
    status: 'TODO',
    categories: []
  })
  const [categoryInput, setCategoryInput] = useState('')

  useEffect(() => {
    loadTasks()
  }, [])

  async function loadTasks() {
    try {
      const data = await fetchTasks()
      setTasks(data)
    } catch (e) {
      console.error('Failed to load tasks:', e)
    }
    setLoading(false)
  }

  function openModal(task = null) {
    if (task) {
      setEditingTask(task)
      setFormData({
        title: task.title,
        description: task.description || '',
        priority: task.priority,
        deadline: task.deadline || '',
        status: task.status,
        categories: task.categories || []
      })
    } else {
      setEditingTask(null)
      setFormData({
        title: '',
        description: '',
        priority: 'MEDIUM',
        deadline: '',
        status: 'TODO',
        categories: []
      })
    }
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingTask(null)
    setCategoryInput('')
  }

  function addCategory() {
    if (categoryInput.trim() && !formData.categories.includes(categoryInput.trim())) {
      setFormData(prev => ({
        ...prev,
        categories: [...prev.categories, categoryInput.trim()]
      }))
      setCategoryInput('')
    }
  }

  function removeCategory(category) {
    setFormData(prev => ({
      ...prev,
      categories: prev.categories.filter(c => c !== category)
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      if (editingTask) {
        const updated = await updateTask(editingTask.id, formData)
        setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
      } else {
        const created = await createTask(formData)
        setTasks(prev => [created, ...prev])
      }
      closeModal()
    } catch (e) {
      console.error('Failed to save task:', e)
    }
  }

  async function handleDelete(taskId) {
    if (!confirm('Delete this task?')) return
    try {
      await deleteTask(taskId)
      setTasks(prev => prev.filter(t => t.id !== taskId))
    } catch (e) {
      console.error('Failed to delete task:', e)
    }
  }

  async function handleComplete(taskId) {
    try {
      const updated = await markTaskComplete(taskId)
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
    } catch (e) {
      console.error('Failed to complete task:', e)
    }
  }

  const allCategories = ['all', ...new Set(tasks.flatMap(t => t.categories || []))]
  const filteredTasks = selectedCategory === 'all' 
    ? tasks 
    : tasks.filter(t => t.categories?.includes(selectedCategory))

  const tasksByStatus = {
    TODO: filteredTasks.filter(t => t.status === 'TODO'),
    IN_PROGRESS: filteredTasks.filter(t => t.status === 'IN_PROGRESS'),
    DONE: filteredTasks.filter(t => t.status === 'DONE')
  }

  if (loading) {
    return <div className="p-8 text-gray-400">Loading tasks...</div>
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Task Board</h1>
        <button
          onClick={() => openModal()}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          + New Task
        </button>
      </div>

      <div className="mb-6 flex gap-2 flex-wrap">
        {allCategories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              selectedCategory === cat
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat === 'all' ? 'All Tasks' : cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {Object.entries(tasksByStatus).map(([status, statusTasks]) => (
          <div key={status} className="bg-gray-50 rounded-xl p-4">
            <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${
                status === 'TODO' ? 'bg-blue-500' :
                status === 'IN_PROGRESS' ? 'bg-amber-500' : 'bg-green-500'
              }`} />
              {status.replace('_', ' ')}
              <span className="ml-auto text-sm text-gray-400">{statusTasks.length}</span>
            </h2>
            <div className="space-y-3">
              {statusTasks.map(task => (
                <div key={task.id} className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-medium text-gray-800 flex-1">{task.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      task.priority === 'HIGH' ? 'bg-red-100 text-red-600' :
                      task.priority === 'MEDIUM' ? 'bg-amber-100 text-amber-600' :
                      'bg-green-100 text-green-600'
                    }`}>
                      {task.priority}
                    </span>
                  </div>
                  {task.description && (
                    <p className="text-sm text-gray-500 mb-2">{task.description}</p>
                  )}
                  {task.categories && task.categories.length > 0 && (
                    <div className="flex gap-1 flex-wrap mb-2">
                      {task.categories.map(cat => (
                        <span key={cat} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => openModal(task)}
                      className="text-xs text-indigo-600 hover:text-indigo-700"
                    >
                      Edit
                    </button>
                    {task.status !== 'DONE' && (
                      <button
                        onClick={() => handleComplete(task.id)}
                        className="text-xs text-green-600 hover:text-green-700"
                      >
                        Complete
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(task.id)}
                      className="text-xs text-red-600 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              {editingTask ? 'Edit Task' : 'New Task'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  rows="3"
                />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={e => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={e => setFormData(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="TODO">To Do</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="DONE">Done</option>
                  </select>
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
                <input
                  type="date"
                  value={formData.deadline}
                  onChange={e => setFormData(prev => ({ ...prev, deadline: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Categories</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={categoryInput}
                    onChange={e => setCategoryInput(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addCategory())}
                    placeholder="Add category..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={addCategory}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    Add
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {formData.categories.map(cat => (
                    <span
                      key={cat}
                      className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-sm"
                    >
                      {cat}
                      <button
                        type="button"
                        onClick={() => removeCategory(cat)}
                        className="text-indigo-500 hover:text-indigo-700"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  {editingTask ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
