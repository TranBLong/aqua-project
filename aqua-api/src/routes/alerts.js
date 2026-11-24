const express = require('express');
const { db } = require('../firebase');
const { HttpError, wrap, num } = require('../utils');
const { invalidate } = require('../services/pondCache');
const { DEFAULT_THRESHOLDS } = require('../services/alertService');

const router = express.Router({ mergeParams: true });

// GET /ponds/:pondId/alerts?limit=50&unread=true
router.get('/alerts', wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const snap = await db.ref(`alerts/${req.params.pondId}`).orderByChild('ts').limitToLast(limit).get();
  let list = [];
  snap.forEach((c) => { list.push({ id: c.key, ...c.val() }); });
  if (req.query.unread === 'true') list = list.filter((a) => !a.read);
  res.json(list.reverse()); // mới nhất trước
}));

// PATCH /ponds/:pondId/alerts/:alertId/read
router.patch('/alerts/:alertId/read', wrap(async (req, res) => {
  const ref = db.ref(`alerts/${req.params.pondId}/${req.params.alertId}`);
  if (!(await ref.get()).exists()) throw new HttpError(404, 'Không tìm thấy cảnh báo');
  await ref.update({ read: true });
  res.json({ ok: true });
}));

// POST /ponds/:pondId/alerts/read-all
router.post('/alerts/read-all', wrap(async (req, res) => {
  const snap = await db.ref(`alerts/${req.params.pondId}`).get();
  const updates = {};
  snap.forEach((c) => { if (!c.val().read) updates[`${c.key}/read`] = true; });
  if (Object.keys(updates).length) await db.ref(`alerts/${req.params.pondId}`).update(updates);
  res.json({ updated: Object.keys(updates).length });
}));

// GET /ponds/:pondId/thresholds
router.get('/thresholds', wrap(async (req, res) => {
  res.json({ ...DEFAULT_THRESHOLDS, ...(req.pond.thresholds || {}) });
}));

// PUT /ponds/:pondId/thresholds  { phMin, phMax, doMin, tempMax, turbidityMax }
router.put('/thresholds', wrap(async (req, res) => {
  const b = req.body || {};
  const t = {
    phMin: num(b.phMin, 'phMin', { min: 0, max: 14 }),
    phMax: num(b.phMax, 'phMax', { min: 0, max: 14 }),
    doMin: num(b.doMin, 'doMin', { min: 0, max: 20 }),
    tempMax: num(b.tempMax, 'tempMax', { min: 0, max: 60 }),
    turbidityMax: num(b.turbidityMax, 'turbidityMax', { min: 0, max: 100 }),
  };
  if (t.phMin >= t.phMax) throw new HttpError(400, 'phMin phải nhỏ hơn phMax');
  await db.ref(`ponds/${req.pond.id}/thresholds`).set(t);
  invalidate(req.pond.id);
  res.json(t);
}));

module.exports = router;
