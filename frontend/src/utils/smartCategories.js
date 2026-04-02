/**
 * Smart Category Suggester — uses compromise.js for NLP.
 *
 * compromise extracts nouns/verbs from the title automatically,
 * handling plurals, conjugations, tenses — no manual stemming needed.
 * The category map stays small; the library does the linguistic heavy lifting.
 */
import nlp from 'compromise'

// ── Category map ──────────────────────────────────────────────────────────────
// nouns / verbs: matched against words compromise extracts (base forms)
// phrases: substring match on the raw lowercased title (for fixed expressions)
const CATEGORIES = [
  {
    label: 'Bug',
    nouns:   ['bug', 'error', 'crash', 'issue', 'defect', 'regression', 'incident', 'glitch', 'exception', 'failure', 'stacktrace'],
    verbs:   ['fix', 'debug', 'patch', 'resolve', 'repair', 'revert', 'investigate'],
    phrases: ['null pointer', 'stack overflow', 'race condition', 'memory leak', 'broken', 'bug fix'],
  },
  {
    label: 'Frontend',
    nouns:   ['ui', 'ux', 'component', 'button', 'form', 'page', 'modal', 'css', 'html', 'view', 'screen', 'icon', 'navbar', 'sidebar', 'dropdown', 'theme', 'input', 'card', 'panel', 'animation', 'layout'],
    verbs:   ['render', 'style', 'animate', 'align', 'design'],
    phrases: ['user interface', 'dark mode', 'light mode', 'landing page', 'login page', 'sign up page', 'blank page'],
  },
  {
    label: 'Backend',
    nouns:   ['api', 'endpoint', 'route', 'server', 'database', 'schema', 'model', 'query', 'sql', 'mongo', 'redis', 'webhook', 'cron', 'worker', 'service', 'middleware', 'microservice', 'graphql'],
    verbs:   ['migrate', 'seed', 'index', 'cache', 'queue', 'refactor'],
    phrases: ['rest api', 'data model', 'database migration', 'background job', 'api endpoint'],
  },
  {
    label: 'Auth',
    nouns:   ['auth', 'token', 'jwt', 'oauth', 'session', 'password', 'credential', 'permission', 'role', 'access', 'sso', '2fa', 'mfa'],
    verbs:   ['authenticate', 'authorize', 'login', 'logout', 'signup', 'register'],
    phrases: ['sign in', 'sign up', 'forgot password', 'reset password', 'access control'],
  },
  {
    label: 'Testing',
    nouns:   ['test', 'spec', 'coverage', 'qa', 'e2e', 'unit', 'integration', 'fixture', 'stub', 'snapshot', 'suite', 'mock'],
    verbs:   ['test', 'mock', 'assert', 'validate', 'verify', 'cover'],
    phrases: ['unit test', 'integration test', 'end to end', 'test coverage', 'write test'],
  },
  {
    label: 'DevOps',
    nouns:   ['deploy', 'docker', 'kubernetes', 'pipeline', 'build', 'infra', 'terraform', 'nginx', 'alert', 'metric', 'cloud', 'aws', 'gcp', 'ci', 'cd'],
    verbs:   ['deploy', 'containerize', 'provision', 'monitor', 'scale', 'automate'],
    phrases: ['ci/cd', 'github actions', 'build pipeline', 'production deploy', 'cloud deploy'],
  },
  {
    label: 'Planning',
    nouns:   ['meeting', 'standup', 'sprint', 'retrospective', 'grooming', 'backlog', 'roadmap', 'milestone', 'kickoff', 'agenda', 'okr', 'goal'],
    verbs:   ['plan', 'review', 'discuss', 'estimate', 'prioritize', 'schedule', 'strategize'],
    phrases: ['sprint planning', 'product review', 'team meeting', 'code review', 'design review'],
  },
  {
    label: 'Product',
    nouns:   ['feature', 'product', 'release', 'launch', 'spec', 'requirement', 'changelog', 'version', 'mvp', 'prototype', 'feedback', 'prd'],
    verbs:   ['launch', 'release', 'ship', 'deliver', 'announce'],
    phrases: ['feature request', 'product spec', 'new feature', 'product launch', 'user story'],
  },
  {
    label: 'Docs',
    nouns:   ['doc', 'readme', 'wiki', 'guide', 'tutorial', 'manual', 'comment', 'annotation'],
    verbs:   ['document', 'write', 'draft', 'update'],
    phrases: ['write docs', 'update readme', 'api docs', 'add comments', 'documentation'],
  },
  {
    label: 'Performance',
    nouns:   ['performance', 'latency', 'throughput', 'bottleneck', 'memory', 'cpu', 'load', 'cache', 'lighthouse'],
    verbs:   ['optimize', 'profile', 'benchmark', 'improve', 'reduce', 'speed'],
    phrases: ['slow query', 'load time', 'response time', 'bundle size', 'memory usage', 'speed up'],
  },
  {
    label: 'Security',
    nouns:   ['security', 'vulnerability', 'cve', 'xss', 'csrf', 'injection', 'ssl', 'tls', 'certificate', 'firewall', 'pentest'],
    verbs:   ['encrypt', 'sanitize', 'audit', 'harden', 'scan'],
    phrases: ['security audit', 'sql injection', 'input validation', 'rate limit', 'penetration'],
  },
  {
    label: 'Research',
    nouns:   ['research', 'analysis', 'investigation', 'poc', 'spike', 'exploration'],
    verbs:   ['research', 'investigate', 'explore', 'analyse', 'analyze', 'evaluate', 'compare'],
    phrases: ['proof of concept', 'tech spike', 'feasibility', 'competitive analysis'],
  },
  {
    label: 'Learning',
    nouns:   ['course', 'book', 'tutorial', 'training', 'certificate', 'workshop', 'lesson', 'lecture', 'exam', 'quiz', 'class'],
    verbs:   ['learn', 'study', 'read', 'watch', 'practice', 'complete'],
    phrases: ['online course', 'read book', 'watch video', 'finish course', 'studying'],
  },
  {
    label: 'Health',
    nouns:   ['gym', 'workout', 'yoga', 'meditation', 'diet', 'sleep', 'nutrition', 'run', 'meal', 'food', 'breakfast', 'lunch', 'dinner', 'recipe', 'vitamin', 'supplement', 'water'],
    verbs:   ['run', 'workout', 'exercise', 'meditate', 'walk', 'cycle', 'swim', 'cook', 'prep', 'eat'],
    phrases: ['morning run', 'evening walk', 'hit the gym', 'work out', 'meal prep', 'meal plan', 'eat healthy'],
  },
  {
    label: 'Errands',
    nouns:   ['grocery', 'errand', 'bill', 'appointment', 'delivery', 'package', 'mail', 'license', 'passport'],
    verbs:   ['buy', 'purchase', 'order', 'pick', 'drop', 'pay', 'book', 'call', 'renew', 'return'],
    phrases: ['pick up', 'drop off', 'pay bill', 'buy groceries', 'go shopping'],
  },
  {
    label: 'Finance',
    nouns:   ['budget', 'expense', 'income', 'tax', 'invoice', 'payment', 'loan', 'mortgage', 'rent', 'investment', 'stock', 'crypto', 'bank', 'credit', 'debt', 'saving'],
    verbs:   ['budget', 'invest', 'save', 'track', 'transfer', 'withdraw', 'deposit'],
    phrases: ['pay rent', 'file taxes', 'track expenses', 'monthly budget', 'pay off'],
  },
  {
    label: 'Social',
    nouns:   ['friend', 'family', 'birthday', 'anniversary', 'party', 'wedding', 'event', 'dinner', 'trip', 'vacation', 'travel', 'gift'],
    verbs:   ['call', 'visit', 'celebrate', 'invite', 'organize'],
    phrases: ['catch up', 'birthday party', 'family dinner', 'plan trip', 'book flight'],
  },
]

