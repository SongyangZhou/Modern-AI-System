'use strict';

const STATUSES = ['in_transit', 'delivered', 'delayed'];
const TEXT_FIELDS = ['origin', 'destination', 'carrier'];
const EDITABLE = [...TEXT_FIELDS, 'status', 'eta'];

const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';
const isIsoDate = (v) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

function checkField(key, value) {
  if (key === 'status') return STATUSES.includes(value) ? null : `status must be one of: ${STATUSES.join(', ')}`;
  if (key === 'eta') return isIsoDate(value) ? null : 'eta must be a YYYY-MM-DD date';
  return isNonEmptyString(value) ? null : `${key} must be a non-empty string`;
}

function pickEditable(body) {
  return Object.fromEntries(
    Object.entries(body ?? {}).filter(([k]) => EDITABLE.includes(k)),
  );
}

function trimmed(fields) {
  return Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]),
  );
}

function validateCreate(body) {
  const fields = { status: 'in_transit', ...pickEditable(body) };
  const required = [...TEXT_FIELDS, 'eta'];
  const errors = [
    ...required.filter((k) => fields[k] === undefined).map((k) => `${k} is required`),
    ...Object.entries(fields)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => checkField(k, v))
      .filter(Boolean),
  ];
  return errors.length ? { errors } : { value: trimmed(fields) };
}

function validateUpdate(body) {
  const fields = pickEditable(body);
  if (Object.keys(fields).length === 0) {
    return { errors: [`provide at least one of: ${EDITABLE.join(', ')}`] };
  }
  const errors = Object.entries(fields).map(([k, v]) => checkField(k, v)).filter(Boolean);
  return errors.length ? { errors } : { value: trimmed(fields) };
}

module.exports = { validateCreate, validateUpdate };
