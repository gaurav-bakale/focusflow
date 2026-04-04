import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// ── Extract readable error from any API error shape ───────────────────────────
function extractError(err) {
  const detail = err?.response?.data?.detail
  if (!detail) return 'Registration failed. Please try again.'
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
  @keyframes orbit {
    from{ transform:rotate(0deg) translateX(44px) rotate(0deg); }
    to  { transform:rotate(360deg) translateX(44px) rotate(-360deg); }
  }
  @keyframes orbit-rev {
    from{ transform:rotate(0deg) translateX(30px) rotate(0deg); }
    to  { transform:rotate(-360deg) translateX(30px) rotate(360deg); }
  }
  @keyframes progress-fill {
    0%  { width:0%; }
    60% { width:100%; }
    100%{ width:100%; }
  }
  @keyframes pulse-dot {
    0%,100%{ transform:scale(1); opacity:1; }
    50%    { transform:scale(1.4); opacity:.7; }
  }
  @keyframes block-slide {
    from{ opacity:0; transform:translateX(12px); }
    to  { opacity:1; transform:translateX(0); }
  }
  @keyframes blob {
    0%,100%{ border-radius:60% 40% 70% 30%/50% 60% 40% 50%; transform:translate(0,0) scale(1); }
    33%     { border-radius:40% 60% 30% 70%/60% 40% 60% 40%; transform:translate(10px,-16px) scale(1.04); }
    66%     { border-radius:70% 30% 50% 50%/30% 70% 30% 70%; transform:translate(-6px,12px) scale(0.97); }
  }
  .anim-blob-1 { animation:blob 10s ease-in-out infinite; }
  .anim-blob-2 { animation:blob 14s ease-in-out infinite reverse; }
  .anim-card   { animation:fade-up .55s cubic-bezier(.22,1,.36,1) forwards; }
  .stagger-1   { animation:fade-up .5s  .05s cubic-bezier(.22,1,.36,1) both; }
  .stagger-2   { animation:fade-up .5s  .10s cubic-bezier(.22,1,.36,1) both; }
  .stagger-3   { animation:fade-up .5s  .15s cubic-bezier(.22,1,.36,1) both; }
  .stagger-4   { animation:fade-up .5s  .20s cubic-bezier(.22,1,.36,1) both; }
  .stagger-5   { animation:fade-up .5s  .25s cubic-bezier(.22,1,.36,1) both; }
  .stagger-6   { animation:fade-up .5s  .30s cubic-bezier(.22,1,.36,1) both; }
  .float-icon  { animation:float-up 4.5s ease-in-out infinite; }
  .orbit-dot-1 { animation:orbit 4s linear infinite; }
  .orbit-dot-2 { animation:orbit 6s linear infinite reverse; }
  .orbit-dot-3 { animation:orbit-rev 5s linear infinite; }
  .progress-bar-1{ animation:progress-fill 3s 0.2s ease-in-out infinite; }
  .progress-bar-2{ animation:progress-fill 3s 1.1s ease-in-out infinite; }
  .progress-bar-3{ animation:progress-fill 3s 2.0s ease-in-out infinite; }
  .live-dot    { animation:pulse-dot 1.8s ease-in-out infinite; }
  .block-slide-1{ animation:block-slide .5s .1s both; }
  .block-slide-2{ animation:block-slide .5s .3s both; }
  .block-slide-3{ animation:block-slide .5s .5s both; }
  .block-slide-4{ animation:block-slide .5s .7s both; }
  .strength-bar{ transition:width .4s cubic-bezier(.22,1,.36,1),background-color .3s; }
  .pc-input    { transition:border-color .2s,box-shadow .2s; }
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
  .pc-btn:disabled{ opacity:.6; cursor:not-allowed; transform:none; box-shadow:none; }
`

// ── Password strength ─────────────────────────────────────────────────────────
const PW_RULES = [
  { label:'At least 8 characters',       test: v => v.length >= 8 },
  { label:'One uppercase letter (A–Z)',   test: v => /[A-Z]/.test(v) },
  { label:'One number (0–9)',             test: v => /[0-9]/.test(v) },
  { label:'One special character (!@#…)', test: v => /[^A-Za-z0-9]/.test(v) },
]

function PasswordStrength({ password }) {
  const results = PW_RULES.map(r => ({ ...r, ok: r.test(password) }))
  const score   = results.filter(r => r.ok).length
  const cfg = [null,
    { label:'Weak',   color:'#ef4444' },
    { label:'Fair',   color:'#f59e0b' },
    { label:'Good',   color:'#3a6758' },
    { label:'Strong', color:'#10b981' },
  ][score]
  if (!password) return null
  return (
    <div className="mt-2.5 space-y-2">
      <div className="flex gap-1.5">
        {[1,2,3,4].map(i => (
          <div key={i} className="h-1 flex-1 rounded-full overflow-hidden" style={{ background:'#dee4da' }}>
            <div className="h-full rounded-full strength-bar"
              style={{ width: i <= score ? '100%' : '0%', background: cfg?.color || 'transparent' }}/>
          </div>
        ))}
      </div>
      {cfg && <p className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label} password</p>}
      <ul className="space-y-1 pt-0.5">
        {results.map(r => (
          <li key={r.label} className="flex items-center gap-1.5 text-xs"
            style={{ color: r.ok ? '#3a6758' : '#aeb4aa' }}>
            <span>{r.ok ? '✓' : '○'}</span>
            <span>{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Left decoration: orbiting elements ───────────────────────────────────────
function OrbitSide() {
  return (
    <div className="hidden xl:flex flex-col items-center gap-8 w-56 select-none">
      <div className="relative w-40 h-40 flex items-center justify-center">
        <div className="absolute w-12 h-12 rounded-2xl flex items-center justify-center z-10"
          style={{ background:'#3a6758' }}>
          <span className="text-2xl">⚡</span>
        </div>
        <div className="absolute w-32 h-32 rounded-full" style={{ border:'1.5px dashed rgba(58,103,88,0.2)' }}/>
        <div className="absolute w-24 h-24 rounded-full" style={{ border:'1.5px dashed rgba(58,103,88,0.12)' }}/>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="orbit-dot-1 flex items-center justify-center w-8 h-8">
            <span className="text-lg">🎯</span>
          </div>
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="orbit-dot-2 flex items-center justify-center w-8 h-8">
            <span className="text-lg">⚡</span>
          </div>
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="orbit-dot-3 flex items-center justify-center w-8 h-8">
            <span className="text-lg">✅</span>
          </div>
        </div>
      </div>

      <div className="relative h-20 w-full overflow-hidden">
        {['📅','🧠','🔥','✨'].map((icon, i) => (
          <span key={i} className="float-icon absolute text-xl"
            style={{ left:`${[10,40,65,85][i]}%`, bottom:0, animationDelay:`${i*1.1}s`, animationDuration:'4.5s' }}>
            {icon}
          </span>
        ))}
      </div>

      <div className="text-center">
        <p className="text-sm font-semibold" style={{ color:'#3a6758' }}>Everything in orbit</p>
        <p className="text-xs mt-1" style={{ color:'#aeb4aa' }}>Tasks · Focus · Calendar · AI</p>
      </div>
    </div>
  )
}

// ── Right decoration: daily schedule ─────────────────────────────────────────
function ScheduleSide() {
  const blocks = [
    { time:'9:00',  label:'Deep Work',     color:'#3a6758', bar:'progress-bar-1' },
    { time:'10:30', label:'Review Tasks',  color:'#10b981', bar:'progress-bar-2' },
    { time:'11:00', label:'Team Sync',     color:'#f59e0b', bar:'progress-bar-3' },
    { time:'2:00',  label:'Focus Session', color:'#6aab98', bar:'progress-bar-1' },
  ]
  return (
    <div className="hidden xl:flex flex-col items-start gap-3 w-56 select-none">
      <div className="w-full flex items-center justify-between mb-1">
        <div>
          <p className="text-sm font-semibold" style={{ color:'#3a6758' }}>Today&apos;s plan</p>
          <p className="text-xs mt-0.5" style={{ color:'#aeb4aa' }}>Your schedule, visualised</p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="live-dot w-1.5 h-1.5 rounded-full" style={{ background:'#10b981' }}/>
          <span className="text-[10px] font-semibold" style={{ color:'#10b981' }}>Live</span>
        </div>
      </div>

      {blocks.map((b, i) => (
        <div key={i} className={`block-slide-${i+1} w-full px-3 py-3 rounded-2xl`}
          style={{ background:'#ffffff', border:'1px solid #dee4da', boxShadow:'0 2px 8px rgba(46,52,45,0.05)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold" style={{ color:'#2e342d' }}>{b.label}</span>
            <span className="text-[10px] font-mono" style={{ color:'#aeb4aa' }}>{b.time}</span>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background:'#ecefe7' }}>
            <div className={`${b.bar} h-full rounded-full`}
              style={{ background:`linear-gradient(90deg, ${b.color}80, ${b.color})` }}/>
          </div>
        </div>
      ))}

      <div className="w-full px-3 py-2.5 rounded-2xl flex items-center gap-2 mt-1"
        style={{ background:'#ecefe7', border:'1px solid #dee4da' }}>
        <span className="text-base">🍅</span>
        <div className="flex gap-1">
          {[1,2,3,4].map(i => (
            <div key={i} className="w-3 h-3 rounded-full"
              style={{ background: i <= 2 ? '#3a6758' : '#dee4da' }}/>
          ))}
        </div>
        <span className="text-[10px] font-semibold ml-auto" style={{ color:'#767c74' }}>2 / 4 done</span>
      </div>
    </div>
  )
}

const STEPS = [
  { n:'1', title:'Create account'  },
  { n:'2', title:'Set preferences' },
  { n:'3', title:'Start deep work' },
]

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate     = useNavigate()
  const [form, setForm]       = useState({ name:'', email:'', password:'', confirm:'' })
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw]   = useState(false)
  const [showCfm, setShowCfm] = useState(false)

  const pwScore = PW_RULES.filter(r => r.test(form.password)).length

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (pwScore < 4) { setError('Password does not meet all requirements.'); return }
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      await register(form.name, form.email, form.password)
      navigate('/onboarding')
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
          style={{ background:'radial-gradient(circle,rgba(58,103,88,0.07),transparent)', top:'-10%', right:'-5%', filter:'blur(60px)' }}/>
        <div className="anim-blob-2 absolute w-80 h-80"
          style={{ background:'radial-gradient(circle,rgba(106,171,152,0.06),transparent)', bottom:'-10%', left:'-8%', filter:'blur(60px)' }}/>
      </div>

      {/* Three-column: left deco | card | right deco */}
      <div className="relative flex items-center justify-center gap-12 w-full max-w-5xl mx-auto">
        <OrbitSide />

        {/* Card */}
        <div className="anim-card w-full max-w-md shrink-0"
          style={{ background:'#ffffff', borderRadius:'28px', boxShadow:'0 8px 40px rgba(46,52,45,0.10)', border:'1px solid #dee4da' }}>
          <div className="px-8 py-10">

            {/* Logo */}
            <div className="stagger-1 flex flex-col items-center mb-6">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                style={{ background:'#3a6758' }}>
                <span className="text-2xl">⚡</span>
              </div>
              <span className="text-xl font-black tracking-tight" style={{ fontFamily:'Epilogue, sans-serif', color:'#2e342d' }}>FocusFlow</span>
              <span className="text-xs mt-1" style={{ color:'#aeb4aa' }}>Your deep work application</span>
            </div>

            {/* Steps */}
            <div className="stagger-2 flex items-center justify-center gap-2 mb-7">
              {STEPS.map(({ n, title }, i) => (
                <React.Fragment key={n}>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background:'#ecefe7', color:'#3a6758', border:'1.5px solid #dee4da' }}>
                      {n}
                    </div>
                    <span className="text-[10px] font-medium text-center hidden sm:block"
                      style={{ color:'#aeb4aa' }}>{title}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="flex-1 h-px max-w-[36px] mb-4" style={{ background:'#dee4da' }}/>
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Heading */}
            <div className="stagger-3 text-center mb-7">
              <h1 className="text-2xl font-black mb-1" style={{ fontFamily:'Epilogue, sans-serif', color:'#2e342d' }}>Create your account</h1>
              <p className="text-sm" style={{ color:'#767c74' }}>Join and start doing your best work</p>
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
                <label htmlFor="name" className="block text-xs font-semibold mb-1.5" style={{ color:'#5b6159' }}>
                  Full name
                </label>
                <input id="name" type="text" required autoComplete="name" placeholder="Jane Smith"
                  className="pc-input w-full px-4 py-3 rounded-xl text-sm"
                  style={{ background:'#f3f4ee', border:'1.5px solid #dee4da', color:'#2e342d' }}
                  value={form.name} onChange={set('name')}/>
              </div>

              <div className="stagger-4">
                <label htmlFor="email" className="block text-xs font-semibold mb-1.5" style={{ color:'#5b6159' }}>
                  Email address
                </label>
                <input id="email" type="email" required autoComplete="email" placeholder="you@example.com"
                  className="pc-input w-full px-4 py-3 rounded-xl text-sm"
                  style={{ background:'#f3f4ee', border:'1.5px solid #dee4da', color:'#2e342d' }}
                  value={form.email} onChange={set('email')}/>
              </div>

              <div className="stagger-5">
                <label htmlFor="password" className="block text-xs font-semibold mb-1.5" style={{ color:'#5b6159' }}>
                  Password
                </label>
                <div className="relative">
                  <input id="password" type={showPw ? 'text' : 'password'} required autoComplete="new-password"
                    placeholder="Min. 8 characters"
                    className="pc-input w-full px-4 py-3 pr-16 rounded-xl text-sm"
                    style={{ background:'#f3f4ee', border:'1.5px solid #dee4da', color:'#2e342d' }}
                    value={form.password} onChange={set('password')}/>
                  <button type="button" onClick={() => setShowPw(p => !p)} tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold px-2 py-1 rounded-lg"
                    style={{ color:'#767c74' }}>
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </div>
                <PasswordStrength password={form.password}/>
              </div>

              <div className="stagger-5">
                <label htmlFor="confirm" className="block text-xs font-semibold mb-1.5" style={{ color:'#5b6159' }}>
                  Confirm password
                </label>
                <div className="relative">
                  <input id="confirm" type={showCfm ? 'text' : 'password'} required autoComplete="new-password"
                    placeholder="Re-enter your password"
                    className="pc-input w-full px-4 py-3 pr-16 rounded-xl text-sm"
                    style={{
                      background:'#f3f4ee',
                      border: form.confirm
                        ? form.confirm === form.password
                          ? '1.5px solid rgba(52,211,153,0.5)'
                          : '1.5px solid rgba(239,68,68,0.5)'
                        : '1.5px solid #dee4da',
                      color:'#2e342d'
                    }}
                    value={form.confirm} onChange={set('confirm')}/>
                  <button type="button" onClick={() => setShowCfm(p => !p)} tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold px-2 py-1 rounded-lg"
                    style={{ color:'#767c74' }}>
                    {showCfm ? 'Hide' : 'Show'}
                  </button>
                </div>
                {form.confirm && form.confirm !== form.password && (
                  <p className="mt-1.5 text-xs" style={{ color:'#ef4444' }}>Passwords do not match</p>
                )}
              </div>

              <div className="stagger-6 pt-1">
                <button type="submit" disabled={loading || pwScore < 4 || form.password !== form.confirm}
                  className="pc-btn w-full text-white font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2">
                  {loading
                    ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Creating account…</>
                    : "Create Account — It's Free →"}
                </button>
              </div>
            </form>

            <p className="mt-3 text-center text-xs" style={{ color:'#aeb4aa' }}>
              By signing up you agree to our terms of service.
            </p>

            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px" style={{ background:'#dee4da' }}/>
              <span className="text-xs" style={{ color:'#aeb4aa' }}>or</span>
              <div className="flex-1 h-px" style={{ background:'#dee4da' }}/>
            </div>

            <p className="text-center text-sm" style={{ color:'#767c74' }}>
              Already have an account?{' '}
              <Link to="/login" className="font-semibold" style={{ color:'#3a6758' }}>
                Sign in →
              </Link>
            </p>
          </div>
        </div>

        <ScheduleSide />
      </div>
    </div>
  )
}
