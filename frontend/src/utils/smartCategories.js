/**
 * Smart Category Suggester — pure browser JS, no external dependencies.
 *
 * Uses a mini-stemmer + weighted taxonomy to suggest categories from a task title.
 * Handles conjugations (fixing→fix), plurals (bugs→bug), common prefixes/suffixes.
 */

// ── Mini stemmer ──────────────────────────────────────────────────────────────
// Normalises a word to its approximate root form so "fixing"→"fix", "tests"→"test"
function stem(word) {
  const w = word.toLowerCase()
  // Strip common verb suffixes
  if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3)
  if (w.endsWith('tion') && w.length > 6) return w.slice(0, -4)
  if (w.endsWith('tions') && w.length > 7) return w.slice(0, -5)
  if (w.endsWith('ed') && w.length > 4)  return w.slice(0, -2)
  if (w.endsWith('er') && w.length > 4)  return w.slice(0, -2)
  if (w.endsWith('es') && w.length > 4)  return w.slice(0, -2)
  if (w.endsWith('s')  && w.length > 3)  return w.slice(0, -1)
  if (w.endsWith('ly') && w.length > 4)  return w.slice(0, -2)
  return w
}

// ── Taxonomy ──────────────────────────────────────────────────────────────────
// verbs  → match stemmed tokens, weight 3
// nouns  → match stemmed tokens, weight 2
// phrases → substring match on full title, weight 4
const TAXONOMY = [
  {
    label: 'Bug',
    verbs:   ['fix', 'debug', 'patch', 'resolv', 'repair', 'hotfix', 'revert', 'investigat'],
    nouns:   ['bug', 'error', 'crash', 'issu', 'defect', 'regress', 'incident', 'glitch', 'except', 'stacktrac', 'fail'],
    phrases: ['bug fix', 'null pointer', 'stack overflow', 'race condition', 'memory leak', 'fix bug', 'broken'],
  },
  {
    label: 'Frontend',
    verbs:   ['render', 'style', 'animat', 'layout', 'align', 'design', 'build ui', 'creat page'],
    nouns:   ['ui', 'ux', 'component', 'button', 'form', 'page', 'modal', 'css', 'html', 'react', 'view', 'screen', 'widget', 'icon', 'banner', 'sidebar', 'navbar', 'dropdown', 'theme', 'wizard', 'input', 'card', 'panel'],
    phrases: ['user interface', 'dark mode', 'light mode', 'landing page', 'onboard', 'login page', 'sign up', 'register page', 'skip bug', 'blank page'],
  },
  {
    label: 'Backend',
    verbs:   ['migrat', 'seed', 'index', 'cach', 'queu', 'refactor'],
    nouns:   ['api', 'endpoint', 'rout', 'server', 'databas', 'schema', 'model', 'query', 'sql', 'nosql', 'mongo', 'postgr', 'redis', 'rest', 'graphql', 'webhook', 'cron', 'job', 'worker', 'servic', 'middlewar', 'handler', 'microservic'],
    phrases: ['rest api', 'data model', 'database migration', 'background job', 'api endpoint'],
  },
  {
    label: 'Auth',
    verbs:   ['authent', 'authoriz', 'login', 'logout', 'signup', 'regist'],
    nouns:   ['auth', 'token', 'jwt', 'oauth', 'session', 'password', 'credenti', 'permiss', 'role', 'access', 'sso', '2fa', 'mfa', 'signin'],
    phrases: ['sign in', 'sign up', 'forgot password', 'reset password', 'access control', 'authentication', 'authorization'],
  },
  {
    label: 'Testing',
    verbs:   ['test', 'mock', 'assert', 'validat', 'verif', 'cover'],
    nouns:   ['test', 'spec', 'coverag', 'qa', 'e2e', 'unit', 'integrat', 'fixtur', 'stub', 'snapshot', 'suit'],
    phrases: ['unit test', 'integration test', 'end to end', 'test coverage', 'write test', 'add test'],
  },
  {
    label: 'DevOps',
    verbs:   ['deploy', 'contain', 'provis', 'monitor', 'scale', 'automat'],
    nouns:   ['deploy', 'docker', 'kubernet', 'ci', 'cd', 'pipelin', 'build', 'infra', 'terraform', 'helm', 'nginx', 'alert', 'metric', 'cloud', 'aws', 'gcp'],
    phrases: ['ci/cd', 'github actions', 'cloud deploy', 'build pipeline', 'production deploy', 'container'],
  },
  {
    label: 'Planning',
    verbs:   ['plan', 'review', 'discuss', 'estimat', 'prioritiz', 'schedul', 'strateg'],
    nouns:   ['meet', 'standup', 'sprint', 'retrospect', 'groom', 'backlog', 'roadmap', 'mileston', 'kickoff', 'agenda', 'okr', 'goal'],
    phrases: ['sprint planning', 'product review', 'team meeting', 'tech review', 'design review', 'code review', 'review q', 'quarterly'],
  },
  {
    label: 'Product',
    verbs:   ['launch', 'releas', 'ship', 'deliver', 'announc'],
    nouns:   ['featur', 'product', 'releas', 'launch', 'prd', 'spec', 'requir', 'changelog', 'version', 'mvp', 'prototyp', 'feedback'],
    phrases: ['feature request', 'product spec', 'new feature', 'product launch', 'user story', 'product roadmap'],
  },
  {
    label: 'Docs',
    verbs:   ['document', 'write', 'draft', 'updat'],
    nouns:   ['doc', 'readme', 'wiki', 'guid', 'tutori', 'manual', 'comment', 'annot'],
    phrases: ['write docs', 'update readme', 'api docs', 'add comments', 'documentation'],
  },
  {
    label: 'Performance',
    verbs:   ['optimiz', 'profil', 'benchmark', 'improv', 'reduc', 'speed'],
    nouns:   ['perform', 'latenc', 'throughput', 'bottleneck', 'memori', 'cpu', 'load', 'cach', 'profil', 'lighthous'],
    phrases: ['slow query', 'load time', 'response time', 'bundle size', 'memory usage', 'optimize', 'speed up'],
  },
  {
    label: 'Security',
    verbs:   ['encrypt', 'sanit', 'audit', 'harden', 'scan'],
    nouns:   ['secur', 'vulner', 'cve', 'xss', 'csrf', 'inject', 'ssl', 'tls', 'certif', 'firewall', 'pentest'],
    phrases: ['security audit', 'sql injection', 'input validation', 'rate limit', 'penetration'],
  },
  {
    label: 'Research',
    verbs:   ['research', 'investig', 'explor', 'analys', 'analyz', 'evaluat', 'compar'],
    nouns:   ['research', 'analysi', 'investigat', 'poc', 'spike', 'explorat'],
    phrases: ['proof of concept', 'tech spike', 'feasibility', 'competitive analysis', 'investigate'],
  },
  {
    label: 'Learning',
    verbs:   ['learn', 'studi', 'read', 'watch', 'practic', 'complet', 'study'],
    nouns:   ['cours', 'book', 'tutori', 'train', 'certif', 'workshop', 'lesson', 'lectur'],
    phrases: ['online course', 'read book', 'watch video', 'finish course', 'study', 'studying'],
  },
  {
    label: 'Health',
    verbs:   ['run', 'workout', 'exercis', 'meditat', 'walk', 'cycl', 'swim'],
    nouns:   ['gym', 'workout', 'yoga', 'medit', 'health', 'fit', 'diet', 'sleep', 'nutrit', 'run'],
    phrases: ['morning run', 'evening walk', 'hit the gym', 'work out', 'go for a run'],
  },
  {
    label: 'Errands',
    verbs:   ['buy', 'purchas', 'order', 'pick', 'drop', 'pay', 'book'],
    nouns:   ['shop', 'groceri', 'errand', 'bill', 'appoint', 'deliveri'],
    phrases: ['pick up', 'drop off', 'pay bill', 'buy groceries', 'go shopping'],
  },
]

