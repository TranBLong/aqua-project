const fs = require('fs');
const admin = require('firebase-admin');
const cfg = require('./config');

function loadCredential() {
  if (cfg.firebase.serviceAccountJson) {
    return admin.credential.cert(JSON.parse(cfg.firebase.serviceAccountJson));
  }
  if (cfg.firebase.serviceAccountPath) {
    return admin.credential.cert(JSON.parse(fs.readFileSync(cfg.firebase.serviceAccountPath, 'utf8')));
  }
  throw new Error('Cần FIREBASE_SERVICE_ACCOUNT_JSON hoặc FIREBASE_SERVICE_ACCOUNT_PATH');
}

admin.initializeApp({
  credential: loadCredential(),
  databaseURL: cfg.firebase.databaseURL,
});

module.exports = { admin, db: admin.database(), auth: admin.auth() };
