# Aqua API – Smart Aquaculture

Backend Node.js cho app Expo: **ESP32 (Wokwi) ⇄ MQTT (HiveMQ) ⇄ aqua-api ⇄ Firebase ⇄ App**

- Nhận dữ liệu cảm biến từ MQTT → ghi Firebase Realtime Database (`pondsLatest`, `sensorHistory`)
- Kiểm tra ngưỡng → tạo cảnh báo + push Expo
- REST API cho app: ao nuôi, lịch sử, điều khiển thiết bị, cảnh báo, lịch cho ăn, hồ sơ
- Đăng ký / đăng nhập do **Firebase Auth** (làm ở app), API chỉ xác thực ID token

## 1. Cài đặt (VS Code)

```bash
cd aqua-api
npm install
cp .env.example .env     # Windows: copy .env.example .env
```

1. Firebase Console → tạo project → bật **Authentication** (Email/Password) và **Realtime Database** (chọn region, copy URL vào `FIREBASE_DATABASE_URL`).
2. Project settings → **Service accounts** → *Generate new private key* → lưu thành `aqua-api/serviceAccountKey.json` (đã nằm trong `.gitignore`).
3. Realtime Database → **Rules** → dán nội dung `database.rules.json` → Publish.
4. Sửa `.env`: `MQTT_PREFIX` phải **trùng** `TOPIC_PREFIX` trong `firmware/sketch.ino`.

```bash
npm run dev     # tự reload khi sửa code
curl http://localhost:3000/health
```

## 2. Chạy cùng Wokwi

1. Đăng nhập app (hoặc lấy ID token bằng Thunder Client) → `POST /ponds` với `{"name":"Ao 1","pondId":"pond1"}`.
   `pondId` phải **trùng** `POND_ID` trong firmware. API bỏ qua mọi topic của ao chưa đăng ký.
2. Chạy Wokwi → trong Firebase thấy `pondsLatest/pond1` cập nhật mỗi 5s.

## 3. Endpoints

Mọi route (trừ `/health`) cần header `Authorization: Bearer <Firebase ID token>`.

| Method | Path | Mô tả |
|---|---|---|
| GET | `/health` | Kiểm tra API + MQTT |
| GET / PUT | `/users/me` | Xem / sửa hồ sơ |
| PUT / DELETE | `/users/me/push-token` | Lưu / xóa Expo push token |
| GET / POST | `/ponds` | Danh sách ao (kèm số liệu mới nhất) / tạo ao |
| GET / PUT / DELETE | `/ponds/:pondId` | Chi tiết / sửa / xóa ao |
| GET | `/ponds/:pondId/latest` | Số liệu mới nhất |
| GET | `/ponds/:pondId/history?from&to&interval=raw\|hour\|day&limit` | Lịch sử (from/to là timestamp ms, tối đa 31 ngày) |
| GET | `/ponds/:pondId/history/export` | Xuất CSV |
| GET | `/ponds/:pondId/devices` | Trạng thái bơm / sục khí / máy cho ăn / online |
| POST | `/ponds/:pondId/control` | `{"device":"pump","state":true}` hoặc `{"mode":"auto"}` |
| GET | `/ponds/:pondId/alerts?limit&unread=true` | Danh sách cảnh báo |
| PATCH | `/ponds/:pondId/alerts/:alertId/read` | Đánh dấu đã đọc |
| POST | `/ponds/:pondId/alerts/read-all` | Đọc tất cả |
| GET / PUT | `/ponds/:pondId/thresholds` | Ngưỡng cảnh báo |
| GET / POST | `/ponds/:pondId/schedules` | Lịch cho ăn |
| PUT / DELETE | `/ponds/:pondId/schedules/:scheduleId` | Sửa / xóa lịch |
| GET | `/ponds/:pondId/feeding-logs` | Lịch sử cho ăn |

Ví dụ lịch cho ăn: `{"time":"07:30","days":[1,2,3,4,5],"label":"Sáng"}` (`days`: 0 = Chủ nhật).

## 4. Dùng trong app Expo

- **Realtime:** app dùng Firebase client SDK `onValue(ref(db, 'pondsLatest/pond1'))` (rules cho phép chủ ao đọc).
- **Còn lại:** gọi REST API kèm `await user.getIdToken()`.
- Chạy local + Expo Go trên điện thoại: dùng IP LAN của máy (vd `http://192.168.1.10:3000`), không dùng `localhost`; điện thoại và máy cùng WiFi.
- Push notification: theo mình biết, từ Expo SDK 53 Expo Go trên Android không còn nhận remote push; cần development build. Hãy kiểm tra tài liệu Expo bản đang dùng.

## 5. Deploy Render

1. Đẩy code lên GitHub → Render → *New Web Service* → chọn repo (thư mục `aqua-api` nếu là monorepo), hoặc dùng `render.yaml`.
2. Build: `npm install` – Start: `node src/index.js`.
3. Environment: `MQTT_PREFIX`, `FIREBASE_DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT_JSON` (dán nguyên nội dung file JSON), `TIMEZONE`.
4. **Lưu ý gói Free:** service ngủ sau ~15 phút không có request → MQTT subscriber và lịch cho ăn ngừng chạy. Cách xử lý: dùng UptimeRobot ping `/health` mỗi 5 phút, hoặc nâng gói trả phí.

## 6. Cấu trúc dữ liệu Firebase

```
ponds/{pondId}          ownerId, name, location, species, area, thresholds{}, createdAt
pondsLatest/{pondId}    temp, hum, ph, do, turbidity, pump, aerator, feeder, mode, online, ts
sensorHistory/{pondId}/{id}   ts, temp, hum, ph, do, turbidity   (mặc định 1 bản ghi/60s)
alerts/{pondId}/{id}    type, metric, value, threshold, message, ts, read
schedules/{pondId}/{id} time, days[], enabled, label
feedingLogs/{pondId}/{id}  ts, source(manual|schedule), by
users/{uid}             displayName, phone, expoPushToken
```

`sensorHistory` chưa tự xóa dữ liệu cũ; nếu cần có thể thêm job dọn dẹp sau.
