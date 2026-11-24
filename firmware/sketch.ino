/*
 * Smart Aquaculture Monitoring System - ESP32 (Wokwi)
 * Sensors: DHT22, pH, Dissolved Oxygen, Turbidity (3 biến trở giả lập)
 * Display: SSD1306 OLED (I2C: SDA=21, SCL=22)
 * Protocol: MQTT (HiveMQ) - điều khiển bơm / sục khí / máy cho ăn
 *
 * Topic: <TOPIC_PREFIX>/<POND_ID>/{sensors|control|status}
 * -> TOPIC_PREFIX phải GIỐNG biến MQTT_PREFIX trong .env của aqua-api
 * -> POND_ID phải GIỐNG pondId của ao tạo trong app/API
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ========== PIN ==========
#define DHT_PIN             4
#define DHT_TYPE            DHT22
#define PIN_PH              34
#define PIN_DO              35
#define PIN_TURBIDITY       32
#define PIN_LED_STATUS      2
#define PIN_RELAY_PUMP      18
#define PIN_RELAY_AERATOR   19
#define PIN_RELAY_FEEDER    23

// ========== OLED ==========
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_ADDR    0x3C

// ========== CẤU HÌNH ==========
const char* POND_ID      = "pond1";            // <-- đổi theo pondId của ao
const char* TOPIC_PREFIX = "aqua/lq-7f3a";     // <-- đổi thành chuỗi riêng của nhóm

const char* WIFI_SSID     = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";
const int   WIFI_CHANNEL  = 6;

const char* MQTT_BROKER    = "broker.hivemq.com";
const int   MQTT_PORT      = 1883;
const char* MQTT_CLIENT_ID = "esp32-aquaculture";

char TOPIC_DATA[96], TOPIC_CONTROL[96], TOPIC_STATUS[96];

DHT dht(DHT_PIN, DHT_TYPE);
Adafruit_SSD1306 oled(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

float temperature = 0.0, humidity = 0.0, pH = 7.0, dissolvedOxygen = 6.0, turbidity = 0.0;
bool pumpState = false, aeratorState = false, feederState = false;
bool autoMode = true;
bool alertActive = false;
unsigned long lastWifiTry = 0;
unsigned long feederEndAt = 0;

// Ngưỡng tự động (có trễ để relay không đóng/ngắt liên tục)
const float DO_ON  = 4.0f, DO_OFF  = 5.0f;     // mg/L
const float TURB_ON = 70.0f, TURB_OFF = 50.0f; // %
const float PH_MIN = 6.5f, PH_MAX = 8.5f;
const unsigned long FEED_DURATION_MS = 5000;   // máy cho ăn chạy 5s rồi tự tắt

unsigned long lastSensorRead = 0;
unsigned long lastMqttPublish = 0;
unsigned long lastMqttReconnect = 0;
unsigned long lastDisplayUpdate = 0;

void buildTopics() {
  snprintf(TOPIC_DATA,    sizeof(TOPIC_DATA),    "%s/%s/sensors", TOPIC_PREFIX, POND_ID);
  snprintf(TOPIC_CONTROL, sizeof(TOPIC_CONTROL), "%s/%s/control", TOPIC_PREFIX, POND_ID);
  snprintf(TOPIC_STATUS,  sizeof(TOPIC_STATUS),  "%s/%s/status",  TOPIC_PREFIX, POND_ID);
}

void setupWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD, WIFI_CHANNEL);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    digitalWrite(PIN_LED_STATUS, !digitalRead(PIN_LED_STATUS));
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    digitalWrite(PIN_LED_STATUS, HIGH);
  } else {
    Serial.println("\nWiFi connection failed! Will retry in loop.");
    digitalWrite(PIN_LED_STATUS, LOW);
  }
}

void setPump(bool on)    { pumpState = on;    digitalWrite(PIN_RELAY_PUMP, on ? HIGH : LOW); }
void setAerator(bool on) { aeratorState = on; digitalWrite(PIN_RELAY_AERATOR, on ? HIGH : LOW); }
void setFeeder(bool on) {
  feederState = on;
  digitalWrite(PIN_RELAY_FEEDER, on ? HIGH : LOW);
  feederEndAt = on ? millis() + FEED_DURATION_MS : 0;
}

void applyAutoControl() {
  // Sục khí: bật khi DO thấp, tắt khi DO phục hồi
  if (dissolvedOxygen < DO_ON && !aeratorState)       setAerator(true);
  else if (dissolvedOxygen > DO_OFF && aeratorState)  setAerator(false);

  // Bơm: bật khi nước đục, tắt khi trong lại
  if (turbidity > TURB_ON && !pumpState)              setPump(true);
  else if (turbidity < TURB_OFF && pumpState)         setPump(false);
}

void checkAlert() {
  alertActive = (pH < PH_MIN || pH > PH_MAX || dissolvedOxygen < DO_ON || temperature > 35.0f);
}

void publishSensorData() {
  if (!mqtt.connected()) return;

  char payload[320];
  snprintf(payload, sizeof(payload),
    "{\"temp\":%.1f,\"hum\":%.1f,\"ph\":%.2f,\"do\":%.2f,\"turbidity\":%.1f,"
    "\"pump\":%d,\"aerator\":%d,\"feeder\":%d,\"mode\":\"%s\",\"alert\":%d,\"uptime\":%lu}",
    temperature, humidity, pH, dissolvedOxygen, turbidity,
    pumpState ? 1 : 0, aeratorState ? 1 : 0, feederState ? 1 : 0,
    autoMode ? "auto" : "manual", alertActive ? 1 : 0, millis() / 1000);

  if (mqtt.publish(TOPIC_DATA, payload, true)) {   // retained = true
    Serial.printf("Published: %s\n", payload);
  } else {
    Serial.println("MQTT publish failed!");
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg = "";
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
  msg.trim();
  Serial.printf("MQTT [%s]: %s\n", topic, msg.c_str());

  if (msg == "mode:auto")        autoMode = true;
  else if (msg == "mode:manual") autoMode = false;
  else if (msg == "pump:1")      { autoMode = false; setPump(true); }
  else if (msg == "pump:0")      { autoMode = false; setPump(false); }
  else if (msg == "aerator:1")   { autoMode = false; setAerator(true); }
  else if (msg == "aerator:0")   { autoMode = false; setAerator(false); }
  else if (msg == "feeder:1")    setFeeder(true);    // cho ăn không đổi chế độ auto
  else if (msg == "feeder:0")    setFeeder(false);

  publishSensorData();   // báo trạng thái mới ngay, không chờ 5s
}

void ensureMqttConnected() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (mqtt.connected()) return;

  unsigned long now = millis();
  if (now - lastMqttReconnect < 5000) return;
  lastMqttReconnect = now;

  Serial.print("Connecting to MQTT broker...");
  String clientId = String(MQTT_CLIENT_ID) + "-" + String((uint32_t)esp_random(), HEX);

  // Last Will: nếu ESP32 mất kết nối, broker tự phát "offline"
  if (mqtt.connect(clientId.c_str(), nullptr, nullptr, TOPIC_STATUS, 1, true, "offline")) {
    Serial.println(" connected!");
    mqtt.publish(TOPIC_STATUS, "online", true);   // retained
    mqtt.subscribe(TOPIC_CONTROL);
  } else {
    Serial.printf(" failed (rc=%d)\n", mqtt.state());
  }
}

void readSensors() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();

  if (!isnan(t)) temperature = t;
  if (!isnan(h)) humidity = h;

  pH = analogRead(PIN_PH) * 14.0f / 4095.0f;
  dissolvedOxygen = analogRead(PIN_DO) * 15.0f / 4095.0f;
  turbidity = analogRead(PIN_TURBIDITY) * 100.0f / 4095.0f;

  Serial.printf("Temp:%.1fC Hum:%.1f%% pH:%.2f DO:%.2f Turb:%.0f%%\n",
                temperature, humidity, pH, dissolvedOxygen, turbidity);

  checkAlert();
  if (autoMode) applyAutoControl();
}

void updateDisplay() {
  oled.clearDisplay();
  oled.setCursor(0, 0);
  oled.println("== AQUACULTURE ==");
  oled.printf("Temp: %.1f C\n", temperature);
  oled.printf("pH  : %.2f\n", pH);
  oled.printf("DO  : %.2f mg/L\n", dissolvedOxygen);
  oled.printf("Turb: %.0f %%\n", turbidity);
  oled.printf("P:%s A:%s F:%s\n", pumpState ? "1" : "0", aeratorState ? "1" : "0", feederState ? "1" : "0");
  oled.printf("%s%s", autoMode ? "AUTO" : "MANUAL", alertActive ? " !" : "");
  oled.display();
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);

  pinMode(PIN_LED_STATUS, OUTPUT);
  pinMode(PIN_RELAY_PUMP, OUTPUT);
  pinMode(PIN_RELAY_AERATOR, OUTPUT);
  pinMode(PIN_RELAY_FEEDER, OUTPUT);
  digitalWrite(PIN_RELAY_PUMP, LOW);
  digitalWrite(PIN_RELAY_AERATOR, LOW);
  digitalWrite(PIN_RELAY_FEEDER, LOW);

  buildTopics();
  dht.begin();

  Wire.begin(21, 22);
  if (!oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("SSD1306 OLED not found!");
  } else {
    oled.clearDisplay();
    oled.setTextColor(SSD1306_WHITE);
    oled.setTextSize(1);
    oled.setCursor(0, 0);
    oled.println("Aquaculture System");
    oled.println("Booting...");
    oled.display();
  }

  setupWiFi();

  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setBufferSize(512);
  mqtt.setCallback(mqttCallback);
}

void loop() {
  unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED && now - lastWifiTry >= 10000) {
    lastWifiTry = now;
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD, WIFI_CHANNEL);   // không chặn loop
  }

  ensureMqttConnected();
  mqtt.loop();

  // Máy cho ăn tự tắt sau FEED_DURATION_MS
  if (feederState && (long)(now - feederEndAt) >= 0) {
    setFeeder(false);
    publishSensorData();
  }

  // Đọc cảm biến mỗi 2s
  if (now - lastSensorRead >= 2000) {
    lastSensorRead = now;
    readSensors();
  }

  // Gửi dữ liệu MQTT mỗi 5s
  if (now - lastMqttPublish >= 5000) {
    lastMqttPublish = now;
    publishSensorData();
  }

  // Cập nhật OLED mỗi 1s
  if (now - lastDisplayUpdate >= 1000) {
    lastDisplayUpdate = now;
    updateDisplay();
  }
}
