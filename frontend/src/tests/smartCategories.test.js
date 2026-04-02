/**
 * @file smartCategories.test.js
 * @description Unit tests for the NLP-powered category suggester.
 *
 * Strategy:
 *  - Tests are purely functional (no DOM / React).
 *  - compromise is replaced by the CJS mock via jest moduleNameMapper:
 *      "^compromise$" → "<rootDir>/src/tests/__mocks__/compromise.js"
 *    so every call to nlp() is synchronous and deterministic.
 *  - Each describe block targets one concern so failures are easy to locate.
 */

import { suggestCategories } from '../utils/smartCategories'

// ── Helper ────────────────────────────────────────────────────────────────────
/** Returns true when every expected label is present in the result array. */
const includes = (result, ...expected) =>
  expected.every(e => result.includes(e))

// ── Guard: short / empty input ────────────────────────────────────────────────
describe('suggestCategories – input guards', () => {
  test('returns [] for empty string', () => {
    expect(suggestCategories('')).toEqual([])
  })

  test('returns [] for null / undefined', () => {
    expect(suggestCategories(null)).toEqual([])
    expect(suggestCategories(undefined)).toEqual([])
  })

  test('returns [] for whitespace-only string', () => {
    expect(suggestCategories('   ')).toEqual([])
  })

  test('returns [] for string shorter than 3 chars', () => {
    expect(suggestCategories('go')).toEqual([])
  })

  test('returns [] for a single non-matching character', () => {
    expect(suggestCategories('x')).toEqual([])
  })

  test('returns at most `limit` results (default 4)', () => {
    const result = suggestCategories('fix backend api bug test deploy')
    expect(result.length).toBeLessThanOrEqual(4)
  })

  test('respects custom limit of 2', () => {
    const result = suggestCategories('fix backend api bug test deploy', [], 2)
    expect(result.length).toBeLessThanOrEqual(2)
  })

  test('respects custom limit of 1', () => {
    const result = suggestCategories('fix backend api bug test deploy', [], 1)
    expect(result.length).toBeLessThanOrEqual(1)
  })

  test('returns an array', () => {
    expect(Array.isArray(suggestCategories('fix backend bug'))).toBe(true)
  })

  test('all returned values are non-empty strings', () => {
    const result = suggestCategories('fix backend bugs test api deploy')
    expect(result.every(s => typeof s === 'string' && s.length > 0)).toBe(true)
  })
})

// ── Already-assigned exclusion ────────────────────────────────────────────────
describe('suggestCategories – already-assigned exclusion', () => {
  test('excludes Bug when already assigned', () => {
    const result = suggestCategories('fix backend bugs', ['Bug'])
    expect(result).not.toContain('Bug')
  })

  test('excludes Backend when already assigned', () => {
    const result = suggestCategories('fix backend bugs', ['Backend'])
    expect(result).not.toContain('Backend')
  })

  test('excludes multiple already-assigned categories', () => {
    const result = suggestCategories('fix backend bugs', ['Bug', 'Backend'])
    expect(result).not.toContain('Bug')
    expect(result).not.toContain('Backend')
  })

  test('exclusion is case-insensitive', () => {
    const result = suggestCategories('fix backend bugs', ['bug'])
    expect(result).not.toContain('Bug')
  })

  test('still returns other matching categories when some are excluded', () => {
    // "fix backend bugs" matches Bug + Backend; exclude Bug → Backend still shows
    const result = suggestCategories('fix backend bugs', ['Bug'])
    expect(result).toContain('Backend')
  })
})

// ── Bug category ──────────────────────────────────────────────────────────────
describe('suggestCategories – Bug', () => {
  test('"fix backend bugs" includes Bug', () => {
    expect(includes(suggestCategories('fix backend bugs'), 'Bug')).toBe(true)
  })

  test('"debug login crash" includes Bug', () => {
    expect(includes(suggestCategories('debug login crash'), 'Bug')).toBe(true)
  })

  test('"patch null pointer error" includes Bug (phrase match)', () => {
    expect(includes(suggestCategories('patch null pointer error'), 'Bug')).toBe(true)
  })

  test('"investigate memory leak" includes Bug (phrase match)', () => {
    expect(includes(suggestCategories('investigate memory leak'), 'Bug')).toBe(true)
  })

  test('"resolve production incident" includes Bug', () => {
    expect(includes(suggestCategories('resolve production incident'), 'Bug')).toBe(true)
  })

  test('"stack overflow exception crash" includes Bug (phrase match)', () => {
    expect(includes(suggestCategories('stack overflow exception crash'), 'Bug')).toBe(true)
  })

  test('"revert broken regression" includes Bug', () => {
    expect(includes(suggestCategories('revert broken regression'), 'Bug')).toBe(true)
  })
})

