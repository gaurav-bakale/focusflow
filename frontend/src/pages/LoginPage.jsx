import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// ── Extract a readable string from any API error shape ────────────────────────
function extractError(err) {
  const detail = err?.response?.data?.detail
  if (!detail) return 'Invalid email or password. Please try again.'
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map(d => d.msg ?? String(d)).join(' · ')
  return String(detail)
}

// ── CSS animations ────────────────────────────────────────────────────────────
const ANIM_CSS = `
  @keyframes fade-up {
    from{ opacity:0; transform:translateY(24px) scale(.98); }
    to  { opacity:1; transform:translateY(0) scale(1); }
  }
  @keyframes float-up {
    0%  { opacity:0; transform:translateY(0) scale(.8); }
    20% { opacity:1; }
    80% { opacity:.8; }
    100%{ opacity:0; transform:translateY(-100px) scale(1.1); }
  }
  @keyframes timer-fill {
    from{ stroke-dashoffset:339.3; }
    to  { stroke-dashoffset:0; }
  }
  @keyframes task-slide {
    from{ opacity:0; transform:translateX(-14px); }
    to  { opacity:1; transform:translateX(0); }
  }
  @keyframes check-draw {
    from{ stroke-dashoffset:30; }
    to  { stroke-dashoffset:0; }
  }
  @keyframes blob {
    0%,100%{ border-radius:60% 40% 70% 30%/50% 60% 40% 50%; transform:translate(0,0) scale(1); }
    33%     { border-radius:40% 60% 30% 70%/60% 40% 60% 40%; transform:translate(10px,-16px) scale(1.04); }
    66%     { border-radius:70% 30% 50% 50%/30% 70% 30% 70%; transform:translate(-6px,12px) scale(0.97); }
  }
  .anim-blob-1{ animation:blob 10s ease-in-out infinite; }
  .anim-blob-2{ animation:blob 14s ease-in-out infinite reverse; }
  .anim-card  { animation:fade-up .55s cubic-bezier(.22,1,.36,1) forwards; }
  .stagger-1  { animation:fade-up .5s  .05s cubic-bezier(.22,1,.36,1) both; }
  .stagger-2  { animation:fade-up .5s  .10s cubic-bezier(.22,1,.36,1) both; }
  .stagger-3  { animation:fade-up .5s  .15s cubic-bezier(.22,1,.36,1) both; }
  .stagger-4  { animation:fade-up .5s  .20s cubic-bezier(.22,1,.36,1) both; }
  .stagger-5  { animation:fade-up .5s  .25s cubic-bezier(.22,1,.36,1) both; }
  .float-icon { animation:float-up 4s ease-in-out infinite; }
  .timer-ring { animation:timer-fill 6s ease-in-out infinite alternate; stroke-dasharray:339.3; }
  .task-item-1{ animation:task-slide .5s .2s both; }
  .task-item-2{ animation:task-slide .5s .7s both; }
  .task-item-3{ animation:task-slide .5s 1.2s both; }
  .task-item-4{ animation:task-slide .5s 1.7s both; }
  .check-path { stroke-dasharray:30; animation:check-draw .4s ease forwards; }
  .pc-input   { transition:border-color .2s,box-shadow .2s; }
  .pc-input:focus{
    border-color:#3a6758 !important;
    box-shadow:0 0 0 3px rgba(58,103,88,.12);
    outline:none;
  }
  .pc-btn{
    background:#3a6758;
    transition:background .2s,transform .15s,box-shadow .15s;
  }
  .pc-btn:hover{
    background:#2e5b4c;
    transform:translateY(-1px);
    box-shadow:0 8px 24px rgba(58,103,88,.35);
  }
  .pc-btn:active{ transform:translateY(0); }
`