// ── Core suggest function ──────────────────────────────────────────────────────

/**
 * Suggest categories for a task title using NLP.
 *
 * @param {string}   title   - Raw task title
 * @param {string[]} already - Already assigned categories (excluded)
 * @param {number}   limit   - Max suggestions (default 4)
 * @returns {string[]}
 */
export function suggestCategories(title, already = [], limit = 4) {
  if (!title || title.trim().length < 3) return []

  const lower = title.toLowerCase()
  const doc   = nlp(title)

  // Extract nouns and verbs via compromise (base/normal forms)
  const extractedNouns = new Set(doc.nouns().out('array').map(w => w.toLowerCase()))
  const extractedVerbs = new Set(doc.verbs().toInfinitive().out('array').map(w => w.toLowerCase()))

  // Also add individual tokens so short words aren't lost
  lower.split(/[\s\-_/]+/).filter(t => t.length > 1).forEach(t => {
    extractedNouns.add(t)
  })

  const alreadySet = new Set(already.map(a => a.toLowerCase()))
  const scores = []

  for (const { label, nouns, verbs, phrases } of CATEGORIES) {
    if (alreadySet.has(label.toLowerCase())) continue

    let score = 0
    for (const n of nouns)   { if (extractedNouns.has(n))  score += 2 }
    for (const v of verbs)   { if (extractedVerbs.has(v))  score += 3 }
    for (const p of phrases) { if (lower.includes(p))      score += 4 }

    if (score > 0) scores.push({ label, score })
  }

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.label)
}
