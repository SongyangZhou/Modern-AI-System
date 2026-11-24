export const meta = {
  name: 'verify-change',
  description: 'Quality gate: verification runs tests and lint, then code-reviewer reviews the changed files against CLAUDE.md. Returns pass or fail with the issues to fix.',
  whenToUse: 'Run after a change is built, before calling it done. args: optional text describing the change.',
  phases: [
    { title: 'Verify', detail: 'verification lists changed files, runs tests and lint' },
    { title: 'Review', detail: 'code-reviewer reads the changed files against CLAUDE.md' },
  ],
}

// This gate only checks. It never fixes: the issues go back to whoever builds.
const change = typeof args === 'string' && args.trim() ? args.trim() : 'the changes on the current branch'

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    changedFiles: { type: 'array', items: { type: 'string' } },
    testsPass: { type: 'boolean' },
    lintClean: { type: 'boolean' },
    failures: { type: 'array', items: { type: 'string' } },
  },
  required: ['changedFiles', 'testsPass', 'lintClean', 'failures'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['approve', 'blockers'] },
    blockers: {
      type: 'array',
      items: {
        type: 'object',
        properties: { file: { type: 'string' }, line: { type: 'number' }, issue: { type: 'string' } },
        required: ['file', 'line', 'issue'],
      },
    },
  },
  required: ['verdict', 'blockers'],
}

// Step 1: verification runs first, so the reviewer knows which files changed
// and what the checks found. The reviewer cannot run commands itself.
phase('Verify')
const verify = await agent(
  `You are the verification step of a quality gate. Do not change any files.\n` +
    `1. List every changed file: run git diff --name-only main...HEAD, git diff --name-only HEAD, ` +
    `and git ls-files --others --exclude-standard. Return the combined list, without duplicates, as changedFiles.\n` +
    `2. Run: cd backend && npm test\n` +
    `3. Run: cd frontend && npm test\n` +
    `4. Run: cd frontend && npm run lint\n` +
    `Set testsPass true only if both test commands pass. Set lintClean true only if lint exits 0. ` +
    `List each failure as one short string: the command and the decisive error line.`,
  { agentType: 'verification', label: 'verify', phase: 'Verify', schema: VERIFY_SCHEMA },
)
if (!verify) {
  return { status: 'fail', change, issues: ['verification agent returned no result'] }
}

// Step 2: review the changed files against the contract.
phase('Review')
const review = await agent(
  `Review this change against CLAUDE.md, including the API contract and the "What done means" list:\n\n${change}\n\n` +
    `Read CLAUDE.md first, then read each changed file:\n` +
    `${verify.changedFiles.length ? verify.changedFiles.map(f => `- ${f}`).join('\n') : '(no changed files)'}\n\n` +
    `You cannot run commands. A separate verification agent already ran the tests and lint: ` +
    `testsPass=${verify.testsPass}, lintClean=${verify.lintClean}, failures: ${verify.failures.join('; ') || 'none'}.\n` +
    `Do not delegate to any other agent. Return verdict "approve" only when there are no blockers. ` +
    `Otherwise return verdict "blockers" with each blocker as { file, line, issue }. Do not list suggestions that are not blockers.`,
  { agentType: 'code-reviewer', label: 'review', phase: 'Review', schema: REVIEW_SCHEMA },
)

// The script decides pass or fail from the structured fields only.
const issues = []
if (!verify.testsPass) issues.push('tests failing')
if (!verify.lintClean) issues.push('lint not clean')
verify.failures.forEach(f => issues.push(f))
if (!review) issues.push('review agent returned no result')
else review.blockers.forEach(b => issues.push(`${b.file}:${b.line} ${b.issue}`))

const pass = verify.testsPass && verify.lintClean && !!review && review.verdict === 'approve' && review.blockers.length === 0
log(`gate: ${pass ? 'PASS' : 'FAIL'} tests=${verify.testsPass} lint=${verify.lintClean} review=${review ? review.verdict : 'none'}`)

return {
  status: pass ? 'pass' : 'fail',
  change,
  changedFiles: verify.changedFiles,
  testsPass: verify.testsPass,
  lintClean: verify.lintClean,
  reviewVerdict: review ? review.verdict : null,
  issues,
}
