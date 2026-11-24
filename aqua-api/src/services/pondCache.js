const { db } = require('../firebase');

// Cache thông tin ao 60s để không đọc Firebase mỗi 5s khi ESP32 gửi dữ liệu
const TTL = 60 * 1000;
const cache = new Map();

async function getPond(pondId) {
  const hit = cache.get(pondId);
  if (hit && Date.now() - hit.at < TTL) return hit.pond;
  const snap = await db.ref(`ponds/${pondId}`).get();
  const pond = snap.exists() ? { id: pondId, ...snap.val() } : null;
  cache.set(pondId, { pond, at: Date.now() });
  return pond;
}

const invalidate = (pondId) => cache.delete(pondId);

module.exports = { getPond, invalidate };
