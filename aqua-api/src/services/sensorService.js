const { db } = require('../firebase');
const cfg = require('../config');
const { getPond } = require('./pondCache');
const alertService = require('./alertService');

const lastHistoryAt = new Map();
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Lọc payload từ ESP32, bỏ dữ liệu rác
function sanitize(d) {
  if (!d || typeof d !== 'object') return null;
  if (![d.temp, d.ph, d.do].every(isNum)) return null;
  return {
    temp: d.temp,
    hum: isNum(d.hum) ? d.hum : null,
    ph: d.ph,
    do: d.do,
    turbidity: isNum(d.turbidity) ? d.turbidity : null,
    pump: !!d.pump,
    aerator: !!d.aerator,
    feeder: !!d.feeder,
    mode: d.mode === 'manual' ? 'manual' : 'auto',
    deviceAlert: !!d.alert,
    uptime: isNum(d.uptime) ? d.uptime : null,
  };
}

async function handleSensors(pondId, raw) {
  const pond = await getPond(pondId);
  if (!pond) return; // bỏ qua topic của ao chưa đăng ký

  let data;
  try { data = JSON.parse(raw); } catch { return; }
  const reading = sanitize(data);
  if (!reading) return;

  const ts = Date.now(); // timestamp do server gắn
  await db.ref(`pondsLatest/${pondId}`).update({ ...reading, ts, online: true });

  if (ts - (lastHistoryAt.get(pondId) || 0) >= cfg.historyIntervalMs) {
    lastHistoryAt.set(pondId, ts);
    await db.ref(`sensorHistory/${pondId}`).push({
      ts, temp: reading.temp, hum: reading.hum, ph: reading.ph, do: reading.do, turbidity: reading.turbidity,
    });
  }

  await alertService.processReading(pond, reading, ts);
}

async function handleStatus(pondId, raw) {
  const pond = await getPond(pondId);
  if (!pond) return;
  const online = raw.trim() === 'online';
  await db.ref(`pondsLatest/${pondId}`).update({ online, statusTs: Date.now() });
  if (!online) await alertService.raiseOffline(pond, Date.now());
}

module.exports = { handleSensors, handleStatus, sanitize };
