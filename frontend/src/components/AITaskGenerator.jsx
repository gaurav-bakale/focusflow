/**
 * AITaskGenerator — Conversational AI task breakdown on the Dashboard.
 *
 * Flow:
 *   1. User types a goal → AI generates exactly 5 tasks
 *   2. Review: "Happy with these?" → Add to Board / Suggest Changes / Discard
 *   3. Suggest Changes: user provides feedback → AI revises → back to review
 *   4. Add to Board: creates all 5 tasks as TODO
 *   5. Discard: clears everything
 */

import React, { useState } from 'react'
import { generateTasks, refineTasks } from '../services/otherServices'
import { createTask } from '../services/taskService'
import { saveApiKey } from '../services/authService'
import SketchLine from './SketchLine'

const PRIORITY_COLORS = {
  HIGH:   'bg-red-100 text-red-700 border-red-200',
  MEDIUM: 'bg-amber-100 text-amber-700 border-amber-200',
  LOW:    'bg-green-100 text-green-700 border-green-200',
}

export default function AITaskGenerator({ onTasksCreated }) {
  const [step, setStep] = useState('idle')   // idle | loading | review | apikey | done
  const [goal, setGoal] = useState('')
  const [tasks, setTasks] = useState([])
  const [summary, setSummary] = useState('')
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [creating, setCreating] = useState(false)
  const [refining, setRefining] = useState(false)

  async function handleGenerate(e) {
    e.preventDefault()
    if (!goal.trim()) return
    setError('')
    setStep('loading')
    try {
      const res = await generateTasks(goal)
      setTasks(res.tasks)
      setSummary(res.summary)
      setShowFeedback(false)
      setFeedback('')
      setStep('review')
    } catch (err) {
      const detail = err.response?.data?.detail || ''
      if (detail.includes('API key')) {
        setStep('apikey')
      } else {
        setError(detail || 'Failed to generate tasks. Please try again.')
        setStep('idle')
      }
    }
  }

  async function handleAccept() {
    setCreating(true)
    setError('')
    try {
      for (const task of tasks) {
        await createTask({
          title: task.title,
          description: task.description,
          priority: task.priority,
          status: 'TODO',
          categories: task.category ? [task.category] : [],
        })
      }
      setStep('done')
      onTasksCreated?.()
    } catch {
      setError('Failed to create some tasks. Please try again.')
    }
    setCreating(false)
  }

  function handleDiscard() {
    setTasks([])
    setSummary('')
    setGoal('')
    setFeedback('')
    setShowFeedback(false)
    setError('')
    setStep('idle')
  }

  async function handleRefine(e) {
    e.preventDefault()
    if (!feedback.trim()) return
    setRefining(true)
    setError('')
    try {
      const res = await refineTasks(goal, tasks, feedback)
      setTasks(res.tasks)
      setSummary(res.summary)
      setFeedback('')
      setShowFeedback(false)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to revise tasks. Please try again.')
    }
    setRefining(false)
  }

  async function handleSaveApiKey(e) {
    e.preventDefault()
    if (!apiKey.trim()) return
    setError('')
    try {
      await saveApiKey(apiKey.trim())
      setApiKey('')
      setStep('loading')
      const res = await generateTasks(goal)
      setTasks(res.tasks)
      setSummary(res.summary)
      setStep('review')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save API key.')
    }
  }

  function handleReset() {
    setStep('idle')
    setGoal('')
    setTasks([])
    setSummary('')
    setFeedback('')
    setShowFeedback(false)
    setError('')
  }

  return (
    <div
      className="rounded-2xl relative overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(16px) saturate(150%)',
        WebkitBackdropFilter: 'blur(16px) saturate(150%)',
        boxShadow: '0 4px 20px rgba(46,52,45,0.06)',
        border: '1px solid rgba(255,255,255,0.55)',
      }}
    >
      <SketchLine color="#7a6a89" thickness={4} />

      <div className="px-6 py-4 flex items-start gap-3" style={{ borderBottom: '1px solid #dee4da' }}>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: '#ede9fe', color: '#6d28d9' }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: '#6d28d9' }}>AI Task Planner</p>
          <h2 className="text-base font-extrabold" style={{ fontFamily: 'Epilogue, sans-serif', color: '#2e342d' }}>
            Describe your goal<span style={{ color: '#7a6a89' }}>.</span>
          </h2>
          <p className="text-xs mt-0.5" style={{ color: '#5b6159' }}>AI will break it into 5 actionable tasks.</p>
        </div>
      </div>

      <div className="px-6 py-5">

        {/* Error */}
        {error && (
          <div className="mb-4 px-3 py-2 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400 font-medium">
            {error}
          </div>
        )}

        {/* Step: API Key needed */}
        {step === 'apikey' && (
          <form onSubmit={handleSaveApiKey}>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              To use AI features, please enter your Gemini API key. You can get one from{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer"
                className="font-bold text-gray-900 dark:text-gray-100 underline">Google AI Studio</a>.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Paste your Gemini API key..."
                className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none transition-colors"
                style={{ background: '#f3f4ee', border: '1px solid #dee4da', color: '#2e342d' }}
              />
              <button
                type="submit"
                className="px-5 py-2.5 font-bold text-sm rounded-xl transition-colors hover:opacity-90"
                style={{ background: '#3a6758', color: '#ffffff' }}
              >
                Save
              </button>
            </div>
          </form>
        )}

        {/* Step: Idle */}
        {step === 'idle' && (
          <form onSubmit={handleGenerate} className="flex gap-2">
            <input
              type="text"
              value={goal}
              onChange={e => setGoal(e.target.value)}
              placeholder="e.g., Build a personal portfolio website"
              className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none transition-colors placeholder-gray-400"
              style={{ background: '#f3f4ee', border: '1px solid #dee4da', color: '#2e342d' }}
            />
            <button
              type="submit"
              disabled={!goal.trim()}
              className="flex items-center gap-2 px-5 py-2.5 font-bold text-sm rounded-xl transition-colors hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: '#3a6758', color: '#ffffff' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
              Generate
            </button>
          </form>
        )}

        {/* Step: Loading */}
        {step === 'loading' && (
          <div className="flex items-center gap-3 py-4">
            <div className="w-5 h-5 rounded-full animate-spin" style={{ border: '2px solid #3a6758', borderTopColor: 'transparent' }} />
            <span className="text-sm font-bold" style={{ color: '#5b6159' }}>AI is thinking…</span>
          </div>
        )}

        {/* Step: Review */}
        {step === 'review' && (
          <div>
            {/* Summary */}
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">{summary}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Here are 5 tasks for your goal — are you happy with these?</p>

            {/* Task list */}
            <div className="space-y-2 mb-5">
              {tasks.map((task, i) => (
                <div key={i} className="rounded-xl p-3 flex items-start gap-3" style={{ background: '#f3f4ee', border: '1px solid #dee4da' }}>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black font-mono shrink-0 mt-0.5" style={{ background: '#3a6758', color: '#ffffff' }}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{task.title}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded border font-bold shrink-0 ${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.MEDIUM}`}>
                        {task.priority}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{task.description}</p>
                    {task.category && (
                      <span className="inline-block mt-1 text-xs font-bold bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded">
                        {task.category}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            {!showFeedback && (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={handleAccept}
                  disabled={creating}
                  className="px-5 py-2.5 font-bold text-sm rounded-xl transition-colors hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ background: '#3a6758', color: '#ffffff' }}
                >
                  {creating ? 'Adding…' : 'Add to Board'}
                </button>
                <button
                  onClick={() => setShowFeedback(true)}
                  className="px-4 py-2.5 font-bold text-sm rounded-xl transition-colors"
                  style={{ background: '#ecefe7', color: '#5b6159' }}
                >
                  Suggest Changes
                </button>
                <button
                  onClick={handleDiscard}
                  className="px-4 py-2.5 font-bold text-sm rounded-xl transition-colors"
                  style={{ background: 'transparent', border: '1px solid #fecaca', color: '#9f403d' }}
                >
                  Discard
                </button>
              </div>
            )}

            {/* Feedback form */}
            {showFeedback && (
              <form onSubmit={handleRefine} className="mt-1">
                <p className="text-xs font-bold mb-2" style={{ color: '#5b6159' }}>What would you like to change?</p>
                <textarea
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  placeholder="e.g., make task 3 more specific, add a testing task, simplify the steps…"
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none transition-colors"
                  style={{ background: '#f3f4ee', border: '1px solid #dee4da', color: '#2e342d' }}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    type="submit"
                    disabled={!feedback.trim() || refining}
                    className="px-5 py-2 font-bold text-sm rounded-xl transition-colors hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: '#3a6758', color: '#ffffff' }}
                  >
                    {refining ? 'Revising…' : 'Revise Tasks'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowFeedback(false); setFeedback('') }}
                    className="px-4 py-2 font-bold text-sm rounded-xl transition-colors"
                    style={{ background: '#ecefe7', color: '#5b6159' }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="py-2">
            <p className="text-sm font-extrabold mb-1" style={{ color: '#2e342d' }}>
              ✓ 5 tasks added to your board
            </p>
            <p className="text-xs mb-4" style={{ color: '#5b6159' }}>Head to the Board to start working on them.</p>
            <button
              onClick={handleReset}
              className="px-4 py-2 font-bold text-sm rounded-xl transition-colors"
              style={{ background: '#ecefe7', color: '#5b6159' }}
            >
              Plan something else
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
