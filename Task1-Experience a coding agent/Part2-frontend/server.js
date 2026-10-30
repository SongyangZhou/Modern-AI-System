// CS2680 Part 2: a web page in front of headless Claude Code.
//
// The server spawns `claude -p ... --output-format stream-json` as a
// subprocess, forwards each JSON event to the browser the moment it is
// printed, and remembers session ids so a follow-up prompt can --resume.
//
// No npm dependencies. Run with:  node server.js   then open http://localhost:3000

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT) || 3000;
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const REPLAY_DIR = path.join(ROOT, 'replays');
const DATA_DIR = path.join(ROOT, 'data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const INDEX_FILE = path.join(DATA_DIR, 'sessions.json');
// Claude works inside its own subfolder so it can never edit this server's code.
const DEFAULT_CWD = path.join(ROOT, 'workspace');

fs.mkdirSync(SESSIONS_DIR, { recursive: true });
fs.mkdirSync(DEFAULT_CWD, { recursive: true });

const SESSION_ID_RE = /^[0-9a-f-]{36}$/i;
let running = false; // one run at a time
// The run in progress: lets /api/stop end it, and lets a reloaded page see it.
let activeRun = null; // { child, sessionId, startedAt, stopRequested }

// ---------------------------------------------------------------- sessions
// data/sessions.json            index: [{ id, title, cwd, createdAt, updatedAt, runs }]
// data/sessions/<id>.jsonl      every event of that session, plus our own
//                               {"type":"_prompt"} lines, so a session can be
//                               re-displayed when the user switches back to it.

function loadIndex() {
  try { return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')); } catch { return []; }
}

function saveIndex(list) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(list, null, 2));
}

function findSession(id) {
  return loadIndex().find((s) => s.id === id);
}

// runs  = how many prompts were sent in this session
// turns = sum of num_turns from every result event in this session
function recordRun(id, { prompt, cwd, numTurns }) {
  const list = loadIndex();
  const now = new Date().toISOString();
  let entry = list.find((s) => s.id === id);
  if (!entry) {
    entry = { id, title: prompt.slice(0, 80), cwd, createdAt: now, runs: 0, turns: 0 };
    list.push(entry);
  }
  entry.updatedAt = now;
  entry.runs += 1;
  entry.turns = (entry.turns || 0) + (numTurns || 0);
  saveIndex(list);
}

// Sessions saved before turn counting existed: add up num_turns from their events.
function countTurns(id) {
  try {
    return fs.readFileSync(sessionFile(id), 'utf8').split('\n').reduce((sum, line) => {
      try {
        const e = JSON.parse(line);
        return e.type === 'result' ? sum + (e.num_turns || 0) : sum;
      } catch { return sum; }
    }, 0);
  } catch { return 0; }
}

function loadIndexWithTurns() {
  const list = loadIndex();
  let changed = false;
  for (const s of list) {
    if (typeof s.turns !== 'number') { s.turns = countTurns(s.id); changed = true; }
  }
  if (changed) saveIndex(list);
  return list;
}

function sessionFile(id) {
  return path.join(SESSIONS_DIR, `${id}.jsonl`);
}

// ---------------------------------------------------------------- helpers

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function expandHome(p) {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

// Starts a streaming response: one JSON object per line (NDJSON).
function startStream(res) {
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  return (line) => {
    if (!res.writableEnded && !res.destroyed) res.write(line + '\n');
  };
}

// Splits a stream of text chunks into complete lines. A long JSON event can
// arrive split across several chunks, so we buffer until we see a newline.
function lineSplitter(onLine) {
  let buf = '';
  return {
    push(chunk) {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) onLine(line);
      }
    },
    flush() {
      const line = buf.trim();
      buf = '';
      if (line) onLine(line);
    },
  };
}

// ---------------------------------------------------------------- POST /api/run

