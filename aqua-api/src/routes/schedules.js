const express = require('express');
const { db } = require('../firebase');
const { HttpError, wrap, str } = require('../utils');

const router = express.Router({ mergeParams: true });
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_SCHEDULES = 20;

function parseSchedule(b, partial = false) {
  const out = {};
  if (!partial || b.time !== undefined) {
    if (typeof b.time !== 'string' || !TIME_RE.test(b.time)) throw new HttpError(400, 'time phải dạng HH:mm (24h)');
    out.time = b.time;
  }
  if (b.days !== undefined || !partial) {
    const days = b.days === undefined ? [0, 1, 2, 3, 4, 5, 6] : b.days;
    if (!Array.isArray(days) || !days.length || !days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))
      throw new HttpError(400, 'days là mảng số 0-6 (0 = Chủ nhật)');
    out.days = [...new Set(days)].sort();
  }
  if (b.enabled !== undefined || !partial) {
    if (b.enabled !== undefined && typeof b.enabled !== 'boolean') throw new HttpError(400, 'enabled phải là true/false');
    out.enabled = b.enabled === undefined ? true : b.enabled;
  }
  if (b.label !== undefined) out.label = str(b.label, 'label', { min: 0, max: 60 });
  return out;
}

// GET /ponds/:pondId/schedules
router.get('/schedules', wrap(async (req, res) => {
  const snap = await db.ref(`schedules/${req.params.pondId}`).get();
  const val = snap.val() || {};
  res.json(Object.entries(val).map(([id, s]) => ({ id, ...s })).sort((a, b) => a.time.localeCompare(b.time)));
}));

// POST /ponds/:pondId/schedules  { time:"07:30", days:[1,2,3], enabled:true, label:"Sáng" }
router.post('/schedules', wrap(async (req, res) => {
  const ref = db.ref(`schedules/${req.params.pondId}`);
  const count = Object.keys((await ref.get()).val() || {}).length;
  if (count >= MAX_SCHEDULES) throw new HttpError(400, `Tối đa ${MAX_SCHEDULES} lịch cho mỗi ao`);
  const data = { label: '', ...parseSchedule(req.body || {}), createdAt: Date.now() };
  const child = ref.push();
  await child.set(data);
  res.status(201).json({ id: child.key, ...data });
}));

// PUT /ponds/:pondId/schedules/:scheduleId
router.put('/schedules/:scheduleId', wrap(async (req, res) => {
  const ref = db.ref(`schedules/${req.params.pondId}/${req.params.scheduleId}`);
  if (!(await ref.get()).exists()) throw new HttpError(404, 'Không tìm thấy lịch');
  const patch = parseSchedule(req.body || {}, true);
  if (!Object.keys(patch).length) throw new HttpError(400, 'Không có trường nào để cập nhật');
  await ref.update(patch);
  res.json({ id: req.params.scheduleId, ...(await ref.get()).val() });
}));

// DELETE /ponds/:pondId/schedules/:scheduleId
router.delete('/schedules/:scheduleId', wrap(async (req, res) => {
  await db.ref(`schedules/${req.params.pondId}/${req.params.scheduleId}`).remove();
  res.status(204).end();
}));

// GET /ponds/:pondId/feeding-logs?limit=50 - lịch sử cho ăn
router.get('/feeding-logs', wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const snap = await db.ref(`feedingLogs/${req.params.pondId}`).orderByChild('ts').limitToLast(limit).get();
  const list = [];
  snap.forEach((c) => { list.push({ id: c.key, ...c.val() }); });
  res.json(list.reverse());
}));

module.exports = router;
