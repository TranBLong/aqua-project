const { db } = require('../firebase');
const cfg = require('../config');
const feedingService = require('./feedingService');

const fired = new Set(); // chống chạy 2 lần trong cùng 1 phút
const DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function nowInTz() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: cfg.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit',
    year: 'numeric', month: '2-digit', day: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return { time: `${p.hour}:${p.minute}`, day: DAY_INDEX[p.weekday], date: `${p.year}-${p.month}-${p.day}` };
}

async function tick() {
  const { time, day, date } = nowInTz();
  const snap = await db.ref('schedules').get();
  const all = snap.val() || {};

  for (const [pondId, items] of Object.entries(all)) {
    for (const [id, s] of Object.entries(items || {})) {
      if (!s.enabled || s.time !== time || !(s.days || []).includes(day)) continue;
      const key = `${id}:${date}:${time}`;
      if (fired.has(key)) continue;
      fired.add(key);
      try {
        await feedingService.feed(pondId, 'schedule');
        console.log(`[scheduler] cho ăn ao ${pondId} lúc ${time}`);
      } catch (e) {
        console.error(`[scheduler] lỗi cho ăn ao ${pondId}:`, e.message);
      }
    }
  }
  if (fired.size > 500) fired.clear();
}

function start() {
  setInterval(() => tick().catch((e) => console.error('[scheduler]', e.message)), 20 * 1000);
}

module.exports = { start, nowInTz };
