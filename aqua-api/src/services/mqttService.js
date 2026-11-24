const mqtt = require('mqtt');
const cfg = require('../config');
const { HttpError } = require('../utils');
const sensorService = require('./sensorService');

let client = null;

function start() {
  const clientId = `aqua-api-${Math.random().toString(16).slice(2, 10)}`;
  client = mqtt.connect(cfg.mqtt.url, { clientId, reconnectPeriod: 5000, connectTimeout: 15000 });

  client.on('connect', () => {
    console.log('[mqtt] đã kết nối', cfg.mqtt.url);
    client.subscribe([`${cfg.mqtt.prefix}/+/sensors`, `${cfg.mqtt.prefix}/+/status`], { qos: 0 }, (err) => {
      if (err) console.error('[mqtt] subscribe lỗi:', err.message);
    });
  });
  client.on('reconnect', () => console.log('[mqtt] đang kết nối lại...'));
  client.on('error', (e) => console.error('[mqtt] lỗi:', e.message));

  client.on('message', (topic, payload, packet) => {
    // topic dạng: <prefix>/<pondId>/<kind>
    const rest = topic.slice(cfg.mqtt.prefix.length + 1).split('/');
    if (rest.length !== 2) return;
    const [pondId, kind] = rest;
    const text = payload.toString();

    // Tin retained (gửi lại khi vừa subscribe) là dữ liệu cũ -> bỏ qua với sensors
    const task = kind === 'sensors'
      ? (packet.retain ? null : sensorService.handleSensors(pondId, text))
      : kind === 'status' ? sensorService.handleStatus(pondId, text) : null;

    if (task) task.catch((e) => console.error(`[mqtt] xử lý ${kind} của ${pondId} lỗi:`, e.message));
  });
}

// Gửi lệnh tới ESP32, ví dụ "pump:1", "mode:auto", "feeder:1"
function publishControl(pondId, command) {
  if (!client || !client.connected) throw new HttpError(503, 'API chưa kết nối được MQTT broker');
  return new Promise((resolve, reject) => {
    client.publish(`${cfg.mqtt.prefix}/${pondId}/control`, command, { qos: 1, retain: false }, (err) =>
      err ? reject(new HttpError(502, 'Gửi lệnh MQTT thất bại')) : resolve()
    );
  });
}

const isConnected = () => !!client && client.connected;

module.exports = { start, publishControl, isConnected };
