'use strict';

const express = require('express');
const { createStore } = require('./store');
const { validateCreate, validateUpdate } = require('./validate');
const { computeStats, computeCarrierStats } = require('./stats');

function createApp(dataFile) {
  const store = createStore(dataFile);
  const app = express();

  app.use((req, res, next) => {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });
  app.use(express.json());

  app.get('/api/shipments', (req, res) => res.json(store.list()));
  app.get('/api/stats', (req, res) => res.json(computeStats(store.list())));
  app.get('/api/carriers', (req, res) => res.json(computeCarrierStats(store.list())));

  app.post('/api/shipments', (req, res) => {
    const { value, errors } = validateCreate(req.body);
    if (errors) return res.status(400).json({ errors });
    return res.status(201).json(store.create(value));
  });

  app.patch('/api/shipments/:id', (req, res) => {
    const { value, errors } = validateUpdate(req.body);
    if (errors) return res.status(400).json({ errors });
    const updated = store.update(req.params.id, value);
    if (!updated) return res.status(404).json({ errors: ['shipment not found'] });
    return res.json(updated);
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ errors: ['invalid JSON body'] });
    console.error(err);
    return res.status(500).json({ errors: ['internal server error'] });
  });

  return app;
}

module.exports = { createApp };
