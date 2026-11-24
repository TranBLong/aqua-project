const { db } = require('../firebase');
const { HttpError, wrap } = require('../utils');

// Với mọi route /ponds/:pondId/...: kiểm tra ao tồn tại và thuộc về user đang đăng nhập
module.exports = wrap(async (req, res, next) => {
  const { pondId } = req.params;
  const snap = await db.ref(`ponds/${pondId}`).get();
  if (!snap.exists()) throw new HttpError(404, 'Không tìm thấy ao');
  const pond = snap.val();
  if (pond.ownerId !== req.user.uid) throw new HttpError(403, 'Bạn không có quyền với ao này');
  req.pond = { id: pondId, ...pond };
  next();
});