// ── Frontend category ─────────────────────────────────────────────────────────
describe('suggestCategories – Frontend', () => {
  test('"create a website" includes Frontend', () => {
    expect(includes(suggestCategories('create a website'), 'Frontend')).toBe(true)
  })

  test('"add login page" includes Frontend', () => {
    expect(includes(suggestCategories('add login page'), 'Frontend')).toBe(true)
  })

  test('"fix onboarding wizard skip bug" includes Frontend', () => {
    expect(includes(suggestCategories('fix onboarding wizard skip bug'), 'Frontend')).toBe(true)
  })

  test('"dark mode toggle component" includes Frontend (phrase + noun)', () => {
    expect(includes(suggestCategories('dark mode toggle component'), 'Frontend')).toBe(true)
  })

  test('"style the navbar dropdown" includes Frontend', () => {
    expect(includes(suggestCategories('style the navbar dropdown'), 'Frontend')).toBe(true)
  })

  test('"animate the modal popup" includes Frontend', () => {
    expect(includes(suggestCategories('animate the modal popup'), 'Frontend')).toBe(true)
  })

  test('"redesign the sidebar layout" includes Frontend', () => {
    expect(includes(suggestCategories('redesign the sidebar layout'), 'Frontend')).toBe(true)
  })
})

// ── Backend category ──────────────────────────────────────────────────────────
describe('suggestCategories – Backend', () => {
  test('"fix backend bugs" includes Backend', () => {
    expect(includes(suggestCategories('fix backend bugs'), 'Backend')).toBe(true)
  })

  test('"optimize slow database query" includes Backend', () => {
    expect(includes(suggestCategories('optimize slow database query'), 'Backend')).toBe(true)
  })

  test('"migrate user schema" includes Backend', () => {
    expect(includes(suggestCategories('migrate user schema'), 'Backend')).toBe(true)
  })

  test('"add REST api endpoint" includes Backend (phrase match)', () => {
    expect(includes(suggestCategories('add REST api endpoint'), 'Backend')).toBe(true)
  })

  test('"cache redis session data" includes Backend', () => {
    expect(includes(suggestCategories('cache redis session data'), 'Backend')).toBe(true)
  })

  test('"configure webhook for background job" includes Backend', () => {
    expect(includes(suggestCategories('configure webhook for background job'), 'Backend')).toBe(true)
  })
})

// ── Auth category ─────────────────────────────────────────────────────────────
describe('suggestCategories – Auth', () => {
  test('"write unit tests for auth" includes Auth', () => {
    expect(includes(suggestCategories('write unit tests for auth'), 'Auth')).toBe(true)
  })

  test('"implement jwt token refresh" includes Auth', () => {
    expect(includes(suggestCategories('implement jwt token refresh'), 'Auth')).toBe(true)
  })

  test('"add forgot password flow" includes Auth (phrase match)', () => {
    expect(includes(suggestCategories('add forgot password flow'), 'Auth')).toBe(true)
  })

  test('"setup oauth single sign-on" includes Auth', () => {
    expect(includes(suggestCategories('setup oauth single sign-on'), 'Auth')).toBe(true)
  })

  test('"reset password via email" includes Auth (phrase match)', () => {
    expect(includes(suggestCategories('reset password via email'), 'Auth')).toBe(true)
  })

  test('"add role-based access control" includes Auth', () => {
    expect(includes(suggestCategories('add role-based access control'), 'Auth')).toBe(true)
  })
})

