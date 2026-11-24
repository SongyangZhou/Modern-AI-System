'use strict';

const CARRIERS = ['FedEx', 'UPS', 'DHL', 'USPS', 'Maersk'];
const CITIES = [
  'New York, NY', 'Chicago, IL', 'Los Angeles, CA', 'Houston, TX', 'Seattle, WA',
  'Atlanta, GA', 'Boston, MA', 'Denver, CO', 'Miami, FL', 'Dallas, TX',
];
const STATUSES = ['delivered', 'delivered', 'in_transit', 'delayed', 'in_transit'];

const BASE_DATE = Date.UTC(2026, 10, 1);
const DAY_MS = 24 * 60 * 60 * 1000;
const SEED_COUNT = 20;

function buildSeedShipments() {
  return Array.from({ length: SEED_COUNT }, (_, i) => ({
    id: `SH-${1001 + i}`,
    origin: CITIES[i % CITIES.length],
    destination: CITIES[(i * 3 + 4) % CITIES.length],
    status: STATUSES[i % STATUSES.length],
    eta: new Date(BASE_DATE + (i % 14) * DAY_MS).toISOString().slice(0, 10),
    carrier: CARRIERS[i % CARRIERS.length],
  }));
}

module.exports = { buildSeedShipments };
