'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/app');
const { computeCarrierStats, computeStats, onTimeRate } = require('../src/stats');

// initialContent: optional raw text written to the data file before the server starts.
// Omitted means the store seeds its own 20 shipments on first read.
async function withServer(fn, initialContent) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carriers-'));
  const dataFile = path.join(dir, 'shipments.json');
  if (initialContent !== undefined) fs.writeFileSync(dataFile, initialContent);
  const server = createApp(dataFile).listen(0);
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

const ship = (id, carrier, status) => ({
  id,
  origin: 'A',
  destination: 'B',
  status,
  eta: '2026-12-01',
  carrier,
});

test('GET /api/carriers returns a bare array of { carrier, total, delayed, onTimeRate }', () =>
  withServer(async (base) => {
    // Arrange
    const res = await fetch(`${base}/api/carriers`);

    // Act
    const rows = await res.json();

    // Assert
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(rows));
    assert.equal(rows.length, 5);
    for (const row of rows) {
      assert.deepEqual(Object.keys(row).sort(), ['carrier', 'delayed', 'onTimeRate', 'total']);
    }
  }));

test('GET /api/carriers seed totals sum to 20 and match /api/stats', () =>
  withServer(async (base) => {
    const rows = await (await fetch(`${base}/api/carriers`)).json();
    const stats = await (await fetch(`${base}/api/stats`)).json();

    const totalSum = rows.reduce((sum, r) => sum + r.total, 0);
    const delayedSum = rows.reduce((sum, r) => sum + r.delayed, 0);

    assert.equal(totalSum, 20);
    assert.equal(totalSum, stats.total);
    assert.equal(delayedSum, stats.delayed);
  }));

test('GET /api/carriers orders onTimeRate asc, then carrier by code point', () =>
  withServer(async (base) => {
    const rows = await (await fetch(`${base}/api/carriers`)).json();

    // Seed: USPS is 0% (worst first); the four 100% carriers tie and sort by code point.
    assert.deepEqual(rows.map((r) => r.carrier), ['USPS', 'DHL', 'FedEx', 'Maersk', 'UPS']);
  }));

test('computeCarrierStats orders ties by code point, not locale (case-sensitive)', () => {
  // Arrange: 'B' and 'a' tie at 50%; localeCompare would put 'a' first, code point puts 'B' first.
  const shipments = [
    ship('1', 'B', 'delayed'), ship('2', 'B', 'delivered'),
    ship('3', 'a', 'delayed'), ship('4', 'a', 'delivered'),
    ship('5', 'C', 'delayed'), ship('6', 'C', 'delayed'),
    ship('7', 'A', 'delivered'),
  ];

  // Act
  const rows = computeCarrierStats(shipments);

  // Assert
  assert.deepEqual(rows.map((r) => r.carrier), ['C', 'B', 'a', 'A']);
  assert.deepEqual(rows.map((r) => r.onTimeRate), [0, 50, 50, 100]);
});

test('computeCarrierStats groups by exact carrier string (case-sensitive, no trimming)', () => {
  const shipments = [
    ship('1', 'FedEx', 'delivered'),
    ship('2', 'fedex', 'delayed'),
    ship('3', 'FedEx ', 'delivered'),
    ship('4', 'FedEx', 'delayed'),
  ];

  const rows = computeCarrierStats(shipments);
  const byName = Object.fromEntries(rows.map((r) => [JSON.stringify(r.carrier), r]));

  assert.equal(rows.length, 3);
  assert.deepEqual(byName['"FedEx"'], { carrier: 'FedEx', total: 2, delayed: 1, onTimeRate: 50 });
  assert.deepEqual(byName['"fedex"'], { carrier: 'fedex', total: 1, delayed: 1, onTimeRate: 0 });
  assert.deepEqual(byName['"FedEx "'], { carrier: 'FedEx ', total: 1, delayed: 0, onTimeRate: 100 });
});

test('computeCarrierStats returns [] for no shipments', () => {
  assert.deepEqual(computeCarrierStats([]), []);
});

test('GET /api/carriers returns 200 [] when the data file contains []', () =>
  withServer(async (base) => {
    const res = await fetch(`${base}/api/carriers`);

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
  }, '[]'));

test('onTimeRate has one decimal and stays within 0-100', () => {
  assert.equal(onTimeRate(3, 1), 66.7);
  assert.equal(onTimeRate(7, 2), 71.4);
  assert.equal(onTimeRate(1, 1), 0);
  assert.equal(onTimeRate(1, 0), 100);

  // Every carrier row stays within 0-100 with at most one decimal place.
  const shipments = Array.from({ length: 37 }, (_, i) =>
    ship(`SH-${i}`, `C${i % 4}`, i % 3 === 0 ? 'delayed' : 'delivered'));
  for (const row of computeCarrierStats(shipments)) {
    assert.ok(row.onTimeRate >= 0 && row.onTimeRate <= 100, `out of range: ${row.onTimeRate}`);
    assert.equal(Math.round(row.onTimeRate * 10) / 10, row.onTimeRate);
  }
});

test('onTimeRate(0, 0) is 0 (no division by zero)', () => {
  assert.equal(onTimeRate(0, 0), 0);
});

test('GET /api/carriers refreshes live after POST and PATCH status -> delayed', () =>
  withServer(async (base) => {
    const before = await (await fetch(`${base}/api/carriers`)).json();
    const fedexBefore = before.find((r) => r.carrier === 'FedEx');
    assert.deepEqual(fedexBefore, { carrier: 'FedEx', total: 4, delayed: 0, onTimeRate: 100 });

    // POST a new carrier: appears immediately.
    const created = await fetch(`${base}/api/shipments`, json('POST', {
      origin: 'A', destination: 'B', carrier: 'Zeta', eta: '2026-12-01',
    }));
    assert.equal(created.status, 201);
    const afterPost = await (await fetch(`${base}/api/carriers`)).json();
    assert.deepEqual(afterPost.find((r) => r.carrier === 'Zeta'),
      { carrier: 'Zeta', total: 1, delayed: 0, onTimeRate: 100 });

    // PATCH SH-1001 (FedEx, seeded delivered) to delayed: FedEx drops to 75%.
    const patched = await fetch(`${base}/api/shipments/SH-1001`, json('PATCH', { status: 'delayed' }));
    assert.equal(patched.status, 200);
    const afterPatch = await (await fetch(`${base}/api/carriers`)).json();
    assert.deepEqual(afterPatch.find((r) => r.carrier === 'FedEx'),
      { carrier: 'FedEx', total: 4, delayed: 1, onTimeRate: 75 });
  }));

test('GET /api/carriers returns 500 with internal server error when the data file is corrupt', () =>
  withServer(async (base) => {
    const res = await fetch(`${base}/api/carriers`);

    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { errors: ['internal server error'] });
  }, '{not valid json'));

test('/api/stats and /api/carriers agree on totals and on-time rate', () =>
  withServer(async (base) => {
    const shipments = await (await fetch(`${base}/api/shipments`)).json();
    const rows = await (await fetch(`${base}/api/carriers`)).json();
    const stats = await (await fetch(`${base}/api/stats`)).json();

    const total = rows.reduce((sum, r) => sum + r.total, 0);
    const delayed = rows.reduce((sum, r) => sum + r.delayed, 0);
    assert.equal(total, stats.total);
    assert.equal(delayed, stats.delayed);
    assert.equal(onTimeRate(total, delayed), stats.onTimeRate);
    assert.deepEqual(computeStats(shipments), stats);
  }));
