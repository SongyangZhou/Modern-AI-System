'use strict';

const path = require('node:path');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 3001;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'shipments.json');

createApp(DATA_FILE).listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
