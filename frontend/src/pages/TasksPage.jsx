/**
 * TasksPage — Project Board with drag-and-drop Kanban columns.
 *
 * Uses react-beautiful-dnd for dragging tasks between columns.
 * Matches the wireframe: bold borders, colored task cards,
 * dashed column outlines, category tags, and inline actions.
 */

import React, { useEffect, useState } from 'react'
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd'
import { fetchTasks, createTask, updateTask, deleteTask, markTaskComplete } from '../services/taskService'

const COLUMNS = ['TODO', 'IN_PROGRESS', 'DONE']

const COLUMN_CONFIG = {
  TODO:        { label: 'To Do' },
  IN_PROGRESS: { label: 'In Progress' },
  DONE:        { label: 'Done' },
}

const CARD_COLORS = {
  TODO:        'bg-amber-50 border-amber-200',
  IN_PROGRESS: 'bg-yellow-50 border-yellow-200',
  DONE:        'bg-sky-50 border-sky-200',
}

const PRIORITY_BADGE = {
  HIGH:   'bg-red-100 text-red-700 border-red-200',
  MEDIUM: 'bg-amber-100 text-amber-700 border-amber-200',
  LOW:    'bg-green-100 text-green-700 border-green-200',
}

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

  useEffect(() => { loadTasks() }, [])

  async function loadTasks() {
    try {
      const data = await fetchTasks()
      setTasks(data)
    } catch (e) {
      console.error('Failed to load tasks:', e)
    }
    setLoading(false)
  }

  function openModal(task = null, defaultStatus = 'TODO') {
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
        status: defaultStatus,
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

  async function onDragEnd(result) {
    const { draggableId, source, destination } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const newStatus = destination.droppableId

    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === draggableId ? { ...t, status: newStatus } : t
    ))

    try {
      await updateTask(draggableId, { status: newStatus })
    } catch (e) {
      console.error('Failed to move task:', e)
      // Revert on failure
      setTasks(prev => prev.map(t =>
        t.id === draggableId ? { ...t, status: source.droppableId } : t
      ))
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
    return (
      <div className="p-10 max-w-7xl mx-auto">
        <div className="grid grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="border-2 border-dashed border-gray-300 rounded-lg h-64 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-10 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Project Board</h1>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 border-2 border-gray-900 text-gray-900 font-bold text-sm
                     px-4 py-2 rounded-lg hover:bg-gray-900 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          New Note
        </button>
      </div>

      {/* Category filters */}
      {allCategories.length > 1 && (
        <div className="mb-6 flex gap-2 flex-wrap">
          {allCategories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded border-2 text-sm font-bold transition-colors ${
                selectedCategory === cat
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-300 text-gray-500 hover:border-gray-900 hover:text-gray-900'
              }`}
            >
              {cat === 'all' ? 'All Tasks' : cat}
            </button>
          ))}
        </div>
      )}

      {/* Kanban columns with drag-and-drop */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-3 gap-6">
          {COLUMNS.map(status => {
            const config = COLUMN_CONFIG[status]
            const statusTasks = tasksByStatus[status]
            return (
              <div key={status} className="border-2 border-dashed border-gray-300 rounded-lg p-4 min-h-[300px]">

                {/* Column header */}
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-extrabold text-gray-900">{config.label}</h2>
                  <button
                    onClick={() => openModal(null, status)}
                    className="w-7 h-7 rounded-full border-2 border-gray-900 flex items-center justify-center
                               hover:bg-gray-900 hover:text-white transition-colors text-gray-900"
                    aria-label={`Add task to ${config.label}`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>

                {/* Droppable area */}
                <Droppable droppableId={status}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`space-y-3 min-h-[100px] rounded-lg transition-colors ${
                        snapshot.isDraggingOver ? 'bg-gray-100/60' : ''
                      }`}
                    >
                      {statusTasks.map((task, index) => {
                        const cardColor = CARD_COLORS[status]
                        const priorityBadge = PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.MEDIUM
                        return (
                          <Draggable key={task.id} draggableId={task.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`border-2 rounded-lg p-4 group cursor-grab active:cursor-grabbing
                                  ${cardColor}
                                  ${snapshot.isDragging ? 'shadow-lg ring-2 ring-gray-900/20 rotate-1' : ''}
                                `}
                              >
                                <div className="flex justify-between items-start mb-2">
                                  <h3 className="font-bold text-gray-900 flex-1 text-sm">{task.title}</h3>
                                  <span className={`text-xs px-2 py-0.5 rounded border font-bold shrink-0 ml-2 ${priorityBadge}`}>
                                    {task.priority}
                                  </span>
                                </div>

                                {task.description && (
                                  <p className="text-xs text-gray-500 mb-2 line-clamp-2">{task.description}</p>
                                )}

                                {/* Category tags + deadline */}
                                <div className="flex items-center gap-2 flex-wrap mt-3">
                                  {task.categories && task.categories.map(cat => (
                                    <span key={cat} className="text-xs font-bold bg-white border border-gray-300 text-gray-600 px-2 py-0.5 rounded">
                                      {cat}
                                    </span>
                                  ))}
                                  {task.deadline && (
                                    <span className="text-xs text-gray-400 font-mono ml-auto">
                                      {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </span>
                                  )}
                                </div>

                                {/* Actions on hover */}
                                <div className="flex gap-3 mt-3 pt-3 border-t border-gray-200/60 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => openModal(task)}
                                    className="text-xs font-bold text-gray-600 hover:text-gray-900"
                                  >
                                    Edit
                                  </button>
                                  {task.status !== 'DONE' && (
                                    <button
                                      onClick={() => handleComplete(task.id)}
                                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700"
                                    >
                                      Complete
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDelete(task.id)}
                                    className="text-xs font-bold text-red-500 hover:text-red-700"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        )
                      })}
                      {provided.placeholder}
                      {statusTasks.length === 0 && !snapshot.isDraggingOver && (
                        <p className="text-xs text-gray-300 text-center py-8 font-medium">No tasks</p>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            )
          })}
        </div>
      </DragDropContext>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={closeModal}>
          <div
            className="bg-white border-2 border-gray-900 rounded-lg p-6 w-full max-w-md"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-extrabold text-gray-900 mb-5">
              {editingTask ? 'Edit Task' : 'New Task'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1.5">Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-gray-900 focus:ring-0 outline-none transition-colors"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1.5">Description</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-gray-900 focus:ring-0 outline-none transition-colors"
                  rows="3"
                />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1.5">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={e => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-gray-900 focus:ring-0 outline-none transition-colors"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1.5">Status</label>
                  <select
                    value={formData.status}
                    onChange={e => setFormData(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-gray-900 focus:ring-0 outline-none transition-colors"
                  >
                    <option value="TODO">To Do</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="DONE">Done</option>
                  </select>
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1.5">Deadline</label>
                <input
                  type="date"
                  value={formData.deadline}
                  onChange={e => setFormData(prev => ({ ...prev, deadline: e.target.value }))}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-gray-900 focus:ring-0 outline-none transition-colors"
                />
              </div>
              <div className="mb-5">
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1.5">Categories</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={categoryInput}
                    onChange={e => setCategoryInput(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addCategory())}
                    placeholder="Add category..."
                    className="flex-1 px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-gray-900 focus:ring-0 outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={addCategory}
                    className="px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg font-bold text-sm hover:border-gray-900 transition-colors"
                  >
                    Add
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {formData.categories.map(cat => (
                    <span
                      key={cat}
                      className="inline-flex items-center gap-1 border-2 border-gray-900 text-gray-900 px-2 py-0.5 rounded text-xs font-bold"
                    >
                      {cat}
                      <button
                        type="button"
                        onClick={() => removeCategory(cat)}
                        className="text-gray-400 hover:text-gray-900 ml-0.5"
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
                  className="px-4 py-2 border-2 border-gray-300 text-gray-600 font-bold text-sm rounded-lg hover:border-gray-900 hover:text-gray-900 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gray-900 text-white font-bold text-sm rounded-lg border-2 border-gray-900 hover:bg-gray-800 transition-colors"
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
