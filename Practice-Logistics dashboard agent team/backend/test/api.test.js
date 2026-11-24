'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/app');

async function withServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-'));
  const server = createApp(path.join(dir, 'shipments.json')).listen(0);
  const base = `http://localhost:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

test('GET /api/shipments returns 20 seeded shipments with contract shape', () =>
  withServer(async (base) => {
    const list = await (await fetch(`${base}/api/shipments`)).json();
    assert.equal(list.length, 20);
    assert.deepEqual(Object.keys(list[0]).sort(), ['carrier', 'destination', 'eta', 'id', 'origin', 'status']);
  }));

test('GET /api/stats returns contract shape and consistent counts', () =>
  withServer(async (base) => {
    const stats = await (await fetch(`${base}/api/stats`)).json();
    assert.deepEqual(Object.keys(stats).sort(), ['delayed', 'inTransit', 'onTimeRate', 'total']);
    assert.equal(stats.total, 20);
  }));

test('POST creates shipment, rejects invalid input', () =>
  withServer(async (base) => {
    const ok = await fetch(`${base}/api/shipments`, json('POST', {
      origin: 'A', destination: 'B', carrier: 'UPS', eta: '2026-12-01',
    }));
    assert.equal(ok.status, 201);
    const created = await ok.json();
    assert.equal(created.status, 'in_transit');
    assert.equal((await (await fetch(`${base}/api/shipments`)).json()).length, 21);

    const bad = await fetch(`${base}/api/shipments`, json('POST', { origin: 'A', status: 'lost' }));
    assert.equal(bad.status, 400);
  }));

test('PATCH updates status, 404 on unknown id, 400 on bad status', () =>
  withServer(async (base) => {
    const res = await fetch(`${base}/api/shipments/SH-1001`, json('PATCH', { status: 'delayed', id: 'X' }));
    const updated = await res.json();
    assert.equal(updated.status, 'delayed');
    assert.equal(updated.id, 'SH-1001');
    assert.equal((await fetch(`${base}/api/shipments/nope`, json('PATCH', { status: 'delayed' }))).status, 404);
    assert.equal((await fetch(`${base}/api/shipments/SH-1001`, json('PATCH', { status: 'x' }))).status, 400);
  }));
