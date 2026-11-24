'use strict';

// onTimeRate: percent (0-100, 1 decimal) of shipments not delayed.
// Shared by /api/stats and /api/carriers. total === 0 yields 0.
function onTimeRate(total, delayed) {
  return total === 0 ? 0 : Math.round(((total - delayed) / total) * 1000) / 10;
}

function computeStats(shipments) {
  const total = shipments.length;
  const delayed = shipments.filter((s) => s.status === 'delayed').length;
  const inTransit = shipments.filter((s) => s.status === 'in_transit').length;
  return { total, onTimeRate: onTimeRate(total, delayed), inTransit, delayed };
}

// One row per exact carrier string; onTimeRate asc, then carrier A-Z by code point.
function computeCarrierStats(shipments) {
  const groups = new Map();
  for (const s of shipments) {
    const g = groups.get(s.carrier) || { carrier: s.carrier, total: 0, delayed: 0 };
    g.total += 1;
    if (s.status === 'delayed') g.delayed += 1;
    groups.set(s.carrier, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, onTimeRate: onTimeRate(g.total, g.delayed) }))
    .sort((a, b) => {
      if (a.onTimeRate !== b.onTimeRate) return a.onTimeRate - b.onTimeRate;
      if (a.carrier === b.carrier) return 0;
      return a.carrier < b.carrier ? -1 : 1;
    });
}

module.exports = { computeStats, computeCarrierStats, onTimeRate };