// ── Left decoration: Pomodoro timer ───────────────────────────────────────────
function PomodoroSide() {
  return (
    <div className="hidden xl:flex flex-col items-center gap-6 w-56 select-none">
      <div className="relative">
        <svg width="160" height="160" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(58,103,88,0.12)" strokeWidth="8"/>
          <circle cx="60" cy="60" r="54" fill="none" stroke="url(#timerGrad)" strokeWidth="8"
            strokeLinecap="round" className="timer-ring"
            style={{ transform:'rotate(-90deg)', transformOrigin:'center' }}/>
          <defs>
            <linearGradient id="timerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#3a6758"/>
              <stop offset="100%" stopColor="#6aab98"/>
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-mono font-bold" style={{ color:'#2e342d' }}>25:00</span>
          <span className="text-xs mt-0.5" style={{ color:'#767c74' }}>Focus</span>
        </div>
      </div>

      <div className="relative h-24 w-32 overflow-hidden">
        {['🎯','⚡','🧠','🔥'].map((icon, i) => (
          <span key={i} className="float-icon absolute text-2xl"
            style={{ left:`${[15,55,30,70][i]}%`, bottom:0, animationDelay:`${i*1.3}s`, animationDuration:'4s' }}>
            {icon}
          </span>
        ))}
      </div>

      <div className="text-center">
        <p className="text-sm font-semibold" style={{ color:'#3a6758' }}>Deep focus timer</p>
        <p className="text-xs mt-1" style={{ color:'#aeb4aa' }}>25-min Pomodoro cycles</p>
      </div>
    </div>
  )
}

// ── Right decoration: task list ───────────────────────────────────────────────
function TaskListSide() {
  const items = [
    { label:'Design landing page', done:true,  color:'#f87171' },
    { label:'Review pull request',  done:true,  color:'#fbbf24' },
    { label:'Write unit tests',     done:false, color:'#3a6758' },
    { label:'Ship v2 release',      done:false, color:'#34d399' },
  ]
  return (
    <div className="hidden xl:flex flex-col items-start gap-4 w-56 select-none">
      <div className="text-center w-full mb-1">
        <p className="text-sm font-semibold" style={{ color:'#3a6758' }}>Smart task board</p>
        <p className="text-xs mt-1" style={{ color:'#aeb4aa' }}>Track everything in one place</p>
      </div>
      {items.map((item, i) => (
        <div key={i} className={`task-item-${i+1} w-full flex items-center gap-3 px-4 py-3 rounded-2xl`}
          style={{ background:'#ffffff', border:'1px solid #dee4da', boxShadow:'0 2px 8px rgba(46,52,45,0.05)' }}>
          <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
            style={{ background: item.done ? item.color+'22' : 'transparent', border:`2px solid ${item.color}60` }}>
            {item.done && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path className="check-path" d="M2 6l3 3 5-5" stroke={item.color} strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
          <span className="text-xs font-medium flex-1 truncate"
            style={{ color: item.done ? '#aeb4aa' : '#2e342d', textDecoration: item.done ? 'line-through' : 'none' }}>
            {item.label}
          </span>
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }}/>
        </div>
      ))}
    </div>
  )
}

const FEATURES = [
  { icon:'🎯', label:'Deep focus timer' },
  { icon:'✅', label:'Smart task board' },
  { icon:'📅', label:'Visual calendar'  },
  { icon:'✨', label:'AI assistant'     },
]

