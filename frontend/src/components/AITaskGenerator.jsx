/**
 * AITaskGenerator — Conversational AI task breakdown on the Dashboard.
 *
 * Flow:
 *   1. User types a goal
 *   2. AI generates tasks
 *   3. User can: Accept (create all tasks), Reject (clear), or Suggest updates
 *   4. On "Suggest updates", user provides feedback → AI refines
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
  const [step, setStep] = useState('idle')       // idle | loading | review | refining | apikey | done
  const [goal, setGoal] = useState('')
  const [tasks, setTasks] = useState([])
  const [summary, setSummary] = useState('')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleGenerate(e) {
    e.preventDefault()
    if (!goal.trim()) return
    setError('')
    setStep('loading')
    try {
      const res = await generateTasks(goal)
      setTasks(res.tasks)
      setSummary(res.summary)
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
    } catch (err) {
      setError('Failed to create some tasks.')
    }
    setCreating(false)
  }

  function handleReject() {
    setTasks([])
    setSummary('')
    setGoal('')
    setStep('idle')
  }

  async function handleRefine(e) {
    e.preventDefault()
    if (!feedback.trim()) return
    setStep('loading')
    try {
      const res = await refineTasks(goal, tasks, feedback)
      setTasks(res.tasks)
      setSummary(res.summary)
      setFeedback('')
      setStep('review')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to refine tasks.')
      setStep('review')
    }
  }

  async function handleSaveApiKey(e) {
    e.preventDefault()
    if (!apiKey.trim()) return
    setError('')
    try {
      await saveApiKey(apiKey.trim())
      setApiKey('')
      setStep('loading')
      // Retry the generation
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
    setError('')
  }

  return (
    <div className="sketch-hover border-2 border-gray-900 dark:border-gray-600 rounded-lg relative overflow-hidden">
      <SketchLine color="#A78BFA" thickness={4} />

      <div className="px-6 py-5 border-b-2 border-gray-900 dark:border-gray-600">
        <h2 className="text-lg font-extrabold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          AI Task Planner
        </h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Describe what you want to accomplish</p>
      </div>

      <div className="px-6 py-5">

        {/* Error message */}
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
                className="flex-1 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-bold text-sm rounded-lg border-2 border-gray-900 dark:border-gray-600 hover:bg-gray-800"
              >
                Save
              </button>
            </div>
          </form>
        )}

        {/* Step: Idle — input goal */}
        {step === 'idle' && (
          <form onSubmit={handleGenerate} className="flex gap-2">
            <input
              type="text"
              value={goal}
              onChange={e => setGoal(e.target.value)}
              placeholder="e.g., Build a personal portfolio website"
              className="flex-1 px-3 py-2.5 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
            <button
              type="submit"
              disabled={!goal.trim()}
              className="px-5 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-bold text-sm rounded-lg border-2 border-gray-900 dark:border-gray-600
                         hover:bg-gray-800 disabled:opacity-40 transition-colors"
            >
              Generate
            </button>
          </form>
        )}

        {/* Step: Loading */}
        {step === 'loading' && (
          <div className="flex items-center gap-3 py-4">
            <div className="w-5 h-5 border-2 border-gray-900 dark:border-gray-100 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-bold text-gray-500 dark:text-gray-400">AI is thinking...</span>
          </div>
        )}

        {/* Step: Review generated tasks */}
        {step === 'review' && (
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">{summary}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">{tasks.length} tasks generated</p>

            <div className="space-y-2 mb-5">
              {tasks.map((task, i) => (
                <div key={i} className="border-2 border-gray-200 dark:border-gray-700 rounded-lg p-3 flex items-start gap-3">
                  <span className="text-xs font-mono font-bold text-gray-300 dark:text-gray-600 mt-0.5">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
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
            <div className="flex gap-3 mb-4">
              <button
                onClick={handleAccept}
                disabled={creating}
                className="px-5 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-bold text-sm rounded-lg border-2 border-gray-900 dark:border-gray-600
                           hover:bg-gray-800 disabled:opacity-60 transition-colors"
              >
                {creating ? 'Creating...' : 'Accept & Create Tasks'}
              </button>
              <button
                onClick={handleReject}
                className="px-4 py-2.5 border-2 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 font-bold text-sm rounded-lg
                           hover:border-gray-900 dark:hover:border-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                Reject
              </button>
            </div>

            {/* Suggest updates */}
            <form onSubmit={handleRefine} className="flex gap-2">
              <input
                type="text"
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder="Suggest changes... e.g., add a testing task, make it simpler"
                className="flex-1 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
              <button
                type="submit"
                disabled={!feedback.trim()}
                className="px-4 py-2 border-2 border-gray-900 dark:border-gray-600 text-gray-900 dark:text-gray-100 font-bold text-sm rounded-lg
                           hover:bg-gray-900 dark:hover:bg-gray-100 hover:text-white dark:hover:text-gray-900 disabled:opacity-40 transition-colors"
              >
                Refine
              </button>
            </form>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="py-2">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">
              {tasks.length} tasks created on your board!
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Head to the Board to manage them.</p>
            <button
              onClick={handleReset}
              className="px-4 py-2 border-2 border-gray-900 dark:border-gray-600 text-gray-900 dark:text-gray-100 font-bold text-sm rounded-lg
                         hover:bg-gray-900 dark:hover:bg-gray-100 hover:text-white dark:hover:text-gray-900 transition-colors"
            >
              Plan something else
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
