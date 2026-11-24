const express = require('express');
const { db } = require('../firebase');
const cfg = require('../config');
const { HttpError, wrap } = require('../utils');

const router = express.Router({ mergeParams: true });
const MAX_RANGE_MS = 31 * 24 * 3600 * 1000;
const FIELDS = ['temp', 'hum', 'ph', 'do', 'turbidity'];

async function queryHistory(pondId, query) {
  const to = query.to ? Number(query.to) : Date.now();
  const from = query.from ? Number(query.from) : to - 24 * 3600 * 1000;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new HttpError(400, 'from/to không hợp lệ (timestamp ms)');
  if (to - from > MAX_RANGE_MS) throw new HttpError(400, 'Khoảng thời gian tối đa 31 ngày');
  const snap = await db.ref(`sensorHistory/${pondId}`).orderByChild('ts').startAt(from).endAt(to).get();
  const rows = Object.values(snap.val() || {}).sort((a, b) => a.ts - b.ts);
  return { from, to, rows };
}

// Gom nhóm theo giờ/ngày, lấy trung bình (ngày tính theo giờ VN)
function bucketize(rows, interval) {
  const size = interval === 'day' ? 24 * 3600 * 1000 : 3600 * 1000;
  const off = interval === 'day' ? cfg.tzOffsetMs : 0;
  const map = new Map();
  for (const r of rows) {
    const key = Math.floor((r.ts + off) / size) * size - off;
    if (!map.has(key)) map.set(key, { ts: key, count: 0, sum: {}, n: {} });
    const b = map.get(key);
    b.count++;
    for (const f of FIELDS) {
      if (typeof r[f] === 'number') { b.sum[f] = (b.sum[f] || 0) + r[f]; b.n[f] = (b.n[f] || 0) + 1; }
    }
  }
  return [...map.values()].map((b) => {
    const out = { ts: b.ts, count: b.count };
    for (const f of FIELDS) out[f] = b.n[f] ? Math.round((b.sum[f] / b.n[f]) * 100) / 100 : null;
    return out;
  });
}

// GET /ponds/:pondId/latest
router.get('/latest', wrap(async (req, res) => {
  const snap = await db.ref(`pondsLatest/${req.params.pondId}`).get();
  res.json(snap.val() || null);
}));

// GET /ponds/:pondId/history?from=<ms>&to=<ms>&interval=raw|hour|day&limit=1000
router.get('/history', wrap(async (req, res) => {
  const interval = ['raw', 'hour', 'day'].includes(req.query.interval) ? req.query.interval : 'raw';
  const limit = Math.min(Number(req.query.limit) || 1000, 5000);
  const { from, to, rows } = await queryHistory(req.params.pondId, req.query);
  const data = interval === 'raw' ? rows.slice(-limit) : bucketize(rows, interval);
  res.json({ from, to, interval, count: data.length, data });
}));

// GET /ponds/:pondId/history/export - tải CSV
router.get('/history/export', wrap(async (req, res) => {
  const { rows } = await queryHistory(req.params.pondId, req.query);
  const lines = ['time,temp,hum,ph,do,turbidity'];
  for (const r of rows) {
    lines.push([new Date(r.ts).toISOString(), ...FIELDS.map((f) => r[f] ?? '')].join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.pondId}-history.csv"`);
  res.send(lines.join('\n'));
}));

module.exports = router;
