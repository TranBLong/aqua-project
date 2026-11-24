const express = require('express');
const { db } = require('../firebase');
const { HttpError, wrap } = require('../utils');
const mqttService = require('../services/mqttService');
const feedingService = require('../services/feedingService');

const router = express.Router({ mergeParams: true });
const DEVICES = ['pump', 'aerator', 'feeder'];

// POST /ponds/:pondId/control
//   { "device": "pump" | "aerator" | "feeder", "state": true|false }
//   { "mode": "auto" | "manual" }
router.post('/control', wrap(async (req, res) => {
  const { pondId } = req.params;
  const { device, state, mode } = req.body || {};

  let command;
  if (mode !== undefined) {
    if (!['auto', 'manual'].includes(mode)) throw new HttpError(400, 'mode phải là "auto" hoặc "manual"');
    command = `mode:${mode}`;
  } else {
    if (!DEVICES.includes(device)) throw new HttpError(400, `device phải thuộc: ${DEVICES.join(', ')}`);
    if (typeof state !== 'boolean') throw new HttpError(400, 'state phải là true/false');
    command = `${device}:${state ? 1 : 0}`;
  }

  const latest = (await db.ref(`pondsLatest/${pondId}`).get()).val();
  if (!latest || latest.online !== true) throw new HttpError(409, 'Thiết bị đang offline');

  if (command === 'feeder:1') await feedingService.feed(pondId, 'manual', req.user.uid);
  else await mqttService.publishControl(pondId, command);

  res.status(202).json({ sent: command });
}));

// GET /ponds/:pondId/devices - trạng thái thiết bị (đọc từ latest)
router.get('/devices', wrap(async (req, res) => {
  const l = (await db.ref(`pondsLatest/${req.params.pondId}`).get()).val() || {};
  res.json({
    online: !!l.online,
    mode: l.mode || 'auto',
    devices: { pump: !!l.pump, aerator: !!l.aerator, feeder: !!l.feeder },
    updatedAt: l.ts || null,
  });
}));

module.exports = router;
