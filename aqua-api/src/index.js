const express = require('express');
const cors = require('cors');
const cfg = require('./config');
require('./firebase'); // khởi tạo Firebase Admin sớm để lỗi cấu hình báo ngay
const mqttService = require('./services/mqttService');
const scheduler = require('./services/scheduler');

const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));

// Health check (Render dùng route này; cũng dùng để ping chống ngủ)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', mqtt: mqttService.isConnected(), uptime: Math.round(process.uptime()) });
});

app.use('/users', require('./routes/users'));
app.use('/ponds', require('./routes/ponds'));

app.use((req, res) => res.status(404).json({ error: 'Không tìm thấy endpoint' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON không hợp lệ' });
  const status = err.status || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: status >= 500 ? 'Lỗi máy chủ' : err.message });
});

mqttService.start();
scheduler.start();

const server = app.listen(cfg.port, () => console.log(`[api] chạy tại cổng ${cfg.port}`));

process.on('SIGTERM', () => {
  console.log('[api] SIGTERM - đang tắt');
  server.close(() => process.exit(0));
});
