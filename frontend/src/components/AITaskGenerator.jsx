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
    <div className="sketch-hover border-2 border-gray-900 dark:border-gray-600 rounded-lg relative overflow-hidden">
      <SketchLine color="#A78BFA" thickness={4} />

      <div className="px-6 py-5 border-b-2 border-gray-900 dark:border-gray-600">
        <h2 className="text-lg font-extrabold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          AI Task Planner
        </h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Describe your goal — AI will break it into 5 tasks</p>
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

        {/* Step: Idle */}
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

        {/* Step: Review */}
        {step === 'review' && (
          <div>
            {/* Summary */}
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">{summary}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Here are 5 tasks for your goal — are you happy with these?</p>

            {/* Task list */}
            <div className="space-y-2 mb-5">
              {tasks.map((task, i) => (
                <div key={i} className="border-2 border-gray-200 dark:border-gray-700 rounded-lg p-3 flex items-start gap-3">
                  <span className="text-xs font-mono font-bold text-gray-300 dark:text-gray-600 mt-0.5 w-4 shrink-0">{i + 1}</span>
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
                  className="px-5 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-bold text-sm rounded-lg border-2 border-gray-900 dark:border-gray-600
                             hover:bg-gray-800 disabled:opacity-60 transition-colors"
                >
                  {creating ? 'Adding...' : 'Add to Board'}
                </button>
                <button
                  onClick={() => setShowFeedback(true)}
                  className="px-4 py-2.5 border-2 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 font-bold text-sm rounded-lg
                             hover:border-gray-900 dark:hover:border-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                >
                  Suggest Changes
                </button>
                <button
                  onClick={handleDiscard}
                  className="px-4 py-2.5 border-2 border-red-200 dark:border-red-800 text-red-500 dark:text-red-400 font-bold text-sm rounded-lg
                             hover:border-red-500 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                >
                  Discard
                </button>
              </div>
            )}

            {/* Feedback form */}
            {showFeedback && (
              <form onSubmit={handleRefine} className="mt-1">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">What would you like to change?</p>
                <textarea
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  placeholder="e.g., make task 3 more specific, add a testing task, simplify the steps..."
                  rows={3}
                  className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:border-gray-900 dark:focus:border-gray-400 focus:ring-0 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    type="submit"
                    disabled={!feedback.trim() || refining}
                    className="px-5 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-bold text-sm rounded-lg border-2 border-gray-900 dark:border-gray-600
                               hover:bg-gray-800 disabled:opacity-40 transition-colors"
                  >
                    {refining ? 'Revising...' : 'Revise Tasks'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowFeedback(false); setFeedback('') }}
                    className="px-4 py-2 border-2 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 font-bold text-sm rounded-lg
                               hover:border-gray-900 dark:hover:border-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
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
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">
              5 tasks added to your board!
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Head to the Board to start working on them.</p>
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
