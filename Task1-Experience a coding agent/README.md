# Task 1: Experience a Coding Agent

Drive Claude Code from a terminal in headless mode, then put a web page in front of it that shows the agent's work as it happens.

## Part 1: Drive Claude Code from a terminal

Claude Code runs non-interactively with `-p`. With `--output-format stream-json --verbose` it prints one JSON event per line: an `init` event, then assistant messages, tool calls and their results, then a `result` event with the cost, duration, number of turns and the session id.

```bash
cd Part1-terminal
claude -p "Read main.py, add a --help flag using argparse, then run python3 main.py --help to verify it works." \
  --output-format stream-json --verbose --dangerously-skip-permissions > events.jsonl

# continue the same conversation
claude -p --resume <session_id> "Now also add a --version flag that prints 1.0" \
  --output-format stream-json --verbose --dangerously-skip-permissions > events-resume.jsonl
```

| File | What it is |
|---|---|
| `events.jsonl` | First run: Read, Write and Bash calls, 4 turns |
| `events-resume.jsonl` | Follow-up run with `--resume`: Edit and Bash, same session id |
| `main.py` | The file Claude edited in both runs |

What the recorded streams showed:

- Tool results arrive as `user` events. A call and its result share the `tool_use` id.
- One API message can be split across several `assistant` events (same `message.id`), each carrying its own copy of `usage`.
- `total_cost_usd` is cumulative for the session. On a resumed run the run's own cost is in `model_usage_since_last_result`.
- Events not mentioned in the course notes appear, such as `rate_limit_event`, so a renderer has to skip unknown types.

## Part 2: The web frontend

A Node.js server with no dependencies. It spawns the Part 1 command as a subprocess, forwards each event to the browser as soon as it is printed, and keeps session ids so a follow-up prompt resumes the conversation.

### Run it

```bash
cd Part2-frontend
node server.js
# open http://localhost:3000
```

Requirements: Node.js 18 or later, and Claude Code installed and logged in. The server removes `ANTHROPIC_API_KEY` from the subprocess environment, so runs always use the logged-in subscription.

To try the page without spending usage, pick a file under "Test with a recorded run" and press Play. The files in `replays/` are real recorded runs.

### The seven features

| # | Feature | How the page does it |
|---|---|---|
| 1 | Submit a prompt | Text box plus a working directory field (default `workspace/`). The server spawns `claude -p` with an argument array and writes the prompt to stdin, so quotes, newlines and leading dashes are safe. One run at a time. |
| 2 | Show the trajectory live | The server splits stdout into lines and streams them as NDJSON. The page renders each event on arrival: assistant text as markdown (marked + DOMPurify), tool calls as plain phrases such as "Reading main.py" while pending and "Read main.py" when done. |
| 3 | Show tool results | Each result sits under its call. Previews keep the part that matters: the last 6 lines of a command (errors and test summaries come last), the first 6 lines of a diff, a line count for file reads. The rest folds behind "N earlier lines, folded". Unfolding shows up to 500 lines; single lines are cut at 300 characters. |
| 4 | Show status | Per call: pending, ✓, or ✗ for results with `is_error`. Per run, in the top bar: running with a live clock, finished, failed with a reason, or stopped. A missing folder, a crashed process, a lost connection and an unreachable server each produce a visible failure. After 2 minutes with no events the top bar warns, and a Stop button ends the run. |
| 5 | Continue the conversation | Follow-ups resume the current session by default and are tagged "resumed session ...". Sessions are listed in the sidebar; New session starts fresh, and any older session can be reopened and continued. A session is locked to the folder it started in, since `--resume` only finds sessions from that folder. |
| 6 | Show the run's numbers | Each run ends with one line: steps, duration, cost and session id, taken from the result events. |
| 7 | Trajectory as a tree | Subagent events are placed under the Agent call that spawned them, using `parent_tool_use_id`. Each subagent box is open while it works and folds when it finishes, leaving its conclusion visible. An outline beside the dialogue draws the run as a flow chart: parallel subagents split into side-by-side branches and join again, each call shows its duration, and clicking a call jumps to it. On narrow windows the outline folds behind a button. |

### Files

| Path | Role |
|---|---|
| `server.js` | Spawns Claude Code, streams events, saves sessions, stop and replay endpoints |
| `public/index.html` | Page layout: sessions, dialogue, outline |
| `public/app.js` | Reads the stream and renders the trajectory, results, statuses and outline |
| `public/styles.css` | Styles, light and dark |
| `public/vendor/` | marked (markdown) and DOMPurify (HTML sanitizing) |
| `replays/` | Recorded runs for testing without usage |
| `workspace/` | Default folder Claude works in, kept apart from the server code |
| `data/` | Created at run time: session list and every session's events (not committed) |

### Safety

Runs use `--dangerously-skip-permissions`, so every edit and command is approved automatically. To limit the damage, the server listens on `127.0.0.1` only, Claude works in `workspace/` by default, and the top bar shows that auto-approve is on.

### What real runs revealed

Building against recorded output exposed behavior the course notes do not describe:

- **Background subagents.** The subagent tool is called `Agent` in this version. Its `tool_result` comes back within milliseconds saying "Async agent launched successfully"; the subagent's real completion arrives later as a `task_notification` system event. The page keeps the call pending until then.
- **Several result events per run.** With two background subagents, one run produced three `init` and three `result` events: the main agent ends a round after launching the subagents and is woken again as each one finishes. The page and the server add up all result events of a run.
- **Failures.** A command that exits non-zero is reported with `is_error: true`. Bash `stderr` arrives merged into `stdout`. In headless mode the Glob and Grep tools were unavailable, and the model tried them before falling back to `find` and `grep`.