export default function LoginPage() {
  const { login }   = useAuth()
  const navigate    = useNavigate()
  const [form, setForm]       = useState({ email:'', password:'' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw]   = useState(false)

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(form.email, form.password)
      navigate(user.onboarding_completed === false ? '/onboarding' : '/')
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden px-4 py-10"
      style={{ background:'#fafaf5' }}>
      <style>{ANIM_CSS}</style>

      {/* Soft background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="anim-blob-1 absolute w-96 h-96"
          style={{ background:'radial-gradient(circle,rgba(58,103,88,0.08),transparent)', top:'-10%', left:'-10%', filter:'blur(60px)' }}/>
        <div className="anim-blob-2 absolute w-80 h-80"
          style={{ background:'radial-gradient(circle,rgba(106,171,152,0.07),transparent)', bottom:'-10%', right:'-5%', filter:'blur(60px)' }}/>
      </div>

      {/* Three-column layout */}
      <div className="relative flex items-center justify-center gap-12 w-full max-w-5xl mx-auto">
        <PomodoroSide />

        {/* Card */}
        <div className="anim-card w-full max-w-md shrink-0"
          style={{ background:'#ffffff', borderRadius:'28px', boxShadow:'0 8px 40px rgba(46,52,45,0.10)', border:'1px solid #dee4da' }}>
          <div className="px-8 py-10">

            {/* Logo */}
            <div className="stagger-1 flex flex-col items-center mb-7">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                style={{ background:'#3a6758' }}>
                <span className="text-2xl">⚡</span>
              </div>
              <span className="text-xl font-black tracking-tight" style={{ fontFamily:'Epilogue, sans-serif', color:'#2e342d' }}>FocusFlow</span>
              <span className="text-xs mt-1 tracking-widest uppercase" style={{ color:'#aeb4aa' }}>Your deep work application</span>
            </div>

            {/* Feature pills */}
            <div className="stagger-2 flex flex-wrap justify-center gap-2 mb-7">
              {FEATURES.map(({ icon, label }) => (
                <span key={label} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
                  style={{ background:'#ecefe7', color:'#3a6758', border:'1px solid #dee4da' }}>
                  <span>{icon}</span>{label}
                </span>
              ))}
            </div>

            {/* Heading */}
            <div className="stagger-3 text-center mb-7">
              <h1 className="text-2xl font-black mb-1" style={{ fontFamily:'Epilogue, sans-serif', color:'#2e342d' }}>Welcome back</h1>
              <p className="text-sm" style={{ color:'#767c74' }}>Sign in to continue your focus journey</p>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-5 flex items-start gap-2 text-sm px-4 py-3 rounded-xl"
                style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', color:'#b91c1c' }}>
                <span className="shrink-0 mt-0.5">⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="stagger-3">
                <label htmlFor="email" className="block text-xs font-semibold mb-1.5" style={{ color:'#5b6159' }}>
                  Email address
                </label>
                <input id="email" type="email" required autoComplete="email" placeholder="you@example.com"
                  className="pc-input w-full px-4 py-3 rounded-xl text-sm"
                  style={{ background:'#f3f4ee', border:'1.5px solid #dee4da', color:'#2e342d' }}
                  value={form.email} onChange={set('email')}/>
              </div>

              <div className="stagger-4">
                <label htmlFor="password" className="block text-xs font-semibold mb-1.5" style={{ color:'#5b6159' }}>
                  Password
                </label>
                <div className="relative">
                  <input id="password" type={showPw ? 'text' : 'password'} required autoComplete="current-password"
                    placeholder="••••••••"
                    className="pc-input w-full px-4 py-3 pr-16 rounded-xl text-sm"
                    style={{ background:'#f3f4ee', border:'1.5px solid #dee4da', color:'#2e342d' }}
                    value={form.password} onChange={set('password')}/>
                  <button type="button" onClick={() => setShowPw(p => !p)} tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold px-2 py-1 rounded-lg"
                    style={{ color:'#767c74' }}>
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div className="stagger-5 pt-1">
                <button type="submit" disabled={loading}
                  className="pc-btn w-full text-white font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                  {loading
                    ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Signing in…</>
                    : 'Sign In →'}
                </button>
              </div>
            </form>

            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px" style={{ background:'#dee4da' }}/>
              <span className="text-xs" style={{ color:'#aeb4aa' }}>or</span>
              <div className="flex-1 h-px" style={{ background:'#dee4da' }}/>
            </div>

            <p className="text-center text-sm" style={{ color:'#767c74' }}>
              Don&apos;t have an account?{' '}
              <Link to="/register" className="font-semibold" style={{ color:'#3a6758' }}>
                Sign up free →
              </Link>
            </p>
          </div>
        </div>

        <TaskListSide />
      </div>
    </div>
  )
}