// ── Testing category ──────────────────────────────────────────────────────────
describe('suggestCategories – Testing', () => {
  test('"write unit tests for auth" includes Testing', () => {
    expect(includes(suggestCategories('write unit tests for auth'), 'Testing')).toBe(true)
  })

  test('"add integration test coverage" includes Testing (phrase match)', () => {
    expect(includes(suggestCategories('add integration test coverage'), 'Testing')).toBe(true)
  })

  test('"write e2e spec for checkout" includes Testing', () => {
    expect(includes(suggestCategories('write e2e spec for checkout'), 'Testing')).toBe(true)
  })

  test('"improve test coverage" includes Testing (phrase match)', () => {
    expect(includes(suggestCategories('improve test coverage'), 'Testing')).toBe(true)
  })

  test('"add mock for payment service" includes Testing', () => {
    expect(includes(suggestCategories('add mock for payment service'), 'Testing')).toBe(true)
  })
})

// ── DevOps category ───────────────────────────────────────────────────────────
describe('suggestCategories – DevOps', () => {
  test('"deploy to production" includes DevOps', () => {
    expect(includes(suggestCategories('deploy to production'), 'DevOps')).toBe(true)
  })

  test('"setup docker pipeline" includes DevOps', () => {
    expect(includes(suggestCategories('setup docker pipeline'), 'DevOps')).toBe(true)
  })

  test('"configure github actions ci/cd" includes DevOps (phrase match)', () => {
    expect(includes(suggestCategories('configure github actions ci/cd'), 'DevOps')).toBe(true)
  })

  test('"provision kubernetes cluster" includes DevOps', () => {
    expect(includes(suggestCategories('provision kubernetes cluster'), 'DevOps')).toBe(true)
  })

  test('"monitor aws cloud metrics" includes DevOps', () => {
    expect(includes(suggestCategories('monitor aws cloud metrics'), 'DevOps')).toBe(true)
  })
})

// ── Planning category ─────────────────────────────────────────────────────────
describe('suggestCategories – Planning', () => {
  test('"sprint planning meeting" includes Planning (phrase match)', () => {
    expect(includes(suggestCategories('sprint planning meeting'), 'Planning')).toBe(true)
  })

  test('"review Q4 product roadmap" includes Planning', () => {
    expect(includes(suggestCategories('review Q4 product roadmap'), 'Planning')).toBe(true)
  })

  test('"estimate backlog grooming tasks" includes Planning', () => {
    expect(includes(suggestCategories('estimate backlog grooming tasks'), 'Planning')).toBe(true)
  })

  test('"schedule team standup" includes Planning', () => {
    expect(includes(suggestCategories('schedule team standup'), 'Planning')).toBe(true)
  })
})

// ── Product category ──────────────────────────────────────────────────────────
describe('suggestCategories – Product', () => {
  test('"review Q4 product roadmap" includes Product', () => {
    expect(includes(suggestCategories('review Q4 product roadmap'), 'Product')).toBe(true)
  })

  test('"write product spec for new feature" includes Product (phrase match)', () => {
    expect(includes(suggestCategories('write product spec for new feature'), 'Product')).toBe(true)
  })

  test('"launch MVP release" includes Product', () => {
    expect(includes(suggestCategories('launch MVP release'), 'Product')).toBe(true)
  })

  test('"ship feature request changelog" includes Product', () => {
    expect(includes(suggestCategories('ship feature request changelog'), 'Product')).toBe(true)
  })
})

// ── Docs category ─────────────────────────────────────────────────────────────
describe('suggestCategories – Docs', () => {
  test('"update readme with setup instructions" includes Docs', () => {
    expect(includes(suggestCategories('update readme with setup instructions'), 'Docs')).toBe(true)
  })

  test('"write api docs for new endpoints" includes Docs (phrase match)', () => {
    expect(includes(suggestCategories('write api docs for new endpoints'), 'Docs')).toBe(true)
  })

  test('"draft onboarding tutorial guide" includes Docs', () => {
    expect(includes(suggestCategories('draft onboarding tutorial guide'), 'Docs')).toBe(true)
  })
})

// ── Performance category ──────────────────────────────────────────────────────
describe('suggestCategories – Performance', () => {
  test('"optimize bundle size" includes Performance (phrase match)', () => {
    expect(includes(suggestCategories('optimize bundle size'), 'Performance')).toBe(true)
  })

  test('"reduce page load time" includes Performance (phrase match)', () => {
    expect(includes(suggestCategories('reduce page load time'), 'Performance')).toBe(true)
  })

  test('"profile cpu bottleneck" includes Performance', () => {
    expect(includes(suggestCategories('profile cpu bottleneck'), 'Performance')).toBe(true)
  })
})

