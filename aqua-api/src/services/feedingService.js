const { db } = require('../firebase');
const mqttService = require('./mqttService');

// Cho ăn: gửi lệnh feeder:1 và ghi lịch sử. source = 'manual' | 'schedule'
async function feed(pondId, source, byUid = null) {
  await mqttService.publishControl(pondId, 'feeder:1');
  await db.ref(`feedingLogs/${pondId}`).push({ ts: Date.now(), source, by: byUid });
}

module.exports = { feed };