async function handleRun(req, res) {
  let body;
  try { body = await readBody(req); } catch { return sendJson(res, 400, { error: 'Invalid JSON body' }); }

  const prompt = String(body.prompt || '').trim();
  if (!prompt) return sendJson(res, 400, { error: 'Prompt is empty' });
  if (running) return sendJson(res, 409, { error: 'A run is already in progress' });

  // Continue an existing session, or start a new one when sessionId is null.
  let sessionId = body.sessionId || null;
  let cwd;
  if (sessionId) {
    if (!SESSION_ID_RE.test(sessionId)) return sendJson(res, 400, { error: 'Bad session id' });
    const entry = findSession(sessionId);
    if (!entry) return sendJson(res, 404, { error: 'Unknown session' });
    cwd = entry.cwd; // a session can only be resumed from the directory it started in
  } else {
    cwd = path.resolve(expandHome(String(body.cwd || DEFAULT_CWD).trim()));
  }
  let stat = null;
  try { stat = fs.statSync(cwd); } catch { /* missing */ }
  if (!stat) return sendJson(res, 400, { error: `Working directory does not exist: ${cwd}`, runFailed: true });
  if (!stat.isDirectory()) return sendJson(res, 400, { error: `Not a directory: ${cwd}`, runFailed: true });

  // Arguments go in an array, so no shell ever parses them. The prompt is
  // written to stdin, so quotes, newlines or a leading "-" cannot break it.
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions'];
  if (sessionId) args.push('--resume', sessionId);

  // Never let an API key override the subscription login (it would bill the key).
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;

  running = true;
  const send = startStream(res);

  // Lines for a brand-new session are held until the init event tells us its id.
  // "resumed" tells the page this prompt continues an existing session.
  const promptLine = JSON.stringify({
    type: '_prompt', text: prompt, cwd, ts: new Date().toISOString(), resumed: sessionId || undefined,
  });
  send(promptLine); // the page starts a new turn with this prompt
  let pending = [promptLine];
  if (sessionId) {
    fs.appendFileSync(sessionFile(sessionId), promptLine + '\n');
    pending = null;
  }
  const persist = (line) => {
    if (sessionId) fs.appendFileSync(sessionFile(sessionId), line + '\n');
    else pending.push(line);
  };

  let sawResult = false;
  let numTurns = 0;
  let stderr = '';
  let finished = false;

  const child = spawn(CLAUDE_BIN, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.on('error', () => {}); // ignore EPIPE if claude exits early
  child.stdin.end(prompt);
  activeRun = { child, sessionId, startedAt: Date.now(), stopRequested: false };

  const onLine = (line) => {
    let event;
    try { event = JSON.parse(line); } catch { event = null; }
    if (!event) {
      line = JSON.stringify({ type: '_raw', text: line });
    } else {
      if (!sessionId && SESSION_ID_RE.test(event.session_id || '')) {
        sessionId = event.session_id;
        activeRun.sessionId = sessionId;
        fs.appendFileSync(sessionFile(sessionId), pending.join('\n') + '\n');
        pending = null;
      }
      if (event.type === 'result') {
        sawResult = true;
        numTurns += event.num_turns || 0; // a run with background subagents has several results
      }
    }
    persist(line);
    send(line); // forward to the browser immediately
  };

  const splitter = lineSplitter(onLine);
  child.stdout.setEncoding('utf8'); // keeps multi-byte characters (e.g. Chinese) intact across chunks
  child.stdout.on('data', (chunk) => splitter.push(chunk));
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (c) => { stderr = (stderr + c).slice(-4000); });

  const finish = (errorMessage) => {
    if (finished) return;
    finished = true;
    splitter.flush();
    if (activeRun && activeRun.stopRequested) {
      const line = JSON.stringify({ type: '_stopped' });
      persist(line);
      send(line);
    } else if (errorMessage) {
      const line = JSON.stringify({ type: '_error', message: errorMessage, stderr: stderr.trim() });
      persist(line);
      send(line);
    }
    if (sessionId) recordRun(sessionId, { prompt, cwd, numTurns });
    send(JSON.stringify({ type: '_done', sessionId, cwd }));
    res.end();
    running = false;
    activeRun = null;
  };

  child.on('error', (err) => {
    finish(err.code === 'ENOENT'
      ? `Could not find the "${CLAUDE_BIN}" command. Is Claude Code installed and on your PATH?`
      : `Could not start claude: ${err.message}`);
  });
  child.on('close', (code) => {
    finish(sawResult ? null : `claude exited with code ${code} before finishing`);
  });
  // If the browser goes away we let the run finish; its events are still saved.
}

