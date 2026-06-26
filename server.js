const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const serveStatic = require('serve-static');

const PORT = process.env.PORT || 4000;
const dataDir = path.join(__dirname, 'server', 'data');
const doctorsFile = path.join(dataDir, 'doctors.json');
const backupDir = path.join(dataDir, 'backups');
const dataFile = path.join(dataDir, 'vaka-kayitlari.json');
const completedFile = path.join(dataDir, 'tamamlanan-vakalar.json');
const sourceFile = path.join(__dirname, 'src', 'data', 'hasta_veri.json');
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 saate kadar valid
const sessions = new Map(); // token => { doktor_id, son_kullanma }

// ─── Versiyon Takibi ─────────────────────────────────────────────────────────
// Her case_id için artan versiyon numarası tutulur.
// PATCH isteğinde client'ın gönderdiği versiyon sunucudakiyle eşleşmezse 409 döner.
const caseVersions = new Map();

function ensureDataFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  if (!fs.existsSync(dataFile)) {
    fs.copyFileSync(sourceFile, dataFile);
  }
}

function initVersions() {
  try {
    const cases = readCases();
    if (Array.isArray(cases)) {
      cases.forEach((c) => {
        const version = c._version || 1;
        caseVersions.set(c.case_id, version);
      });
    }
  } catch (error) {
    // İlk çalıştırmada dosya henüz olmayabilir
  }
}

function createBackup() {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (fs.existsSync(dataFile)) {
      const backupFile = path.join(backupDir, `vaka-kayitlari-${stamp}.json`);
      fs.copyFileSync(dataFile, backupFile);
    }
    if (fs.existsSync(completedFile)) {
      const backupCompletedFile = path.join(backupDir, `tamamlanan-vakalar-${stamp}.json`);
      fs.copyFileSync(completedFile, backupCompletedFile);
    }

    // En fazla 50 yedek tut
    const backups = fs.readdirSync(backupDir)
      .filter((f) => f.startsWith('vaka-kayitlari-'))
      .sort();
    while (backups.length > 50) {
      const oldestActive = backups.shift();
      fs.unlinkSync(path.join(backupDir, oldestActive));
      
      const oldestStamp = oldestActive.replace('vaka-kayitlari-', '').replace('.json', '');
      const oldestCompleted = `tamamlanan-vakalar-${oldestStamp}.json`;
      const oldestCompletedPath = path.join(backupDir, oldestCompleted);
      if (fs.existsSync(oldestCompletedPath)) {
        fs.unlinkSync(oldestCompletedPath);
      }
    }
  } catch (error) {
    console.error('Yedek olusturulamadi:', error.message);
  }
}

function readCases() {
  let activeCases = [];
  if (fs.existsSync(dataFile)) {
    const rawActive = fs.readFileSync(dataFile, 'utf8');
    activeCases = JSON.parse(rawActive);
  }
  
  let completedCases = [];
  if (fs.existsSync(completedFile)) {
    const rawCompleted = fs.readFileSync(completedFile, 'utf8');
    completedCases = JSON.parse(rawCompleted);
  }

  const merged = [...activeCases, ...completedCases];
  merged.sort((a, b) => a.case_id.localeCompare(b.case_id));
  return merged;
}

