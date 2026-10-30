// Browser side: sends prompts, reads the event stream, and renders the
// trajectory as it arrives.

const $ = (id) => document.getElementById(id);
const els = {
  transcript: $('transcript'), empty: $('empty'), prompt: $('prompt'), send: $('send'), stop: $('stop'),
  outlineList: $('outline-list'), outlineEmpty: $('outline-empty'), outlineToggle: $('outline-toggle'),
  cwd: $('cwd'), composer: $('composer'), status: $('status'), perm: $('perm'),
  title: $('session-title'), count: $('session-count'), list: $('session-list'), newSession: $('new-session'),
  replayFile: $('replay-file'), replayBtn: $('replay-btn'), errorBanner: $('error-banner'),
};

const state = {
  sessionId: null, // null = the next prompt starts a new session
  defaultCwd: '',
  busy: false,
  sessions: [],
};

// ------------------------------------------------------------------ small helpers

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function renderMarkdown(text) {
  const html = marked.parse(text || '', { gfm: true, breaks: false });
  return DOMPurify.sanitize(html); // the text comes from a model, so strip any script/HTML
}

function shortPath(p, cwd) {
  if (!p) return '';
  if (cwd && p.startsWith(cwd + '/')) return p.slice(cwd.length + 1);
  return p;
}

// "fe891e8a…": enough to tell sessions apart; the full id is in the tooltip.
function shortId(id) {
  return id ? id.slice(0, 8) + '…' : '';
}

