const express = require('express');
const { db } = require('../firebase');
const requireAuth = require('../middleware/auth');
const { HttpError, wrap, str } = require('../utils');

const router = express.Router();
router.use(requireAuth);

// GET /users/me
router.get('/me', wrap(async (req, res) => {
  const profile = (await db.ref(`users/${req.user.uid}`).get()).val() || {};
  delete profile.expoPushToken; // không trả token ra ngoài
  res.json({ uid: req.user.uid, email: req.user.email, ...profile });
}));

// PUT /users/me  { displayName, phone }
router.put('/me', wrap(async (req, res) => {
  const b = req.body || {};
  const patch = {};
  if (b.displayName !== undefined) patch.displayName = str(b.displayName, 'displayName', { max: 60 });
  if (b.phone !== undefined) patch.phone = str(b.phone, 'phone', { min: 0, max: 20 });
  if (!Object.keys(patch).length) throw new HttpError(400, 'Không có trường nào để cập nhật');
  await db.ref(`users/${req.user.uid}`).update(patch);
  res.json({ uid: req.user.uid, email: req.user.email, ...patch });
}));

// PUT /users/me/push-token  { token: "ExponentPushToken[xxx]" }
router.put('/me/push-token', wrap(async (req, res) => {
  const token = str((req.body || {}).token, 'token', { max: 200 });
  if (!/^Expo(nent)?PushToken\[.+\]$/.test(token)) throw new HttpError(400, 'Expo push token không hợp lệ');
  await db.ref(`users/${req.user.uid}/expoPushToken`).set(token);
  res.json({ ok: true });
}));

// DELETE /users/me/push-token  (gọi khi đăng xuất)
router.delete('/me/push-token', wrap(async (req, res) => {
  await db.ref(`users/${req.user.uid}/expoPushToken`).remove();
  res.status(204).end();
}));

module.exports = router;