function writeCases(cases) {
  const activeCases = cases.filter((c) => {
    const isCompleted = c.doctor_a?.submitted_at && c.doctor_b?.submitted_at;
    return !isCompleted;
  });

  const completedCases = cases.filter((c) => {
    const isCompleted = c.doctor_a?.submitted_at && c.doctor_b?.submitted_at;
    return isCompleted;
  });

  fs.writeFileSync(dataFile, JSON.stringify(activeCases, null, 2), 'utf8');
  fs.writeFileSync(completedFile, JSON.stringify(completedCases, null, 2), 'utf8');

  // Her 100 tamamlanmış vakada bir yedek (backup) al
  if (completedCases.length % 100 === 0 && completedCases.length > 0) {
    try {
      const backupPath = path.join(backupDir, `tamamlanan-vakalar-${completedCases.length}.json`);
      fs.copyFileSync(completedFile, backupPath);
      console.log(`[Backup] Tamamlanan vaka sayısı ${completedCases.length} olduğu için yedek alındı: ${backupPath}`);
    } catch (err) {
      console.error('[Backup] Tamamlanan vakalar yedeği oluşturulamadı:', err.message);
    }
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, PATCH, OPTIONS, POST',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// ─── Session + Authentication ────────────────────────────────────────────────

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createSession(doktorId) {
  const token = generateToken();
  sessions.set(token, {
    doktor_id: doktorId,
    son_kullanma: Date.now() + SESSION_DURATION,
  });
  return token;
}

function refreshSessionExpiry(token) {
  const session = sessions.get(token);
  if (session) {
    session.son_kullanma = Date.now() + SESSION_DURATION;
  }
}

function validateSession(token) {
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.son_kullanma) {
    sessions.delete(token);
    return null;
  }
  refreshSessionExpiry(token);
  return session;
}

function getSessionToken(headers) {
  const auth = headers['authorization'] || headers['Authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now > session.son_kullanma) {
      sessions.delete(token);
    }
  }
}

function requireAuth(req, res) {
  const token = getSessionToken(req.headers);
  if (!token) {
    sendJson(res, 401, { error: 'Giris yapmadiginiz için erisim reddedildi.' });
    return null;
  }
  const session = validateSession(token);
  if (!session) {
    sendJson(res, 401, { error: 'Oturum surecisi doldu. Lutfen tekrar giris yapin.' });
    return null;
  }
  return session;
}

