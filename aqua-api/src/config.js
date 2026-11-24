require('dotenv').config();

function required(key) {
  if (!process.env[key]) throw new Error(`Thiếu biến môi trường: ${key}`);
  return process.env[key];
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  timezone: process.env.TIMEZONE || 'Asia/Ho_Chi_Minh',
  tzOffsetMs: 7 * 60 * 60 * 1000, // dùng để gom nhóm theo ngày (giờ VN)
  mqtt: {
    url: process.env.MQTT_URL || 'mqtt://broker.hivemq.com:1883',
    prefix: required('MQTT_PREFIX').replace(/\/+$/, ''),
  },
  firebase: {
    databaseURL: required('FIREBASE_DATABASE_URL'),
    serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
  },
  historyIntervalMs: (Number(process.env.HISTORY_INTERVAL_SEC) || 60) * 1000,
  alertCooldownMs: (Number(process.env.ALERT_COOLDOWN_MIN) || 10) * 60 * 1000,
};