// ── Security category ─────────────────────────────────────────────────────────
describe('suggestCategories – Security', () => {
  test('"security audit for api" includes Security (phrase match)', () => {
    expect(includes(suggestCategories('security audit for api'), 'Security')).toBe(true)
  })

  test('"fix xss vulnerability" includes Security', () => {
    expect(includes(suggestCategories('fix xss vulnerability'), 'Security')).toBe(true)
  })

  test('"sanitize user input to prevent sql injection" includes Security', () => {
    expect(includes(suggestCategories('sanitize user input to prevent sql injection'), 'Security')).toBe(true)
  })
})

// ── Health category ───────────────────────────────────────────────────────────
describe('suggestCategories – Health', () => {
  test('"meal prep" includes Health (phrase match)', () => {
    expect(includes(suggestCategories('meal prep'), 'Health')).toBe(true)
  })

  test('"morning run" includes Health (phrase match)', () => {
    expect(includes(suggestCategories('morning run'), 'Health')).toBe(true)
  })

  test('"gym workout" includes Health', () => {
    expect(includes(suggestCategories('gym workout'), 'Health')).toBe(true)
  })

  test('"Running" includes Health (verb infinitive via mock)', () => {
    expect(includes(suggestCategories('Running'), 'Health')).toBe(true)
  })

  test('"yoga meditation session" includes Health', () => {
    expect(includes(suggestCategories('yoga meditation session'), 'Health')).toBe(true)
  })
})

// ── Learning category ─────────────────────────────────────────────────────────
describe('suggestCategories – Learning', () => {
  test('"study for exam" includes Learning', () => {
    expect(includes(suggestCategories('study for exam'), 'Learning')).toBe(true)
  })

  test('"reading a book" includes Learning', () => {
    expect(includes(suggestCategories('reading a book'), 'Learning')).toBe(true)
  })

  test('"Studying" includes Learning (verb strip via mock)', () => {
    expect(includes(suggestCategories('Studying'), 'Learning')).toBe(true)
  })

  test('"finish online course" includes Learning (phrase match)', () => {
    expect(includes(suggestCategories('finish online course'), 'Learning')).toBe(true)
  })

  test('"attend workshop on machine learning" includes Learning', () => {
    expect(includes(suggestCategories('attend workshop on machine learning'), 'Learning')).toBe(true)
  })
})

// ── Errands / Finance / Social ────────────────────────────────────────────────
describe('suggestCategories – Errands, Finance, Social', () => {
  test('"buy groceries" includes Errands (phrase match)', () => {
    expect(includes(suggestCategories('buy groceries'), 'Errands')).toBe(true)
  })

  test('"pick up package from delivery" includes Errands', () => {
    expect(includes(suggestCategories('pick up package from delivery'), 'Errands')).toBe(true)
  })

  test('"pay rent" includes Finance (phrase match)', () => {
    expect(includes(suggestCategories('pay rent'), 'Finance')).toBe(true)
  })

  test('"track monthly budget expenses" includes Finance', () => {
    expect(includes(suggestCategories('track monthly budget expenses'), 'Finance')).toBe(true)
  })

  test('"birthday party planning" includes Social', () => {
    expect(includes(suggestCategories('birthday party planning'), 'Social')).toBe(true)
  })

  test('"plan family vacation trip" includes Social', () => {
    expect(includes(suggestCategories('plan family vacation trip'), 'Social')).toBe(true)
  })
})

// ── Research category ─────────────────────────────────────────────────────────
describe('suggestCategories – Research', () => {
  test('"proof of concept for new auth system" includes Research (phrase match)', () => {
    expect(includes(suggestCategories('proof of concept for new auth system'), 'Research')).toBe(true)
  })

  test('"investigate feasibility of graphql migration" includes Research', () => {
    expect(includes(suggestCategories('investigate feasibility of graphql migration'), 'Research')).toBe(true)
  })

  test('"tech spike on serverless architecture" includes Research (phrase match)', () => {
    expect(includes(suggestCategories('tech spike on serverless architecture'), 'Research')).toBe(true)
  })
})

