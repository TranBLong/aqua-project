class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Bọc handler async để lỗi đi vào error middleware
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function num(v, name, { min = -Infinity, max = Infinity } = {}) {
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
  if (v === null || v === undefined || !Number.isFinite(n) || n < min || n > max) {
    throw new HttpError(400, `${name} không hợp lệ`);
  }
  return n;
}

function str(v, name, { min = 1, max = 100 } = {}) {
  if (typeof v !== 'string') throw new HttpError(400, `${name} phải là chuỗi`);
  const s = v.trim();
  if (s.length < min || s.length > max) throw new HttpError(400, `${name} phải dài ${min}-${max} ký tự`);
  return s;
}

module.exports = { HttpError, wrap, num, str };