// ---------------------------------------------------------------- POST /api/stop
// Ends the run in progress. The run's own stream then reports it as stopped.

function handleStop(req, res) {
  if (!activeRun) return sendJson(res, 409, { error: 'No run in progress' });
  const { child } = activeRun;
  activeRun.stopRequested = true;
  child.kill('SIGTERM');
  // If claude ignores the polite signal, force it after 3 seconds.
  setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }, 3000);
  sendJson(res, 200, { ok: true });
}

// ---------------------------------------------------------------- POST /api/replay
// Streams a recorded events file as if it were a live run. Costs no usage.

async function handleReplay(req, res) {
  let body;
  try { body = await readBody(req); } catch { return sendJson(res, 400, { error: 'Invalid JSON body' }); }
  const name = path.basename(String(body.file || ''));
  const file = path.join(REPLAY_DIR, name);
  if (!name.endsWith('.jsonl') || !fs.existsSync(file)) return sendJson(res, 404, { error: 'Replay file not found' });
  const delay = Math.min(Math.max(Number(body.delayMs) || 600, 0), 5000);

  const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
  const send = startStream(res);
  send(JSON.stringify({ type: '_prompt', text: `Replay of ${name}`, replay: true }));
  for (const line of lines) {
    if (res.destroyed) return;
    await new Promise((r) => setTimeout(r, delay));
    send(line);
  }
  send(JSON.stringify({ type: '_done', sessionId: null, replay: true }));
  res.end();
}

// ---------------------------------------------------------------- static files

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) return sendJson(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------------------------------------------------------------- router

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');

  if (req.method === 'GET' && pathname === '/api/config') {
    const replays = fs.existsSync(REPLAY_DIR)
      ? fs.readdirSync(REPLAY_DIR).filter((f) => f.endsWith('.jsonl')).sort()
      : [];
    const run = activeRun ? { sessionId: activeRun.sessionId, startedAt: activeRun.startedAt } : null;
    return sendJson(res, 200, { defaultCwd: DEFAULT_CWD, replays, running, run });
  }

  if (req.method === 'GET' && pathname === '/api/sessions') {
    const list = loadIndexWithTurns().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return sendJson(res, 200, list);
  }

  const m = pathname.match(/^\/api\/sessions\/([0-9a-f-]{36})$/i);
  if (req.method === 'GET' && m) {
    const entry = findSession(m[1]);
    if (!entry) return sendJson(res, 404, { error: 'Unknown session' });
    let events = [];
    try {
      events = fs.readFileSync(sessionFile(entry.id), 'utf8')
        .split('\n').filter((l) => l.trim())
        .map((l) => { try { return JSON.parse(l); } catch { return { type: '_raw', text: l }; } });
    } catch { /* no events yet */ }
    return sendJson(res, 200, { session: entry, events });
  }

  if (req.method === 'POST' && pathname === '/api/run') return handleRun(req, res);
  if (req.method === 'POST' && pathname === '/api/stop') return handleStop(req, res);
  if (req.method === 'POST' && pathname === '/api/replay') return handleReplay(req, res);
  if (req.method === 'GET') return serveStatic(req, res);
  sendJson(res, 405, { error: 'Method not allowed' });
});

// Listen on this computer only: with --dangerously-skip-permissions, anyone who
// could reach this page could make Claude run commands on your machine.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Claude Code web UI: http://localhost:${PORT}`);
  console.log(`Default working directory: ${DEFAULT_CWD}`);
});
