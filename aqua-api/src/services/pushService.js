const { db } = require('../firebase');

// Gửi push qua Expo Push API (không cần thêm thư viện, Node 18+ có fetch)
async function notifyUser(uid, title, body, data = {}) {
  try {
    const snap = await db.ref(`users/${uid}/expoPushToken`).get();
    const token = snap.val();
    if (!token) return;
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: token, title, body, data, sound: 'default' }),
    });
    if (!res.ok) console.warn('[push] Expo trả về', res.status);
  } catch (e) {
    console.warn('[push] lỗi:', e.message);
  }
}

module.exports = { notifyUser };
