'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildSeedShipments } = require('./seed');

function createStore(filePath) {
  function load() {
    if (!fs.existsSync(filePath)) {
      save(buildSeedShipments());
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  function save(shipments) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(shipments, null, 2));
    fs.renameSync(tmp, filePath);
  }

  function nextId(shipments) {
    const max = shipments.reduce((m, s) => {
      const n = Number(String(s.id).replace('SH-', ''));
      return Number.isFinite(n) && n > m ? n : m;
    }, 1000);
    return `SH-${max + 1}`;
  }

  return {
    list: () => load(),
    create(fields) {
      const shipments = load();
      const shipment = { id: nextId(shipments), ...fields };
      save([...shipments, shipment]);
      return shipment;
    },
    update(id, fields) {
      const shipments = load();
      const existing = shipments.find((s) => s.id === id);
      if (!existing) return null;
      const updated = { ...existing, ...fields, id: existing.id };
      save(shipments.map((s) => (s.id === id ? updated : s)));
      return updated;
    },
  };
}

module.exports = { createStore };