function loadDoctors() {
  if (!fs.existsSync(doctorsFile)) {
    return [];
  }
  const raw = fs.readFileSync(doctorsFile, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : (parsed.doktorlar || []);
}

function saveDoctors(doctors) {
  fs.writeFileSync(doctorsFile, JSON.stringify(doctors, null, 2), 'utf8');
}

// ─── URL Parse ───────────────────────────────────────────────────────────────

function parseCaseIdFromUrl(url) {
  // /api/cases/CASE-100001 → CASE-100001
  const match = url.match(/^\/api\/cases\/([A-Za-z0-9_-]+)$/);
  return match ? match[1] : null;
}

// ─── Başlatma ────────────────────────────────────────────────────────────────

ensureDataFile();
initVersions();

setInterval(cleanupExpiredSessions, 5 * 60 * 1000);

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true });
    return;
  }

  // GET /api/doctors — Doktor listesini döndür (şifresiz)
  if (req.url === '/api/doctors' && req.method === 'GET') {
    try {
      const doctors = loadDoctors();
      const publicDoctors = doctors.map((d) => ({
        id: d.id,
        ad: d.ad,
      }));
      sendJson(res, 200, publicDoctors);
    } catch (error) {
      sendJson(res, 500, { error: 'Doktor listesi yuklenemedi: ' + error.message });
    }
    return;
  }

  // POST /api/login — Giriş yapma (doktor seçimi ve şifre ile)
  if (req.url === '/api/login' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { doktor_id, sifre } = JSON.parse(body);

      if (!doktor_id) {
        sendJson(res, 400, { error: 'Lutfen bir doktor seciniz.' });
        return;
      }

      if (!sifre) {
        sendJson(res, 400, { error: 'Sifre bos birakilamaz.' });
        return;
      }

      const doctors = loadDoctors();
      const doktor = doctors.find((d) => d.id === doktor_id);

      if (!doktor) {
        sendJson(res, 401, { error: 'Secilen doktor bulunamadi.' });
        return;
      }

      const passwordMatch = await bcrypt.compare(sifre, doktor.sifre_hash);
      if (!passwordMatch) {
        sendJson(res, 401, { error: 'Sifre hatali.' });
        return;
      }

      const token = createSession(doktor.id);
      sendJson(res, 200, {
        ok: true,
        token,
        doktor_id: doktor.id,
        doktor_adi: doktor.ad,
      });
    } catch (error) {
      sendJson(res, 500, { error: 'Giris islemi basarisiz: ' + error.message });
    }
    return;
  }

  // DELETE /api/logout — Oturumu sonlandırma
  if (req.url === '/api/logout' && req.method === 'DELETE') {
    const token = getSessionToken(req.headers);
    if (token) {
      sessions.delete(token);
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  // GET /api/public/cases — Genel vaka listesi (şifresiz takip ekranı için)
  if (req.url === '/api/public/cases' && req.method === 'GET') {
    try {
      const cases = readCases();
      const withVersions = cases.map((c) => ({
        ...c,
        _version: caseVersions.get(c.case_id) || 1,
      }));
      sendJson(res, 200, withVersions);
    } catch (error) {
      sendJson(res, 500, { error: 'Vakalar yuklenemedi: ' + error.message });
    }
    return;
  }

  // GET /api/public/download-completed — Tamamlanan vakaları JSON olarak indirme
  if (req.url === '/api/public/download-completed' && req.method === 'GET') {
    try {
      if (fs.existsSync(completedFile)) {
        const raw = fs.readFileSync(completedFile, 'utf8');
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': 'attachment; filename=tamamlanan-vakalar.json',
        });
        res.end(raw);
      } else {
        sendJson(res, 404, { error: 'Tamamlanan vakalar dosyası bulunamadı.' });
      }
    } catch (error) {
      sendJson(res, 500, { error: 'Dosya indirilemedi: ' + error.message });
    }
    return;
  }

  // POST /api/public/reset-cases — Vakaları sıfırlama (şifresiz takip ekranı için)
  if (req.url === '/api/public/reset-cases' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { case_ids, reset_all } = JSON.parse(body);

      let cases = readCases();

      if (reset_all) {
        cases = cases.map((c) => ({
          ...c,
          doctor_a: {
            imaging_choice: null,
            clinical_pattern: null,
            confidence: null,
            ai_action: null,
            treatment_decision: null,
            triage: null,
            dataset_revision: null,
            included_in_decision_set: false,
            submitted_at: null,
          },
          doctor_b: {
            imaging_choice: null,
            clinical_pattern: null,
            confidence: null,
            ai_action: null,
            treatment_decision: null,
            triage: null,
            dataset_revision: null,
            included_in_decision_set: false,
            submitted_at: null,
          },
          history: [],
          _version: (caseVersions.get(c.case_id) || 1) + 1,
        }));

        cases.forEach((c) => {
          caseVersions.set(c.case_id, c._version);
        });
      } else if (Array.isArray(case_ids)) {
        const resetSet = new Set(case_ids);
        cases = cases.map((c) => {
          if (resetSet.has(c.case_id)) {
            const nextVer = (caseVersions.get(c.case_id) || 1) + 1;
            caseVersions.set(c.case_id, nextVer);
            return {
              ...c,
              doctor_a: {
                imaging_choice: null,
                clinical_pattern: null,
                confidence: null,
                ai_action: null,
                treatment_decision: null,
                triage: null,
                dataset_revision: null,
                included_in_decision_set: false,
                submitted_at: null,
              },
              doctor_b: {
                imaging_choice: null,
                clinical_pattern: null,
                confidence: null,
                ai_action: null,
                treatment_decision: null,
                triage: null,
                dataset_revision: null,
                included_in_decision_set: false,
                submitted_at: null,
              },
              history: [],
              _version: nextVer,
            };
          }
          return c;
        });
      }

      createBackup();
      writeCases(cases);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 500, { error: 'Sifirlama basarisiz: ' + error.message });
    }
    return;
  }

  // POST /api/change-password — Sifre degistirme (sadece giriş yapmis doktorlar icin)
  if (req.url === '/api/change-password' && req.method === 'POST') {
    const session = requireAuth(req, res);
    if (!session) return;

    try {
      const body = await readBody(req);
      const { sifre_yeni, sifre_eski } = JSON.parse(body);

      if (!sifre_yeni || !sifre_eski) {
        sendJson(res, 400, { error: 'Eski ve yeni sifre zorunludur.' });
        return;
      }

      if (sifre_yeni.length < 6) {
        sendJson(res, 400, { error: 'Yeni sifre en az 6 karakter olmalidir.' });
        return;
      }

      const doctors = loadDoctors();
      const doktorIndex = doctors.findIndex((d) => d.id === session.doktor_id);

      if (doktorIndex === -1) {
        sendJson(res, 404, { error: 'Doktor kaydi bulunamadi.' });
        return;
      }

      const doktor = doctors[doktorIndex];
      const oldPasswordMatch = await bcrypt.compare(sifre_eski, doktor.sifre_hash);
      if (!oldPasswordMatch) {
        sendJson(res, 401, { error: 'Eski sifre hatali.' });
        return;
      }

      const newHash = await bcrypt.hash(sifre_yeni, 10);
      doctors[doktorIndex].sifre_hash = newHash;
      saveDoctors(doctors);

      sendJson(res, 200, { ok: true, mesaj: 'Sifre basariyla degistirildi.' });
    } catch (error) {
      sendJson(res, 500, { error: 'Sifre degistirilemedi: ' + error.message });
    }
    return;
  }

  // GET /api/cases — Tüm vakaları döndür (versiyonlarıyla birlikte)
  if (req.url === '/api/cases' && req.method === 'GET') {
    const session = requireAuth(req, res);
    if (!session) return;
    try {
      const cases = readCases();
      const withVersions = cases.map((c) => ({
        ...c,
        _version: caseVersions.get(c.case_id) || 1,
      }));
      sendJson(res, 200, withVersions);
    } catch (error) {
      sendJson(res, 500, { error: 'Kayit dosyasi okunamadi.' });
    }
    return;
  }

  // PUT /api/cases — Eski endpoint (geriye uyumluluk, yedek oluşturur)
  if (req.url === '/api/cases' && req.method === 'PUT') {
    const session = requireAuth(req, res);
    if (!session) return;
    try {
      const body = await readBody(req);
      const cases = JSON.parse(body);

      if (!Array.isArray(cases)) {
        sendJson(res, 400, { error: 'Vaka listesi bekleniyor.' });
        return;
      }

      createBackup();
      // Versiyonları güncelle
      cases.forEach((c) => {
        const current = caseVersions.get(c.case_id) || 0;
        caseVersions.set(c.case_id, current + 1);
        c._version = current + 1;
      });
      writeCases(cases);
      sendJson(res, 200, { ok: true, saved_at: new Date().toISOString() });
    } catch (error) {
      sendJson(res, 500, { error: 'Kayit dosyasi yazilamadi.' });
    }
    return;
  }

  // PATCH /api/cases/:caseId — Tek vaka güncelleme (race-condition korumalı)
  const patchCaseId = parseCaseIdFromUrl(req.url);
  if (patchCaseId && req.method === 'PATCH') {
    const session = requireAuth(req, res);
    if (!session) return;
    try {
      const body = await readBody(req);
      const patch = JSON.parse(body);

      if (!patch.doctor_key || !patch.data) {
        sendJson(res, 400, { error: 'doctor_key ve data alanlari zorunludur.' });
        return;
      }

      const validKeys = ['doctor_a', 'doctor_b'];
      if (!validKeys.includes(patch.doctor_key)) {
        sendJson(res, 400, { error: 'doctor_key doctor_a veya doctor_b olmali.' });
        return;
      }

      // Versiyon kontrolü
      const clientVersion = patch._version;
      const serverVersion = caseVersions.get(patchCaseId) || 1;

      if (clientVersion !== undefined && clientVersion !== serverVersion) {
        // Çakışma! Client'ın verisi eski.
        sendJson(res, 409, {
          error: 'Versiyon cakismasi. Vaka baska bir kullanici tarafindan guncellenmis.',
          server_version: serverVersion,
          client_version: clientVersion,
          case_id: patchCaseId,
        });
        return;
      }

      // Dosyadan oku, hedef vakayı bul
      const cases = readCases();
      const caseIndex = cases.findIndex((c) => c.case_id === patchCaseId);

      if (caseIndex === -1) {
        sendJson(res, 404, { error: 'Vaka bulunamadi.', case_id: patchCaseId });
        return;
      }

      // Sadece ilgili doktor alanını güncelle (diğer doktorun verisine dokunma)
      const targetCase = cases[caseIndex];
      targetCase[patch.doctor_key] = patch.data;

      // Kararlar uyuşmuyorsa diğer doktorun onayını sıfırla (tekrar onayına düşmesi için)
      const otherKey = patch.doctor_key === 'doctor_a' ? 'doctor_b' : 'doctor_a';
      const peer = targetCase[otherKey];
      if (peer && peer.submitted_at) {
        const match = (
          patch.data.imaging_choice === peer.imaging_choice &&
          patch.data.treatment_decision === peer.treatment_decision &&
          patch.data.triage === peer.triage &&
          patch.data.ai_action === peer.ai_action
        );
        if (!match) {
          targetCase[otherKey] = {
            ...peer,
            submitted_at: null,
            included_in_decision_set: false,
          };
        }
      }

      // Ek alanlar varsa merge et (history, dataset_revision vb.)
      if (patch.history_entry) {
        if (!Array.isArray(targetCase.history)) targetCase.history = [];
        targetCase.history.push(patch.history_entry);
      }
      if (patch.dataset_revision) {
        targetCase.dataset_revision = patch.dataset_revision;
      }
      if (patch.decision_set_entries) {
        targetCase.decision_set_entries = patch.decision_set_entries;
      }

      // Versiyon artır
      const newVersion = serverVersion + 1;
      caseVersions.set(patchCaseId, newVersion);
      targetCase._version = newVersion;
      cases[caseIndex] = targetCase;

      // Yedek oluştur ve kaydet
      createBackup();
      writeCases(cases);

      sendJson(res, 200, {
        ok: true,
        case_id: patchCaseId,
        _version: newVersion,
        saved_at: new Date().toISOString(),
      });
    } catch (error) {
      sendJson(res, 500, { error: 'Vaka guncellenemedi: ' + error.message });
    }
    return;
  }

  // SPA / statik dosya sunumu (React build)
  if (req.method === 'GET' && !req.url.startsWith('/api/')) {
    const buildDir = path.join(__dirname, 'build');
    try {
      serveStatic(buildDir, { etag: true, cacheControl: 'public, max-age=86400' })(req, res, () => {
        const indexPath = path.join(buildDir, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          fs.createReadStream(indexPath).pipe(res);
        } else {
          sendJson(res, 404, { error: 'Kayit dosyasi bulunamadi. once npm run build calistirin.' });
        }
      });
      return;
    } catch (error) {
      sendJson(res, 500, { error: 'Statik dosya sunulamadi: ' + error.message });
      return;
    }
  }

  sendJson(res, 404, { error: 'Bulunamadi.' });
});

server.listen(PORT, () => {
  console.log(`Radyoloji veri servisi http://localhost:${PORT} adresinde calisiyor.`);
  console.log(`Kayit dosyasi (Aktif): ${dataFile}`);
  console.log(`Tamamlanan vakalar dosyası: ${completedFile}`);
  console.log(`Yedek klasoru: ${backupDir}`);
});
