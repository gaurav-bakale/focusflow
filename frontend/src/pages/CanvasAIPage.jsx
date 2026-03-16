/**
 * CanvasAIPage - AI Brainstorming Pad
 *
 * Chat-style interface for free-form AI prompts.
 * Also provides quick-action buttons for task breakdown and prioritization.
 * Gracefully shows an error if the AI service is unavailable.
 */

import React, { useState, useRef, useEffect } from 'react'
import api from '../services/api'

function Message({ role, text }) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-sm px-4 py-2.5 rounded-2xl text-sm leading-relaxed
        ${isUser
          ? 'bg-indigo-600 text-white rounded-br-sm'
          : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
        {text}
      </div>
    </div>
  )
}

export default function CanvasAIPage() {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hi! I'm your AI assistant. Ask me to break down a task, prioritize your list, or suggest a plan. What's on your mind?" }
  ])
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(promptText) {
    const text = (promptText || input).trim()
    if (!text) return

    setMessages(prev => [...prev, { role: 'user', text }])
    setInput('')
    setLoading(true)

    try {
      // Use the OpenAI adapter via the AI breakdown endpoint with a freeform task title
      const res = await api.post('/ai/breakdown', {
        task_id: 'canvas',
        task_title: text,
        task_description: '',
      })
      const subtasks = res.data.subtasks
      const reply = subtasks.length > 0
        ? `Here's a plan:\n${subtasks.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
        : 'I couldn\'t generate a breakdown. Try rephrasing your request.'
      setMessages(prev => [...prev, { role: 'assistant', text: reply }])
    } catch (err) {
      const detail = err.response?.data?.detail || 'AI service is currently unavailable. Core features still work!'
      setMessages(prev => [...prev, { role: 'assistant', text: detail }])
    } finally {
      setLoading(false)
    }
  }

  const quickActions = [
    { label: '🔀 Break down a task',       prompt: 'Break down the task: write a project report' },
    { label: '📊 Prioritize my tasks',     prompt: 'Help me prioritize: homework, grocery shopping, gym, project deadline' },
    { label: '📅 Plan my day',             prompt: 'Suggest a focused work schedule for today with deep work blocks' },
  ]

  return (
    <div className="p-8 max-w-2xl mx-auto flex flex-col h-full">
      <h1 className="text-xl font-bold text-gray-800 mb-2">✨ Canvas AI</h1>
      <p className="text-sm text-gray-400 mb-6">Your AI brainstorming and planning assistant</p>

      {/* Quick actions */}
      <div className="flex gap-2 flex-wrap mb-6">
        {quickActions.map(({ label, prompt }) => (
          <button
            key={label}
            onClick={() => sendMessage(prompt)}
            disabled={loading}
            className="text-xs border border-indigo-200 text-indigo-600 px-3 py-1.5 rounded-full hover:bg-indigo-50 transition-colors disabled:opacity-40"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Chat window */}
      <div className="flex-1 bg-white rounded-xl shadow-sm p-5 overflow-y-auto mb-4 min-h-64 max-h-96">
        {messages.map((m, i) => <Message key={i} role={m.role} text={m.text} />)}
        {loading && (
          <div className="flex justify-start mb-3">
            <div className="bg-gray-100 px-4 py-2.5 rounded-2xl rounded-bl-sm">
              <span className="text-gray-400 text-sm animate-pulse">AI is thinking…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Scribble a prompt here…"
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          disabled={loading}
        />
        <button
          onClick={() => sendMessage()}
          disabled={loading || !input.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm disabled:opacity-40 transition-colors"
        >
          Send →
        </button>
      </div>
    </div>
  )
}