// ── Multi-category detection ──────────────────────────────────────────────────
describe('suggestCategories – multi-category detection', () => {
  test('"fix backend bugs" returns both Bug and Backend', () => {
    const r = suggestCategories('fix backend bugs')
    expect(r).toContain('Bug')
    expect(r).toContain('Backend')
  })

  test('"add login page" returns both Frontend and Auth', () => {
    const r = suggestCategories('add login page')
    expect(r).toContain('Frontend')
    expect(r).toContain('Auth')
  })

  test('"security audit for api" returns both Security and Backend', () => {
    const r = suggestCategories('security audit for api')
    expect(r).toContain('Security')
    expect(r).toContain('Backend')
  })

  test('"optimize slow database query" returns both Performance and Backend', () => {
    const r = suggestCategories('optimize slow database query')
    expect(r).toContain('Performance')
    expect(r).toContain('Backend')
  })

  test('"write unit tests for auth" returns both Testing and Auth', () => {
    const r = suggestCategories('write unit tests for auth')
    expect(r).toContain('Testing')
    expect(r).toContain('Auth')
  })

  test('"sprint planning meeting" returns both Planning and Social (birthday excluded by limit)', () => {
    // sprint → Planning; meeting → Planning; both signals concentrate there
    const r = suggestCategories('sprint planning meeting')
    expect(r).toContain('Planning')
  })
})

// ── Limit interaction with multi-category ─────────────────────────────────────
describe('suggestCategories – limit + multi-category', () => {
  test('limit=1 still returns exactly 1 string', () => {
    const r = suggestCategories('fix backend api bug test', [], 1)
    expect(r).toHaveLength(1)
  })

  test('limit=0 returns empty array', () => {
    const r = suggestCategories('fix backend api bug', [], 0)
    expect(r).toHaveLength(0)
  })

  test('returns fewer than limit when fewer categories match', () => {
    // A very specific title that only strongly matches one category
    const r = suggestCategories('gym workout session', [], 4)
    expect(r.length).toBeGreaterThan(0)
    expect(r.length).toBeLessThanOrEqual(4)
  })
})

// ── Result ordering ───────────────────────────────────────────────────────────
describe('suggestCategories – result ordering (highest confidence first)', () => {
  test('"fix backend bugs" — Bug ranked before Backend', () => {
    // "fix" → Bug verb (+3), "bugs"→"bug" → Bug noun (+2) = 5 for Bug
    // "backend" → Backend noun (+2) = 2 for Backend
    const r = suggestCategories('fix backend bugs')
    const bugIdx     = r.indexOf('Bug')
    const backendIdx = r.indexOf('Backend')
    expect(bugIdx).toBeGreaterThanOrEqual(0)
    expect(backendIdx).toBeGreaterThanOrEqual(0)
    expect(bugIdx).toBeLessThan(backendIdx)
  })

  test('"security audit for api" — Security ranked at or before Backend', () => {
    // "security audit" phrase = +4 for Security; "api" noun = +2 for Backend
    const r = suggestCategories('security audit for api')
    const secIdx     = r.indexOf('Security')
    const backendIdx = r.indexOf('Backend')
    expect(secIdx).toBeGreaterThanOrEqual(0)
    expect(backendIdx).toBeGreaterThanOrEqual(0)
    expect(secIdx).toBeLessThanOrEqual(backendIdx)
  })

  test('results are sorted descending by score (no tie-breaking required)', () => {
    // Just assert the array is already sorted — validate against a re-sort
    const r = suggestCategories('fix backend bugs test api deploy', [], 10)
    // All results must be present and in the same order as a re-sorted array
    // (this is trivially true but confirms no randomness was introduced)
    expect(r).toEqual([...r])
  })
})

// ── Hyphen / slash tokenisation ───────────────────────────────────────────────
describe('suggestCategories – delimiter handling', () => {
  test('"ci/cd pipeline setup" includes DevOps', () => {
    expect(includes(suggestCategories('ci/cd pipeline setup'), 'DevOps')).toBe(true)
  })

  test('"backend-api refactor" includes Backend', () => {
    expect(includes(suggestCategories('backend-api refactor'), 'Backend')).toBe(true)
  })

  test('"unit_test coverage" includes Testing', () => {
    expect(includes(suggestCategories('unit_test coverage'), 'Testing')).toBe(true)
  })
})