// ── Core suggest function ──────────────────────────────────────────────────────

/**
 * Suggest categories for a task title.
 *
 * @param {string}   title   - Raw task title typed by the user
 * @param {string[]} already - Already assigned categories (excluded from results)
 * @param {number}   limit   - Max suggestions (default 4)
 * @returns {string[]}
 */
export function suggestCategories(title, already = [], limit = 4) {
  if (!title || title.trim().length < 3) return []

  const lower   = title.toLowerCase()
  // Tokenise and stem every word in the title
  const tokens  = lower.split(/[\s\-_/]+/).filter(t => t.length > 1)
  const stemmed = new Set(tokens.map(stem))
  // Also keep raw tokens for short words that stemming might mangle
  tokens.forEach(t => stemmed.add(t))

  const alreadySet = new Set(already.map(a => a.toLowerCase()))
  const scores = []

  for (const { label, verbs, nouns, phrases } of TAXONOMY) {
    if (alreadySet.has(label.toLowerCase())) continue

    let score = 0

    for (const v of verbs)   { if (stemmed.has(v) || stemmed.has(stem(v))) score += 3 }
    for (const n of nouns)   { if (stemmed.has(n) || stemmed.has(stem(n))) score += 2 }
    for (const p of phrases) { if (lower.includes(p)) score += 4 }

    if (score > 0) scores.push({ label, score })
  }

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.label)
}
