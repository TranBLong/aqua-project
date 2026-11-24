const { auth } = require('../firebase');

// Xác thực Firebase ID token: Authorization: Bearer <idToken>
module.exports = async function requireAuth(req, res, next) {
  const m = (req.headers.authorization || '').match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ error: 'Thiếu token đăng nhập' });
  try {
    const decoded = await auth.verifyIdToken(m[1]);
    req.user = { uid: decoded.uid, email: decoded.email || null };
    next();
  } catch (e) {
    res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
  }
};
