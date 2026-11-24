const express = require('express');
const { db } = require('../firebase');
const requireAuth = require('../middleware/auth');
const ownPond = require('../middleware/ownPond');
const { HttpError, wrap, num, str } = require('../utils');
const { invalidate } = require('../services/pondCache');
const { DEFAULT_THRESHOLDS } = require('../services/alertService');

const router = express.Router();
router.use(requireAuth);

const POND_ID_RE = /^[a-z0-9_-]{3,30}$/;

// GET /ponds - danh sách ao của user (kèm số liệu mới nhất)
router.get('/', wrap(async (req, res) => {
  const snap = await db.ref('ponds').orderByChild('ownerId').equalTo(req.user.uid).get();
  const val = snap.val() || {};
  const ids = Object.keys(val);
  const latests = await Promise.all(ids.map((id) => db.ref(`pondsLatest/${id}`).get()));
  res.json(ids.map((id, i) => ({ id, ...val[id], latest: latests[i].val() })));
}));

// POST /ponds - tạo ao. Có thể truyền pondId để khớp với POND_ID trong firmware (vd "pond1")
router.post('/', wrap(async (req, res) => {
  const b = req.body || {};
  const data = {
    ownerId: req.user.uid,
    name: str(b.name, 'name', { max: 60 }),
    location: b.location ? str(b.location, 'location', { max: 120 }) : '',
    species: b.species ? str(b.species, 'species', { max: 60 }) : '',
    area: b.area !== undefined ? num(b.area, 'area', { min: 0 }) : null,
    thresholds: DEFAULT_THRESHOLDS,
    createdAt: Date.now(),
  };

  let pondId;
  if (b.pondId !== undefined) {
    if (typeof b.pondId !== 'string' || !POND_ID_RE.test(b.pondId))
      throw new HttpError(400, 'pondId chỉ gồm a-z, 0-9, _, - (3-30 ký tự)');
    pondId = b.pondId;
    const tx = await db.ref(`ponds/${pondId}`).transaction((cur) => (cur === null ? data : undefined));
    if (!tx.committed) throw new HttpError(409, 'pondId đã tồn tại');
  } else {
    pondId = db.ref('ponds').push().key;
    await db.ref(`ponds/${pondId}`).set(data);
  }
  invalidate(pondId);
  res.status(201).json({ id: pondId, ...data });
}));

// Mọi route bên dưới có :pondId -> kiểm tra quyền sở hữu
router.use('/:pondId', ownPond);

router.get('/:pondId', wrap(async (req, res) => {
  const latest = (await db.ref(`pondsLatest/${req.pond.id}`).get()).val();
  res.json({ ...req.pond, latest });
}));

router.put('/:pondId', wrap(async (req, res) => {
  const b = req.body || {};
  const patch = {};
  if (b.name !== undefined) patch.name = str(b.name, 'name', { max: 60 });
  if (b.location !== undefined) patch.location = str(b.location, 'location', { min: 0, max: 120 });
  if (b.species !== undefined) patch.species = str(b.species, 'species', { min: 0, max: 60 });
  if (b.area !== undefined) patch.area = num(b.area, 'area', { min: 0 });
  if (!Object.keys(patch).length) throw new HttpError(400, 'Không có trường nào để cập nhật');
  await db.ref(`ponds/${req.pond.id}`).update(patch);
  invalidate(req.pond.id);
  res.json({ ...req.pond, ...patch });
}));

router.delete('/:pondId', wrap(async (req, res) => {
  const id = req.pond.id;
  await db.ref().update({
    [`ponds/${id}`]: null,
    [`pondsLatest/${id}`]: null,
    [`sensorHistory/${id}`]: null,
    [`alerts/${id}`]: null,
    [`schedules/${id}`]: null,
    [`feedingLogs/${id}`]: null,
  });
  invalidate(id);
  res.status(204).end();
}));

// Các nhóm route con (dùng chung :pondId)
router.use('/:pondId', require('./sensors'));
router.use('/:pondId', require('./devices'));
router.use('/:pondId', require('./alerts'));
router.use('/:pondId', require('./schedules'));

module.exports = router;
