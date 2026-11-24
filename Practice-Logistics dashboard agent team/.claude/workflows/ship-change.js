export const meta = {
  name: 'ship-change',
  description: 'Implement one logistics-dashboard change, write tests, review, verify, and fix up to 3 rounds',
  whenToUse: 'Pass a string describing one change to the logistics dashboard as args',
  phases: [
    { title: 'Implement', detail: 'implementer builds the change' },
    { title: 'Tests', detail: 'test-writer covers changed files' },
    { title: 'Review', detail: 'code-reviewer checks against CLAUDE.md' },
    { title: 'Verify', detail: 'verification runs tests and lint' },
    { title: 'Fix', detail: 'debugging fixes blockers and failures' },
  ],
}

const MAX_ROUNDS = 3

if (typeof args !== 'string' || !args.trim()) {
  throw new Error('ship-change: args must be a non-empty string describing the change')
}
const change = args.trim()

const IMPLEMENT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'files'],
}

const TESTS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'files'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['approve', 'blockers'] },
    blockers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          issue: { type: 'string' },
        },
        required: ['file', 'line', 'issue'],
      },
    },
  },
  required: ['verdict', 'blockers'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    testsPass: { type: 'boolean' },
    lintClean: { type: 'boolean' },
    failures: { type: 'array', items: { type: 'string' } },
  },
  required: ['testsPass', 'lintClean', 'failures'],
}

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'files'],
}

// Phase 1: Implement
phase('Implement')
const impl = await agent(
  `Implement this change to the logistics dashboard, following CLAUDE.md (API contract, scope rules):\n\n${change}\n\n` +
    `Do NOT delegate writing tests to any agent. A later phase handles tests. ` +
    `Return a short summary and the list of files you changed or created (repo-relative paths).`,
  { agentType: 'implementer', label: 'implement', phase: 'Implement', schema: IMPLEMENT_SCHEMA },
)
if (!impl) {
  return { status: 'failed', change, reason: 'implementer returned no result', rounds: 0 }
}

const changedFiles = new Set(impl.files)

// Phase 2: Tests
phase('Tests')
const tests = await agent(
  `Write tests for this change to the logistics dashboard:\n\n${change}\n\n` +
    `Implementer summary: ${impl.summary}\n` +
    `Files the implementer changed:\n${impl.files.map(f => `- ${f}`).join('\n')}\n\n` +
    `Cover frontend with Vitest and backend with the existing backend test setup. ` +
    `Return a short summary and the test files you wrote or changed.`,
  { agentType: 'test-writer', label: 'write-tests', phase: 'Tests', schema: TESTS_SCHEMA },
)
if (tests) tests.files.forEach(f => changedFiles.add(f))

function reviewPrompt(round) {
  return (
    `Review the current uncommitted changes (read the files listed below; you cannot run commands) against CLAUDE.md, ` +
    `including the API contract. Change under review:\n\n${change}\n\n` +
    `Files touched so far:\n${[...changedFiles].map(f => `- ${f}`).join('\n')}\n\n` +
    `Review round ${round}. Do NOT delegate verification to any agent; a separate agent runs the checks. ` +
    `Return verdict "approve" only when there are no blockers. Otherwise return verdict "blockers" with each blocker as { file, line, issue }.`
  )
}

const VERIFY_PROMPT =
  `Run these checks yourself and report exact results:\n` +
  `1. cd frontend && npm test\n` +
  `2. cd frontend && npm run lint\n` +
  `3. cd backend && npm test\n` +
  `Set testsPass true only if both test commands pass. Set lintClean true only if lint exits clean. ` +
  `List each failure as one short string (command plus decisive error line). Do not fix anything.`

// Phases 3-5: Review, Verify, Fix loop
let review = null
let verify = null
let round = 0
let clean = false

while (round < MAX_ROUNDS) {
  round++

  phase('Review')
  phase('Verify')
  ;[review, verify] = await parallel([
    () =>
      agent(reviewPrompt(round), {
        agentType: 'code-reviewer',
        label: `review r${round}`,
        phase: 'Review',
        schema: REVIEW_SCHEMA,
      }),
    () =>
      agent(VERIFY_PROMPT, {
        agentType: 'verification',
        label: `verify r${round}`,
        phase: 'Verify',
        schema: VERIFY_SCHEMA,
      }),
  ])

  // Pass/fail comes from structured output only. A missing result counts as failure.
  const reviewOk = !!review && review.verdict === 'approve' && review.blockers.length === 0
  const verifyOk = !!verify && verify.testsPass === true && verify.lintClean === true
  log(`round ${round}: review=${reviewOk ? 'approve' : 'blockers'} tests=${verify?.testsPass} lint=${verify?.lintClean}`)

  if (reviewOk && verifyOk) {
    clean = true
    break
  }
  if (round === MAX_ROUNDS) break

  phase('Fix')
  const blockers = review ? review.blockers : []
  const failures = verify ? verify.failures : ['verification agent returned no result']
  const fix = await agent(
    `Fix the problems below in the logistics dashboard. Change being shipped:\n\n${change}\n\n` +
      `Review blockers:\n${blockers.length ? blockers.map(b => `- ${b.file}:${b.line} ${b.issue}`).join('\n') : '(none)'}\n\n` +
      `Verification failures (testsPass=${verify?.testsPass}, lintClean=${verify?.lintClean}):\n` +
      `${failures.length ? failures.map(f => `- ${f}`).join('\n') : '(none)'}\n\n` +
      `Find the root cause, fix it, and keep to the API contract in CLAUDE.md. Touch only files needed for these fixes. ` +
      `Return a short summary and the files you changed.`,
    { agentType: 'debugging', label: `fix r${round}`, phase: 'Fix', schema: FIX_SCHEMA },
  )
  if (fix) fix.files.forEach(f => changedFiles.add(f))
}

// Phase 6: Report
const unresolved = []
if (!clean) {
  if (!review) unresolved.push('review returned no result')
  else {
    if (review.verdict !== 'approve') unresolved.push('review verdict: blockers')
    review.blockers.forEach(b => unresolved.push(`${b.file}:${b.line} ${b.issue}`))
  }
  if (!verify) unresolved.push('verification returned no result')
  else {
    if (!verify.testsPass) unresolved.push('tests failing')
    if (!verify.lintClean) unresolved.push('lint not clean')
    verify.failures.forEach(f => unresolved.push(f))
  }
}

return {
  status: clean ? 'shipped' : 'unresolved',
  change,
  whatChanged: impl.summary,
  files: [...changedFiles],
  rounds: round,
  maxRounds: MAX_ROUNDS,
  finalVerification: verify
    ? { testsPass: verify.testsPass, lintClean: verify.lintClean, failures: verify.failures }
    : null,
  unresolved,
}