function oneLine(s, max = 140) {
  const first = String(s || '').split('\n')[0];
  return first.length > max ? first.slice(0, max - 1) + '…' : first;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function timeAgo(iso) {
  const sec = Math.round((Date.now() - new Date(iso)) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

function nearBottom() {
  const t = els.transcript;
  return t.scrollHeight - t.scrollTop - t.clientHeight < 120;
}

function scrollDown(force) {
  if (force || nearBottom()) els.transcript.scrollTop = els.transcript.scrollHeight;
}

// ------------------------------------------------------------------ tool calls in plain words

// Turns a tool_use block into a short phrase a person would write. Each tool
// has two verbs: "doing" while it is pending (Running, Reading) and "done"
// once its result arrives (Ran, Read).
function describeTool(name, input = {}, cwd) {
  const file = shortPath(input.file_path || input.notebook_path || input.path, cwd);
  const d = (doing, done, target, code = false) => ({ doing, done, target, code });
  switch (name) {
    case 'Read':         return d('Reading', 'Read', file);
    case 'Write':        return d('Writing', 'Wrote', file);
    case 'Edit':
    case 'MultiEdit':    return d('Editing', 'Edited', file);
    case 'NotebookEdit': return d('Editing notebook', 'Edited notebook', file);
    case 'Bash':         return d('Running', 'Ran', oneLine(input.command), true);
    case 'Glob':         return d('Looking for files', 'Looked for files', input.pattern, true);
    case 'Grep':         return d('Searching for', 'Searched for', input.pattern, true);
    case 'WebSearch':    return d('Searching the web for', 'Searched the web for', input.query);
    case 'WebFetch':     return d('Opening', 'Opened', input.url);
    case 'Task':
    case 'Agent':        return d('Handing off to a subagent:', 'Handed off to a subagent:', input.description);
    case 'TodoWrite':    return d('Updating the to-do list', 'Updated the to-do list', '');
    case 'Skill':        return d('Using skill', 'Used skill', input.skill);
    default: {
      // Unknown tool: show its name and the first short string in its input.
      const firstString = Object.values(input).find((v) => typeof v === 'string');
      return d(name, name, oneLine(firstString || '', 100));
    }
  }
}

// ------------------------------------------------------------------ tool results (Feature 3)

const PREVIEW_LINES = 6;        // shown under a tool call by default
const ERROR_PREVIEW_LINES = 12; // more when something went wrong: that is when you read it
const EXPANDED_MAX_LINES = 500; // cap after unfolding, so a huge log cannot freeze the page
const LINE_MAX_CHARS = 300;     // one very long line (e.g. minified JSON) is cut too

// The text of a tool_result block (a string, or a list of content parts).
function resultText(block) {
  if (typeof block.content === 'string') return block.content;
  if (Array.isArray(block.content)) {
    return block.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  }
  return '';
}

function toLines(text, cls = '') {
  const t = String(text || '').replace(/\s+$/, '');
  return t ? t.split('\n').map((line) => ({ text: line, cls })) : [];
}

// Decides, per tool, which lines a result has and which end of them matters.
//   lines:     [{ text, cls }]
//   keep:      'head' (the start matters) or 'tail' (the end matters: logs, test runs)
//   summary:   a few words shown next to the tool call, e.g. "11 lines"
//   collapsed: show no preview at all, only the fold
//   error:     show in red and preview more lines
function resultView(toolName, block, extra) {
  if (block.is_error) {
    // Claude Code wraps some errors in <tool_use_error> tags; show just the message.
    const text = resultText(block).replace(/<\/?tool_use_error>/g, '');
    return { lines: toLines(text, 'err'), keep: 'head', error: true };
  }
  switch (toolName) {
    case 'Bash': {
      // Bash results carry stdout and stderr separately. Errors and test
      // summaries are at the end, so we keep the tail.
      if (extra && typeof extra.stdout === 'string') {
        const lines = [...toLines(extra.stdout), ...toLines(extra.stderr, 'err')];
        if (extra.interrupted) lines.push({ text: '(interrupted)', cls: 'err' });
        return { lines, keep: 'tail', error: Boolean((extra.stderr || '').trim()), empty: 'no output' };
      }
      return { lines: toLines(resultText(block)), keep: 'tail', empty: 'no output' };
    }
    case 'Read': {
      // The content is the file itself; a line count is enough unless you unfold it.
      const file = extra && extra.file;
      const lines = file && typeof file.content === 'string' ? toLines(file.content) : toLines(resultText(block));
      return { lines, keep: 'head', collapsed: true, summary: plural(lines.length, 'line') };
    }
    case 'Write':
    case 'Edit':
    case 'MultiEdit': {
      if (extra && Array.isArray(extra.structuredPatch) && extra.structuredPatch.length) {
        const lines = [];
        for (const hunk of extra.structuredPatch) {
          for (const text of hunk.lines) {
            lines.push({ text, cls: text.startsWith('+') ? 'add' : text.startsWith('-') ? 'del' : '' });
          }
        }
        const added = lines.filter((l) => l.cls === 'add').length;
        const removed = lines.filter((l) => l.cls === 'del').length;
        return { lines, keep: 'head', summary: `+${added} −${removed}` };
      }
      if (extra && extra.type === 'create' && typeof extra.content === 'string') {
        const lines = toLines(extra.content).map((l) => ({ text: '+' + l.text, cls: 'add' }));
        return { lines, keep: 'head', summary: `new file, ${plural(lines.length, 'line')}` };
      }
      return { lines: toLines(resultText(block)), keep: 'head' };
    }
    case 'Glob':
    case 'Grep': {
      let lines;
      if (extra && Array.isArray(extra.filenames) && typeof extra.content !== 'string') {
        lines = extra.filenames.map((text) => ({ text, cls: '' }));
      } else {
        lines = toLines(extra && typeof extra.content === 'string' ? extra.content : resultText(block));
      }
      return { lines, keep: 'head', summary: `${lines.length} ${lines.length === 1 ? 'match' : 'matches'}` };
    }
    default:
      return { lines: toLines(resultText(block)), keep: 'head' };
  }
}

function linesToPre(lines) {
  const pre = el('pre', 'output');
  for (const { text, cls } of lines) {
    const shown = text.length > LINE_MAX_CHARS
      ? `${text.slice(0, LINE_MAX_CHARS)}… (${text.length - LINE_MAX_CHARS} more characters)`
      : text;
    pre.appendChild(el('span', cls, shown + '\n'));
  }
  return pre;
}

// Builds the block under a tool call: a short preview plus a fold for the rest.
function renderResult(view) {
  const box = el('div', 'result' + (view.error ? ' error' : ''));
  const { lines } = view;
  if (!lines.length) {
    if (view.empty) box.appendChild(el('div', 'result-note', view.empty));
    return box.childNodes.length ? box : null;
  }

  const limit = view.error ? ERROR_PREVIEW_LINES : PREVIEW_LINES;
  let preview;
  if (view.collapsed) preview = [];
  else if (lines.length <= limit) preview = lines;
  else preview = view.keep === 'tail' ? lines.slice(-limit) : lines.slice(0, limit);
  const hidden = lines.length - preview.length;

  const previewPre = preview.length ? linesToPre(preview) : null;
  if (!hidden) {
    box.appendChild(previewPre);
    return box;
  }

  // The fold sits where the hidden lines are: above the preview when we kept
  // the tail (the hidden lines came earlier), below it when we kept the head.
  const label = view.collapsed
    ? `show ${plural(lines.length, 'line')}`
    : view.keep === 'tail'
      ? `${plural(hidden, 'earlier line')}, folded`
      : `${plural(hidden, 'more line')}, folded`;
  const fold = el('button', 'fold', `▸ ${label}`);
  fold.type = 'button';

  let full = null;
  fold.addEventListener('click', () => {
    const open = !full;
    if (open) {
      // Unfold: show everything up to EXPANDED_MAX_LINES, from the end that matters.
      const shown = lines.length > EXPANDED_MAX_LINES
        ? (view.keep === 'tail' ? lines.slice(-EXPANDED_MAX_LINES) : lines.slice(0, EXPANDED_MAX_LINES))
        : lines;
      full = linesToPre(shown);
      full.classList.add('full');
      if (lines.length > shown.length) {
        const note = el('div', 'result-note',
          `${plural(lines.length - shown.length, 'line')} not shown (${plural(lines.length, 'line')} in total)`);
        full = wrap(view.keep === 'tail' ? [note, full] : [full, note]);
      }
      if (previewPre) previewPre.replaceWith(full); else box.appendChild(full);
      if (view.keep === 'tail') {
        const pre = full.matches('pre') ? full : full.querySelector('pre');
        pre.scrollTop = pre.scrollHeight;
      }
      fold.textContent = '▾ fold';
    } else {
      if (previewPre) full.replaceWith(previewPre); else full.remove();
      full = null;
      fold.textContent = `▸ ${label}`;
    }
  });

  if (view.keep === 'tail') box.append(fold, ...(previewPre ? [previewPre] : []));
  else box.append(...(previewPre ? [previewPre] : []), fold);
  return box;
}

function wrap(nodes) {
  const div = el('div', 'full');
  div.append(...nodes);
  return div;
}

// ------------------------------------------------------------------ turn renderer
// One "turn" = one prompt and everything Claude did in response to it.
//
// Feature 7: the trajectory is a tree. Events from a subagent carry a
// parent_tool_use_id naming the Agent (or Task) call that spawned it, so they
// are drawn inside that call's collapsible box instead of in arrival order.
// Each turn also adds a section to the outline beside the dialogue.

const SUBAGENT_TOOLS = new Set(['Agent', 'Task']);

function seconds(ms) {
  return ms >= 60000 ? `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s` : `${(ms / 1000).toFixed(1)}s`;
}

class Turn {
  constructor(promptText, cwd, resumedId) {
    this.cwd = cwd || '';
    this.sessionId = resumedId || null;
    this.outcome = null; // how this run ended: { state: 'finished'|'failed'|'stopped', text }
    this.calls = new Map(); // tool_use id -> call (see addTool)
    this.tasks = new Map(); // background task id -> tool_use id of the Agent call
    this.stats = null;      // run numbers added up over every result event (see addFooter)

    this.root = el('article', 'turn');
    this.root.appendChild(el('div', 'you', promptText));
    // Feature 5: make it visible that a follow-up continues the same session.
    if (resumedId) {
      const tag = el('div', 'resumed', `resumed session ${shortId(resumedId)}`);
      tag.title = resumedId;
      this.root.appendChild(tag);
    }
    this.body = el('div', 'steps');
    this.root.appendChild(this.body);
    els.empty.hidden = true;
    els.transcript.appendChild(this.root);

    // Outline section: the prompt as a heading, then a flow chart of the calls.
    const section = el('li', 'outline-turn');
    const heading = el('button', 'outline-prompt', oneLine(promptText, 60));
    heading.type = 'button';
    heading.addEventListener('click', () => jumpTo(this.root));
    this.flowBox = el('div', 'flow-box');
    section.append(heading, this.flowBox);
    els.outlineList.appendChild(section);
    els.outlineEmpty.hidden = true;

    // The main agent's area. A subagent call gets its own (see addTool).
    // items: the calls made in this area, in order (drawn in the outline).
    this.main = { body: this.body, items: [] };
  }

  // Where an event belongs: inside the subagent call that spawned it, or the main area.
  areaFor(parentId) {
    const parent = parentId && this.calls.get(parentId);
    return parent && parent.area ? parent.area : this.main;
  }

  // Consecutive tool calls are grouped into one compact block.
  toolGroup(area) {
    const last = area.body.lastElementChild;
    if (last && last.classList.contains('tools')) return last;
    const group = el('div', 'tools');
    area.body.appendChild(group);
    return group;
  }

  addText(text, parentId) {
    if (!text.trim()) return;
    const area = this.areaFor(parentId);
    const div = el('div', 'say md');
    div.innerHTML = renderMarkdown(text);
    area.body.appendChild(div);
    if (area.call) area.call.lastText = div; // a subagent's last words are its conclusion
    this.bumpCount(area);
  }

  addTool(block, parentId, ts) {
    const area = this.areaFor(parentId);
    const d = describeTool(block.name, block.input, this.cwd);
    const row = el('div', 'tool pending');
    row.dataset.tool = block.name;
    const head = el('div', 'tool-head');
    head.appendChild(el('span', 'icon'));
    head.appendChild(el('span', 'verb', d.doing));
    if (d.target) head.appendChild(el(d.code ? 'code' : 'span', 'target', d.target));
    row.appendChild(head);
    this.toolGroup(area).appendChild(row);

    const call = {
      row, head, name: block.name, label: d.target ? `${block.name}: ${d.target}` : block.name,
      done: d.done, state: 'pending', startTs: Date.parse(ts) || null, endTs: null, parent: area.call || null,
    };
    this.calls.set(block.id, call);
    area.items.push(call);
    this.bumpCount(area);
    this.drawOutline();

    // A subagent call gets a collapsible box that its events are drawn into.
    if (SUBAGENT_TOOLS.has(block.name)) {
      row.classList.add('agent', 'open');
      const twisty = el('span', 'twisty');
      head.prepend(twisty);
      call.note = el('span', 'collapsed-note');
      head.appendChild(call.note);
      const sub = el('div', 'subtree');
      row.appendChild(sub);
      call.area = { body: sub, items: [], call };
      call.count = 0;
      head.addEventListener('click', () => {
        call.touched = true; // the user decided; don't auto-collapse it later
        this.setOpen(call, !row.classList.contains('open'));
      });
    }
  }

  // Counts what is inside each enclosing subagent box ("6 events collapsed").
  bumpCount(area) {
    for (let call = area.call; call; call = call.parent) {
      call.count += 1;
      call.note.textContent = `· ${plural(call.count, 'event')} collapsed`;
    }
  }

  setOpen(call, open) {
    call.row.classList.toggle('open', open);
  }

  setState(call, stateName, endTs) {
    call.row.classList.remove('pending');
    call.row.classList.add(stateName);
    call.state = stateName;
    if (stateName !== 'unknown') call.head.querySelector('.verb').textContent = call.done;
    if (call.startTs && endTs && endTs >= call.startTs) call.endTs = endTs;
    this.drawOutline();
  }

  // ---- the outline as a flow chart (Feature 7)
  // Calls run down a centre line. Subagents that ran at the same time split
  // the line into side-by-side branches, each with its own calls below it,
  // and the branches join again before the next call. Redrawn on each change
  // (at most once per frame); the outline is small, so this is cheap.
  drawOutline() {
    if (this.drawPending) return;
    this.drawPending = true;
    requestAnimationFrame(() => {
      this.drawPending = false;
      this.flowBox.replaceChildren(this.flow(this.main.items));
      if (state.busy) {
        const pending = this.flowBox.querySelectorAll('.chip.pending');
        const live = pending[pending.length - 1];
        if (live) live.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    });
  }

  flow(items) {
    const flow = el('div', 'flow');
    for (let i = 0; i < items.length;) {
      if (!items[i].area) {
        flow.appendChild(this.chip(items[i]));
        i += 1;
        continue;
      }
      // Subagents next to each other that overlapped in time form one fork.
      const group = [items[i]];
      let j = i + 1;
      while (j < items.length && items[j].area && overlaps(group, items[j])) group.push(items[j++]);
      const fork = el('div', 'fork' + (group.length > 1 ? ' parallel' : ''));
      for (const agent of group) {
        const branch = el('div', 'branch');
        branch.append(el('div', 'stub'), this.chip(agent));
        if (agent.area.items.length) branch.appendChild(this.flow(agent.area.items));
        branch.appendChild(el('div', 'tail'));
        fork.appendChild(branch);
      }
      flow.appendChild(fork);
      i = j;
    }
    return flow;
  }

  chip(call) {
    const chip = el('button', `chip ${call.state}${call.area ? ' agent' : ''}`);
    chip.type = 'button';
    chip.title = call.label + (call.endTs ? ` (${seconds(call.endTs - call.startTs)})` : '');
    chip.append(el('span', 'icon'), el('span', 'chip-name', call.name));
    if (call.endTs) chip.appendChild(el('span', 'dur', seconds(call.endTs - call.startTs)));
    chip.addEventListener('click', () => this.reveal(call));
    return chip;
  }

  // The result appears right under its tool call (matched by tool_use_id).
  addResult(block, extra, ts) {
    const call = this.calls.get(block.tool_use_id);
    if (!call) return;
    if (call.area) {
      // A subagent that runs in the background answers at once with
      // "Async agent launched"; it is really done when a task_notification
      // arrives. A foreground subagent's result is its report.
      if (extra && extra.isAsync && !block.is_error) return;
      this.finishAgent(call, block.is_error ? 'failed' : 'ok', resultText(block), Date.parse(ts));
      return;
    }
    this.setState(call, block.is_error ? 'failed' : 'ok', Date.parse(ts));
    const view = resultView(call.row.dataset.tool, block, extra);
    if (view.summary) call.head.appendChild(el('span', 'meta', view.summary));
    const box = renderResult(view);
    if (box) call.row.appendChild(box);
  }

  // A subagent finished: mark it, fold its box, and keep its conclusion visible.
  finishAgent(call, stateName, summary, endTs) {
    if (!call.row.classList.contains('pending')) return;
    this.setState(call, stateName, endTs);
    const conclusion = el('div', 'agent-summary md');
    if (call.lastText) {
      conclusion.innerHTML = call.lastText.innerHTML; // its last message, moved out of the box
      call.lastText.remove();
      call.count -= 1;
      call.note.textContent = `· ${plural(call.count, 'event')} collapsed`;
    } else if (summary) {
      conclusion.innerHTML = renderMarkdown(summary);
    }
    if (conclusion.innerHTML) call.row.appendChild(conclusion);
    if (!call.touched) this.setOpen(call, false);
  }

  // Background subagent bookkeeping (system events task_started / task_updated / task_notification).
  taskEvent(event) {
    if (event.subtype === 'task_started' && event.task_id && event.tool_use_id) {
      this.tasks.set(event.task_id, event.tool_use_id);
      return;
    }
    const callId = event.tool_use_id || this.tasks.get(event.task_id);
    const call = callId && this.calls.get(callId);
    if (!call) return;
    if (event.subtype === 'task_updated' && event.patch && event.patch.end_time) {
      call.endTs = event.patch.end_time;
    }
    if (event.subtype === 'task_notification' && event.status && event.status !== 'running') {
      this.finishAgent(call, event.status === 'completed' ? 'ok' : 'failed', event.summary, call.endTs || null);
    }
  }

  // Jumps from the outline to a call, opening any folded subagent boxes around it.
  reveal(call) {
    for (let c = call.parent; c; c = c.parent) this.setOpen(c, true);
    jumpTo(call.row);
  }

  // One run can end with several result events: a main agent that started
  // background subagents ends a round, and is woken again as each one
  // reports back. The footer shows the whole run, so we add them up.
  addFooter(result) {
    const since = result.model_usage_since_last_result;
    const cost = since
      ? Object.values(since).reduce((sum, m) => sum + (m.costUSD || 0), 0)
      : (this.stats ? 0 : result.total_cost_usd); // total_cost_usd counts the whole session
    if (!this.stats) {
      this.stats = { steps: 0, ms: 0, cost: 0, error: false };
      this.footer = el('div', 'footer');
      this.body.appendChild(this.footer);
    }
    const s = this.stats;
    s.steps += result.num_turns || 0;
    s.ms += result.duration_ms || 0;
    if (typeof cost === 'number') s.cost += cost;
    s.error = s.error || Boolean(result.is_error);
    s.sessionId = result.session_id || s.sessionId;

    // Keep the footer last, below anything the later rounds added.
    this.body.appendChild(this.footer);
    this.footer.className = 'footer' + (s.error ? ' bad' : '');
    this.footer.textContent = [
      s.error ? 'Stopped with an error' : 'Done',
      plural(s.steps, 'step'),
      `${(s.ms / 1000).toFixed(1)} s`,
      `≈ $${s.cost.toFixed(3)}`,
    ].join(' · ');
    if (s.sessionId) {
      const sid = el('span', 'sid', `session ${shortId(s.sessionId)}`);
      sid.title = s.sessionId;
      this.footer.append(' · ', sid);
    }
    if (result.is_error) {
      if (result.result) this.addError(result.result);
      this.outcome = { state: 'failed', text: 'agent error' };
    } else if (!s.error) {
      this.outcome = { state: 'finished', text: `${plural(s.steps, 'step')} · ${(s.ms / 1000).toFixed(1)} s` };
    }
  }

  addStopped() {
    this.body.appendChild(el('div', 'footer', 'Stopped by you'));
    this.outcome = { state: 'stopped', text: '' };
  }

  // A failure the page itself detected (bad folder, lost connection...).
  fail(reason, message, detail) {
    this.addError(message, detail);
    this.outcome = { state: 'failed', text: reason };
  }

  addError(message, detail) {
    const box = el('div', 'error-box', message);
    if (detail) box.appendChild(el('pre', 'output', detail));
    this.body.appendChild(box);
  }

  // Calls that never got a result (e.g. the run was cut off) get a "?".
  finish() {
    for (const call of this.calls.values()) {
      if (call.row.classList.contains('pending')) this.setState(call, 'unknown');
    }
  }
}

// Did this subagent start before any agent of the group had finished?
function overlaps(group, next) {
  if (!next.startTs) return true;
  return group.some((g) => !g.endTs || next.startTs < g.endTs);
}

// Scrolls the dialogue to an element and flashes it.
function jumpTo(node) {
  node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  node.classList.remove('flash');
  void node.offsetWidth; // restart the animation
  node.classList.add('flash');
  document.body.classList.remove('outline-open'); // on a narrow window, close the outline
}

function clearOutline() {
  els.outlineList.innerHTML = '';
  els.outlineEmpty.hidden = false;
}

// Routes one stream event to the current turn. Returns the (possibly new) turn.
function handleEvent(event, turn) {
  switch (event.type) {
    case '_prompt': {
      if (turn) turn.finish();
      // Live runs say which session they resume. In a saved session every
      // prompt after the first one resumed it too, so we can tell from the
      // previous turn (prompts saved before this field existed).
      const resumedId = event.resumed || (turn && turn.sessionId) || null;
      return new Turn(event.text, event.cwd, resumedId);
    }

    case 'system':
      if (turn && event.session_id) turn.sessionId = event.session_id;
      if (event.subtype === 'init' && event.permissionMode) {
        els.perm.textContent = event.permissionMode === 'bypassPermissions'
          ? 'auto-approve on' : `permissions: ${event.permissionMode}`;
      }
      if (turn && event.cwd && !turn.cwd) turn.cwd = event.cwd;
      if (turn && /^task_/.test(event.subtype || '')) turn.taskEvent(event);
      return turn;

    case 'assistant': {
      if (!turn) turn = new Turn('(no prompt recorded)');
      const parentId = event.parent_tool_use_id || null; // set on events from inside a subagent
      for (const block of event.message?.content || []) {
        if (block.type === 'text') turn.addText(block.text, parentId);
        else if (block.type === 'tool_use') turn.addTool(block, parentId, event.timestamp);
      }
      return turn;
    }

    case 'user': // tool results come back as "user" messages
      if (!turn) return turn;
      for (const block of Array.isArray(event.message?.content) ? event.message.content : []) {
        if (block.type === 'tool_result') turn.addResult(block, event.tool_use_result, event.timestamp);
      }
      return turn;

    case 'result':
      if (turn) turn.addFooter(event);
      return turn;

    case '_error':
      if (!turn) turn = new Turn('(error)');
      turn.fail('claude did not finish', event.message, event.stderr);
      return turn;

    case '_stopped':
      if (!turn) turn = new Turn('(stopped)');
      turn.addStopped();
      return turn;

    case '_done':
      if (turn) turn.finish();
      return turn;

    default:
      return turn; // rate_limit_event and anything unknown: nothing to show
  }
}

// ------------------------------------------------------------------ streaming

// POSTs a request and calls onEvent for every JSON line as soon as it arrives.
// Errors it throws carry a kind:
//   'unreachable' the server could not be reached at all
//   'refused'     the server said no before starting (err.runFailed: the run itself failed, e.g. bad folder)
//   'lost'        the stream broke off in the middle
async function streamEvents(url, body, onEvent, signal) {
  const fail = (kind, message, extra = {}) => Object.assign(new Error(message), { kind }, extra);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw fail('unreachable', 'Could not reach the server. Is `node server.js` still running?');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw fail('refused', err.error || `Request failed (${res.status})`, { runFailed: Boolean(err.runFailed) });
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  const emit = (line) => {
    if (!line.trim()) return;
    try { onEvent(JSON.parse(line)); } catch (e) { console.warn('Bad line', line, e); }
  };
  for (;;) {
    let chunk;
    try {
      chunk = await reader.read();
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw fail('lost', 'The connection to the server was lost before the run finished.');
    }
    const { value, done } = chunk;
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      emit(buf.slice(0, i));
      buf = buf.slice(i + 1);
    }
  }
  emit(buf);
}

// ------------------------------------------------------------------ run status (top bar)
// Per-run status lives in the top bar: idle, running (with a clock), finished,
// failed, or stopped. Per-tool status lives on each tool row.

const NO_ACTIVITY_MS = 2 * 60 * 1000; // warn when nothing has arrived for 2 minutes

function setStatus(kind, text, title) {
  els.status.className = 'status ' + kind;
  els.status.textContent = text;
  els.status.title = title || '';
}

function clock(ms) {
  const sec = Math.floor(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

// While running, the top bar shows how long the run has taken and warns when
// no new event has arrived for a while (claude may be stuck, or just busy).
function startClock(startedAt, note = '') {
  stopClock();
  state.startedAt = startedAt;
  state.lastEventAt = Date.now();
  const tick = () => {
    let text = `running · ${clock(Date.now() - state.startedAt)}`;
    const quiet = Date.now() - state.lastEventAt;
    if (quiet >= NO_ACTIVITY_MS) text += ` · no activity for ${Math.floor(quiet / 60000)} min`;
    if (note) text += ` · ${note}`;
    setStatus(quiet >= NO_ACTIVITY_MS ? 'running quiet' : 'running', text,
      quiet >= NO_ACTIVITY_MS ? 'Nothing new has arrived for a while. You can wait, or press Stop.' : '');
  };
  tick();
  state.timer = setInterval(tick, 1000);
}

function stopClock() {
  clearInterval(state.timer);
  state.timer = null;
}

// Shows how a run ended (a Turn's outcome) in the top bar.
function showOutcome(outcome) {
  stopClock();
  if (!outcome) return setStatus('idle', 'idle');
  if (outcome.state === 'finished') return setStatus('finished', `✓ finished · ${outcome.text}`);
  if (outcome.state === 'stopped') return setStatus('stopped', '■ stopped');
  return setStatus('failed', `✗ failed${outcome.text ? ' · ' + outcome.text : ''}`);
}

function setBusy(busy) {
  state.busy = busy;
  els.send.hidden = busy;
  els.stop.hidden = !busy;
  els.stop.disabled = false;
  els.stop.textContent = 'Stop';
  els.prompt.disabled = busy;
  els.replayBtn.disabled = busy;
  els.newSession.disabled = busy;
  els.list.classList.toggle('locked', busy);
}

function showError(message) {
  els.errorBanner.textContent = message;
  els.errorBanner.hidden = !message;
}

// Runs one prompt (or a replay) and keeps both status levels up to date.
// Returns { done, outcome }: done is the _done event if the run ended normally.
async function run(url, body, promptText) {
  showError('');
  setBusy(true);
  startClock(Date.now());
  state.controller = new AbortController();
  let turn = null;
  let done = null;
  try {
    await streamEvents(url, body, (event) => {
      state.lastEventAt = Date.now();
      if (event.type === '_done') done = event;
      turn = handleEvent(event, turn);
      scrollDown(event.type === '_prompt');
    }, state.controller.signal);
    if (!done) {
      throw Object.assign(new Error('The connection to the server was lost before the run finished.'), { kind: 'lost' });
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      // Only replays are stopped this way; real runs are stopped on the server.
      if (turn && !turn.outcome) turn.addStopped();
    } else if (e.kind === 'refused' && !e.runFailed) {
      // e.g. "a run is already in progress": nothing ran, so nothing goes in the transcript.
      showError(e.message);
    } else {
      // The run failed: it belongs in the transcript, with its prompt and the reason.
      if (!turn) turn = new Turn(promptText || '(request)', body.cwd);
      const reason = { refused: 'bad working directory', unreachable: 'server unreachable', lost: 'connection lost' }[e.kind];
      turn.fail(reason || 'error', e.message);
    }
  } finally {
    if (turn) turn.finish();
    setBusy(false);
    showOutcome(turn && turn.outcome);
    if (!turn && !done) setStatus('idle', 'idle');
    scrollDown(true);
    els.prompt.focus();
  }
  return { done, outcome: turn && turn.outcome };
}

async function stopRun() {
  els.stop.disabled = true;
  els.stop.textContent = 'Stopping…';
  if (state.mode === 'replay') return state.controller.abort();
  const res = await fetch('/api/stop', { method: 'POST' }).catch(() => null);
  // If the server can't be told, at least stop listening.
  if (!res || !res.ok) state.controller?.abort();
}

// ------------------------------------------------------------------ sessions

function clearTranscript() {
  els.transcript.querySelectorAll('.turn').forEach((n) => n.remove());
  els.empty.hidden = false;
  clearOutline();
}

function updateHeader() {
  const s = state.sessions.find((x) => x.id === state.sessionId);
  els.title.textContent = s ? s.title : 'New session';
  els.count.textContent = s ? `${plural(s.runs, 'prompt')} · ${plural(s.turns, 'turn')} in total` : '';
  els.count.title = 'Totals for this session. Turns = all steps of all prompts added up.';
  els.cwd.value = s ? s.cwd : (els.cwd.value || state.defaultCwd);
  // A session can only be resumed in the folder it started in.
  els.cwd.disabled = Boolean(s);
  els.cwd.title = s ? 'Fixed for this session. Start a new session to use another folder.' : '';
}

async function loadSessions() {
  const list = await fetch('/api/sessions').then((r) => r.json()).catch(() => null);
  if (!list) return; // server unreachable: keep showing the list we have
  state.sessions = list;
  els.list.innerHTML = '';
  for (const s of state.sessions) {
    const li = el('li', s.id === state.sessionId ? 'active' : '');
    const btn = el('button');
    btn.type = 'button';
    btn.appendChild(el('span', 'session-name', s.title));
    btn.appendChild(el('span', 'session-meta',
      `${timeAgo(s.updatedAt)} · ${plural(s.runs, 'prompt')} · ${plural(s.turns, 'turn')}`));
    btn.title = `${s.id}\n${s.cwd}`;
    btn.addEventListener('click', () => !state.busy && openSession(s.id));
    li.appendChild(btn);
    els.list.appendChild(li);
  }
}

// Re-draws a saved session. Returns its last turn so the caller can show its status.
async function openSession(id) {
  const data = await fetch(`/api/sessions/${id}`).then((r) => r.json());
  if (data.error) return showError(data.error);
  state.sessionId = id;
  clearTranscript();
  let turn = null;
  for (const event of data.events) turn = handleEvent(event, turn);
  if (turn) turn.finish();
  await loadSessions();
  updateHeader();
  scrollDown(true);
  // The top bar shows how this session's latest run ended.
  if (!state.busy) {
    if (turn && !turn.outcome) showOutcome({ state: 'failed', text: 'did not finish' });
    else showOutcome(turn && turn.outcome);
  }
  return turn;
}

function newSession() {
  state.sessionId = null;
  clearTranscript();
  els.cwd.value = state.defaultCwd;
  loadSessions();
  updateHeader();
  showOutcome(null);
  els.prompt.focus();
}

// A run that started before this page loaded (e.g. you reloaded mid-run).
// We can't re-attach to its stream, so we show it as running, allow Stop,
// and redraw the session once the server reports it has ended.
function watchRunningElsewhere(run) {
  setBusy(true);
  state.mode = 'run';
  startClock(run.startedAt, 'started before this page loaded');
  const poll = setInterval(async () => {
    const config = await fetch('/api/config').then((r) => r.json()).catch(() => null);
    if (!config) return;
    if (config.run) {
      state.lastEventAt = Date.now(); // still alive on the server
      return;
    }
    clearInterval(poll);
    setBusy(false);
    await loadSessions();
    const id = run.sessionId || (state.sessions[0] && state.sessions[0].id);
    if (id) await openSession(id);
    else showOutcome(null);
  }, 2000);
}

// ------------------------------------------------------------------ wiring

els.composer.addEventListener('submit', async (e) => {
  e.preventDefault();
  const prompt = els.prompt.value.trim();
  if (!prompt || state.busy) return;
  els.prompt.value = '';
  state.mode = 'run';
  const { done, outcome } = await run('/api/run', { prompt, cwd: els.cwd.value, sessionId: state.sessionId }, prompt);
  if (done && done.sessionId) state.sessionId = done.sessionId; // keep talking in this session
  else if (!done && !outcome) els.prompt.value = prompt; // refused before running: give the text back
  await loadSessions();
  updateHeader();
});

els.prompt.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { // isComposing: Chinese IME
    e.preventDefault();
    els.composer.requestSubmit();
  }
});

els.stop.addEventListener('click', stopRun);
// On a narrow window the outline folds away behind this button.
els.outlineToggle.addEventListener('click', () => document.body.classList.toggle('outline-open'));
els.newSession.addEventListener('click', newSession);

els.replayBtn.addEventListener('click', async () => {
  if (!els.replayFile.value) return;
  state.mode = 'replay';
  await run('/api/replay', { file: els.replayFile.value, delayMs: 600 });
});

(async function init() {
  const config = await fetch('/api/config').then((r) => r.json());
  state.defaultCwd = config.defaultCwd;
  els.cwd.value = config.defaultCwd;
  for (const f of config.replays) els.replayFile.appendChild(el('option', '', f)).value = f;
  els.replayBtn.disabled = !config.replays.length;
  await loadSessions();
  if (config.run) {
    if (config.run.sessionId && state.sessions.some((s) => s.id === config.run.sessionId)) {
      await openSession(config.run.sessionId);
    } else {
      newSession();
    }
    watchRunningElsewhere(config.run);
  } else if (state.sessions.length) {
    // By default, keep working in the most recent session.
    await openSession(state.sessions[0].id);
  } else {
    updateHeader();
  }
  els.prompt.focus();
})();
