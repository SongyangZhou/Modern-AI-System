'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/app');
const { computeStats } = require('../src/stats');
const { validateCreate, validateUpdate } = require('../src/validate');

async function withServer(fn, seed) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-cov-'));
  const file = path.join(dir, 'shipments.json');
  if (seed !== undefined) fs.writeFileSync(file, seed);
  const server = createApp(file).listen(0);
  const base = `http://localhost:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const send = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('computeStats returns zero rate for empty list', () => {
  assert.deepEqual(computeStats([]), { total: 0, onTimeRate: 0, inTransit: 0, delayed: 0 });
});

test('computeStats rounds on-time rate to one decimal', () => {
  const list = [{ status: 'delayed' }, { status: 'in_transit' }, { status: 'delivered' }];
  assert.equal(computeStats(list).onTimeRate, 66.7);
});

test('validateCreate handles missing body and trims strings', () => {
  assert.equal(validateCreate(undefined).errors.length, 4);
  assert.equal(validateCreate(null).errors.length, 4);
  const ok = validateCreate({ origin: ' A ', destination: 'B', carrier: 'C', eta: '2026-01-02' });
  assert.equal(ok.value.origin, 'A');
});

test('validateUpdate rejects empty, accepts partial, flags bad fields', () => {
  assert.match(validateUpdate({}).errors[0], /provide at least one/);
  assert.match(validateUpdate(undefined).errors[0], /provide at least one/);
  assert.match(validateUpdate({ id: 'X' }).errors[0], /provide at least one/);
  assert.deepEqual(validateUpdate({ carrier: ' DHL ' }).value, { carrier: 'DHL' });
  assert.match(validateUpdate({ eta: '2026-13-45' }).errors[0], /YYYY-MM-DD/);
  assert.match(validateUpdate({ eta: 20260101 }).errors[0], /YYYY-MM-DD/);
  assert.match(validateUpdate({ origin: '  ' }).errors[0], /non-empty/);
});

test('OPTIONS preflight returns 204 with CORS headers', () =>
  withServer(async (base) => {
    const res = await fetch(`${base}/api/shipments`, { method: 'OPTIONS' });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
  }));

test('PATCH with empty body returns 400', () =>
  withServer(async (base) => {
    const res = await fetch(`${base}/api/shipments/SH-1001`, send('PATCH', {}));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).errors.length, 1);
  }));

test('malformed JSON body returns 400', () =>
  withServer(async (base) => {
    const res = await fetch(`${base}/api/shipments`, send('POST', '{bad'));
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { errors: ['invalid JSON body'] });
  }));

test('unexpected store failure returns 500', () =>
  withServer(async (base) => {
    const original = console.error;
    console.error = () => {};
    try {
      const res = await fetch(`${base}/api/shipments`);
      assert.equal(res.status, 500);
      assert.deepEqual(await res.json(), { errors: ['internal server error'] });
    } finally {
      console.error = original;
    }
  }, '{not json'));

test('id generation skips non-numeric ids and continues from max', () =>
  withServer(async (base) => {
    const res = await fetch(`${base}/api/shipments`, send('POST', {
      origin: 'A', destination: 'B', carrier: 'UPS', eta: '2026-12-01',
    }));
    assert.equal((await res.json()).id, 'SH-1006');
  }, JSON.stringify([
    { id: 'weird', origin: 'x', destination: 'y', carrier: 'z', status: 'delivered', eta: '2026-01-01' },
    { id: 'SH-1005', origin: 'x', destination: 'y', carrier: 'z', status: 'delivered', eta: '2026-01-01' },
    { id: 'SH-0500', origin: 'x', destination: 'y', carrier: 'z', status: 'delivered', eta: '2026-01-01' },
  ])));
