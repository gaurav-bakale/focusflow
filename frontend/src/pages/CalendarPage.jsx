/**
 * CalendarPage
 *
 * Weekly time-blocking calendar using FullCalendar.
 * Users can create, edit, and delete time blocks,
 * and optionally link each block to an existing task.
 */

import React, { useEffect, useState, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import { fetchBlocks, createBlock, updateBlock, deleteBlock } from '../services/otherServices'
import { fetchTasks } from '../services/taskService'

const BLOCK_COLORS = [
  '#6366F1', '#F59E0B', '#10B981', '#3B82F6', '#EC4899', '#8B5CF6',
]

function BlockModal({ block, tasks, onSave, onDelete, onClose }) {
  const isNew = !block.id
  const [form, setForm] = useState({
    title:     block.title     || '',
    start_time: block.start_time || '',
    end_time:   block.end_time   || '',
    task_id:   block.task_id   || '',
  })
  const [loading, setLoading] = useState(false)

  async function handleSave(e) {
    e.preventDefault()
    setLoading(true)
    try { await onSave({ ...form, task_id: form.task_id || null }) }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
        <h2 className="font-bold text-gray-800 mb-4">{isNew ? 'New Time Block' : 'Edit Time Block'}</h2>
        <form onSubmit={handleSave} className="space-y-3">
          <input
            required placeholder="Block title"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-500">Start</label>
              <input type="datetime-local" required
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                value={form.start_time}
                onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500">End</label>
              <input type="datetime-local" required
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                value={form.end_time}
                onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
              />
            </div>
          </div>
          <select
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={form.task_id}
            onChange={e => setForm(f => ({ ...f, task_id: e.target.value }))}
          >
            <option value="">— Link to a task (optional) —</option>
            {tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <div className="flex gap-2 pt-1">
            {!isNew && (
              <button type="button" onClick={onDelete}
                className="flex-1 border border-red-200 text-red-500 rounded-lg py-2 text-sm hover:bg-red-50">
                Delete
              </button>
            )}
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
              {loading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CalendarPage() {
  const [events, setEvents] = useState([])
  const [tasks, setTasks]   = useState([])
  const [modal, setModal]   = useState(null)   // null | { id?, title, start_time, end_time, task_id }
  const calRef = useRef(null)

  useEffect(() => {
    Promise.all([fetchBlocks(), fetchTasks()]).then(([blocks, ts]) => {
      setTasks(ts.filter(t => !t.is_complete))
      setEvents(blocks.map((b, i) => ({
        id: b.id,
        title: b.title,
        start: b.start_time,
        end: b.end_time,
        backgroundColor: BLOCK_COLORS[i % BLOCK_COLORS.length],
        borderColor: 'transparent',
        extendedProps: { task_id: b.task_id, ...b },
      })))
    })
  }, [])

  // Click on empty slot → open "new block" modal pre-filled with the time
  function handleDateSelect(info) {
    setModal({
      title: '',
      start_time: info.startStr.slice(0, 16),
      end_time:   info.endStr.slice(0, 16),
      task_id: '',
    })
    info.view.calendar.unselect()
  }

  // Click on existing block → open "edit block" modal
  function handleEventClick(info) {
    const ep = info.event.extendedProps
    setModal({
      id:         info.event.id,
      title:      info.event.title,
      start_time: info.event.startStr.slice(0, 16),
      end_time:   info.event.endStr?.slice(0, 16) || '',
      task_id:    ep.task_id || '',
    })
  }

  async function handleSave(formData) {
    if (modal.id) {
      // Update existing block
      const updated = await updateBlock(modal.id, formData)
      setEvents(prev => prev.map(e => e.id === modal.id ? {
        ...e,
        title: updated.title,
        start: updated.start_time,
        end:   updated.end_time,
        extendedProps: updated,
      } : e))
    } else {
      // Create new block
      const created = await createBlock(formData)
      const colorIdx = events.length % BLOCK_COLORS.length
      setEvents(prev => [...prev, {
        id: created.id,
        title: created.title,
        start: created.start_time,
        end:   created.end_time,
        backgroundColor: BLOCK_COLORS[colorIdx],
        borderColor: 'transparent',
        extendedProps: created,
      }])
    }
    setModal(null)
  }

  async function handleDelete() {
    await deleteBlock(modal.id)
    setEvents(prev => prev.filter(e => e.id !== modal.id))
    setModal(null)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-800">Calendar</h1>
        <button
          onClick={() => setModal({ title: '', start_time: '', end_time: '', task_id: '' })}
          className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700"
        >
          + New Block
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4">
        <FullCalendar
          ref={calRef}
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left:   'prev,next today',
            center: 'title',
            right:  'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          selectable
          selectMirror
          events={events}
          select={handleDateSelect}
          eventClick={handleEventClick}
          height="auto"
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
          allDaySlot={false}
        />
      </div>

      {modal && (
        <BlockModal
          block={modal}
          tasks={tasks}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
