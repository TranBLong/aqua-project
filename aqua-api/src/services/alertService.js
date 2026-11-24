const { db } = require('../firebase');
const cfg = require('../config');
const { notifyUser } = require('./pushService');

const DEFAULT_THRESHOLDS = { phMin: 6.5, phMax: 8.5, doMin: 4.0, tempMax: 35, turbidityMax: 70 };

// Hàm thuần: so sánh số đo với ngưỡng, trả về danh sách vi phạm
function evaluate(r, t) {
  const out = [];
  const ok = (v) => Number.isFinite(v);
  if (ok(r.ph) && r.ph < t.phMin)
    out.push({ type: 'ph_low', metric: 'ph', value: r.ph, threshold: t.phMin, message: `pH thấp: ${r.ph} (ngưỡng ${t.phMin})` });
  if (ok(r.ph) && r.ph > t.phMax)
    out.push({ type: 'ph_high', metric: 'ph', value: r.ph, threshold: t.phMax, message: `pH cao: ${r.ph} (ngưỡng ${t.phMax})` });
  if (ok(r.do) && r.do < t.doMin)
    out.push({ type: 'do_low', metric: 'do', value: r.do, threshold: t.doMin, message: `Oxy hòa tan thấp: ${r.do} mg/L (ngưỡng ${t.doMin})` });
  if (ok(r.temp) && r.temp > t.tempMax)
    out.push({ type: 'temp_high', metric: 'temp', value: r.temp, threshold: t.tempMax, message: `Nhiệt độ cao: ${r.temp}°C (ngưỡng ${t.tempMax})` });
  if (ok(r.turbidity) && r.turbidity > t.turbidityMax)
    out.push({ type: 'turbidity_high', metric: 'turbidity', value: r.turbidity, threshold: t.turbidityMax, message: `Nước đục: ${r.turbidity}% (ngưỡng ${t.turbidityMax})` });
  return out;
}

// Chống spam: mỗi (ao, loại cảnh báo) chỉ tạo lại sau cooldown
const lastRaised = new Map();

async function raise(pond, alert, ts) {
  const key = `${pond.id}:${alert.type}`;
  if (ts - (lastRaised.get(key) || 0) < cfg.alertCooldownMs) return;
  lastRaised.set(key, ts);
  await db.ref(`alerts/${pond.id}`).push({ ...alert, ts, read: false });
  await notifyUser(pond.ownerId, `⚠️ ${pond.name}`, alert.message, { pondId: pond.id, type: alert.type });
}

async function processReading(pond, reading, ts) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(pond.thresholds || {}) };
  for (const a of evaluate(reading, thresholds)) await raise(pond, a, ts);
}

async function raiseOffline(pond, ts) {
  await raise(pond, { type: 'device_offline', metric: 'device', value: 0, threshold: 0, message: 'Thiết bị mất kết nối' }, ts);
}

module.exports = { DEFAULT_THRESHOLDS, evaluate, processReading, raiseOffline };
