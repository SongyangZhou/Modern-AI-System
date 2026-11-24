# Logistics Dashboard: a Claude Code agent team

A small full-stack logistics dashboard, built as a hands-on exercise in running a team of Claude Code agents. The app is the vehicle. The reusable part is the team setup: `CLAUDE.md`, five agent definitions in `.claude/agents/`, and two workflows in `.claude/workflows/`.

## The app

- **Frontend:** React + Vite
- **Backend:** Node + Express, with a JSON file for storage
- **Features:** KPI cards, a shipments table with search, status and carrier filters, a deliveries-per-day chart, adding and updating shipments, and a carrier performance section
- **API:** `GET /api/shipments`, `GET /api/stats`, `GET /api/carriers`, `POST /api/shipments`, `PATCH /api/shipments/:id`. The full contract is in `CLAUDE.md`.

### Run it

```bash
# terminal 1
cd backend && npm install && npm start     # http://localhost:3001

# terminal 2
cd frontend && npm install && npm run dev  # http://localhost:5173, proxies /api to port 3001
```

### Test it

```bash
cd backend && npm test
cd frontend && npm test && npm run lint
```

## The team

| Level | Agent | Model | Role |
|---|---|---|---|
| L0 | Lead (your Claude Code session) | | Owns the plan, assigns work, reconciles results, approves contract changes |
| L1 | `implementer` | sonnet | Builds features; may delegate tests to `test-writer` |
| L1 | `debugging` | sonnet | Reproduces a failure, finds the root cause, makes a focused fix |
| L1 | `code-reviewer` | sonnet | Reviews against `CLAUDE.md`. It has no `Bash`, so it cannot run checks itself and delegates them to `verification` |
| L2 | `test-writer` | haiku | Writes tests for new code |
| L2 | `verification` | haiku | Runs the checks and reports evidence, not opinions |

`CLAUDE.md` holds what "done" means, the API contract, the team and its rules. Every agent reads it first.

## The workflows

| Command | What it does |
|---|---|
| `/ship-change <change>` | Implement, write tests, then review and verify in parallel. If anything fails, `debugging` fixes it and the checks run again, up to 3 checks in total |
| `/verify-change [change]` | A quality gate that only checks: `verification` runs tests and lint, then a read-only `code-reviewer` reviews the changed files. Returns `pass` or `fail` with the issues to fix |

Both decide pass or fail from structured output, not from an agent's prose. On a Pro plan, turn on **Dynamic workflows** in `/config` first.

## Use it

Start Claude Code **in this folder**, so it loads `CLAUDE.md` and `.claude/`:

```bash
cd "Practice-Logistics dashboard agent team"
claude
```

- **Subagent:** ask Claude to have the `test-writer` agent cover a file.
- **Workflow:** run `/ship-change Add a sort control to the shipments table`.
- **Agent team** (experimental): create `.claude/settings.local.json` with `{"env": {"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"}}`, start a new session, and ask the lead to spawn teammates using the agent types above.
- **Goal:** `/goal <a condition Claude's own output can prove>`, for example a coverage threshold with the command that shows it.
- **All together:** a team builds, `/verify-change` gates, and `/goal` keeps the loop going until the gate passes.

## What the exercises showed

| Exercise | Mechanism | Takeaway |
|---|---|---|
| Ex 1 | Manual worktrees | You hold the plan and coordinate by hand |
| Ex 2 | Subagent | Delegate a task and get back only a summary |
| Ex 3 | Agent team | Teammates talk to each other directly. Flexible, and steps can get skipped |
| Ex 4 | Workflow | The process lives in code and nobody can skip a step. Strict, and it cannot adapt |
| Ex 5 | `/goal` | You set only the finish line; a separate model judges whether it is met |
| Ex 6 | `/loop` | Runs on a schedule with no one prompting it; caught a planted bug on the next run |
| Ex 7 | Combined | A team designed the contract and built the feature, a workflow gated it, `/goal` accepted it, and a person checked it last |

Lessons that held across the exercises:

- **Restrict tools rather than ask nicely.** Removing `Bash` from the reviewer did more than any instruction to delegate.
- **A short instruction routes around the process.** Twice, "fix it" made the lead edit code directly with no review. Processes that matter belong in a workflow or a `/goal` condition.
- **Write `/goal` conditions as precisely as a contract.** The evaluator reads the condition literally and ignores explanations given in chat.
- **Automated checks have blind spots.** Component tests run in jsdom, which computes no layout and mocks the backend, so a person still checks the page in a browser.

Built with Claude Code 2.1.3xx. Agent teams and dynamic workflows are newer features and may change.
