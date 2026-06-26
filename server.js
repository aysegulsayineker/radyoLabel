const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const serveStatic = require('serve-static');
const { Pool } = require('pg');

const PORT = process.env.PORT || 4000;
const dataDir = path.join(__dirname, 'server', 'data');
const doctorsFile = path.join(dataDir, 'doctors.json');
const backupDir = path.join(dataDir, 'backups');
const dataFile = path.join(dataDir, 'vaka-kayitlari.json');
const completedFile = path.join(dataDir, 'tamamlanan-vakalar.json');
const sourceFile = path.join(__dirname, 'src', 'data', 'hasta_veri.json');
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 saate kadar valid
const sessions = new Map(); // token => { doktor_id, son_kullanma }

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/radyolabel';
const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

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

async function initDatabase() {
  try {
    // 1. cases tablosunu oluştur
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cases (
        case_id VARCHAR(50) PRIMARY KEY,
        data JSONB NOT NULL,
        is_completed BOOLEAN DEFAULT FALSE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('PostgreSQL "cases" tablosu hazır.');

    // 2. doctors tablosunu oluştur
    await pool.query(`
      CREATE TABLE IF NOT EXISTS doctors (
        id VARCHAR(50) PRIMARY KEY,
        ad VARCHAR(100) NOT NULL,
        sifre_hash VARCHAR(255) NOT NULL
      );
    `);
    console.log('PostgreSQL "doctors" tablosu hazır.');

    // 3. doctors tablosu boş mu kontrol et, boşsa doctors.json'dan veya varsayılanlardan seed et
    const docCountRes = await pool.query('SELECT COUNT(*) FROM doctors');
    const docCount = parseInt(docCountRes.rows[0].count);
    if (docCount === 0) {
      console.log('doctors tablosu boş, veriler aktarılıyor...');
      let doctorList = [];
      if (fs.existsSync(doctorsFile)) {
        const raw = fs.readFileSync(doctorsFile, 'utf8');
        try {
          const parsed = JSON.parse(raw);
          doctorList = Array.isArray(parsed) ? parsed : (parsed.doktorlar || []);
        } catch (e) { /* ignore */ }
      }
      
      // Dosya yoksa veya boşsa, varsayılan doktorları ekle
      if (doctorList.length === 0) {
        doctorList = [
          {
            id: 'doktor-01',
            ad: 'Dr. Serdar Solak',
            sifre_hash: '$2b$10$z9zxp76chkfYWHLGkqbg.uVcB0Hg78DX1Oxi6veQ1BvO6Il9NP7hC'
          },
          {
            id: 'doktor-02',
            ad: 'Dr. Ayşe Kaya',
            sifre_hash: '$2b$10$vScpCHWDca7tlw9w9SzTB.DAnDbRuro4fKAH6Wen2XFni6Gb9ugO6'
          }
        ];
      }

      for (const d of doctorList) {
        await pool.query(
          'INSERT INTO doctors (id, ad, sifre_hash) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
          [d.id, d.ad, d.sifre_hash]
        );
      }
      console.log('Doktorlar veritabanına başarıyla aktarıldı.');
    }

    // 4. cases tablosu boş mu kontrol et
    const res = await pool.query('SELECT COUNT(*) FROM cases');
    const count = parseInt(res.rows[0].count);
    if (count === 0) {
      console.log('Veritabanı boş, veri taşıma (seeding) başlatılıyor...');
      let initialCases = [];
      
      // Önce yerel vaka-kayitlari.json ve tamamlanan-vakalar.json var mı kontrol et, varsa oradan oku ve birleştir
      let localActive = [];
      if (fs.existsSync(dataFile)) {
        const raw = fs.readFileSync(dataFile, 'utf8');
        try {
          localActive = JSON.parse(raw);
        } catch (e) { /* ignore */ }
      }
      let localCompleted = [];
      if (fs.existsSync(completedFile)) {
        const raw = fs.readFileSync(completedFile, 'utf8');
        try {
          localCompleted = JSON.parse(raw);
        } catch (e) { /* ignore */ }
      }
      
      initialCases = [...localActive, ...localCompleted];

      // Yoksa veya boşsa, sourceFile'dan (hasta_veri.json) oku ve ilklendir
      if (initialCases.length === 0 && fs.existsSync(sourceFile)) {
        const raw = fs.readFileSync(sourceFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          initialCases = parsed.map((c, idx) => {
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
              decision_set_entries: [],
            };
          });
        }
      }

      // Veritabanına aktar
      if (initialCases.length > 0) {
        for (const c of initialCases) {
          const isCompleted = Boolean(c.doctor_a?.submitted_at && c.doctor_b?.submitted_at);
          await pool.query(
            'INSERT INTO cases (case_id, data, is_completed) VALUES ($1, $2, $3) ON CONFLICT (case_id) DO NOTHING',
            [c.case_id, JSON.stringify(c), isCompleted]
          );
        }
        console.log(`Başarıyla ${initialCases.length} vaka veritabanına taşındı.`);
      }
    }
  } catch (err) {
    console.error('Veritabanı ilklendirme hatası:', err.message);
  }
}

async function initVersions() {
  try {
    const cases = await readCases();
    if (Array.isArray(cases)) {
      cases.forEach((c) => {
        const version = c._version || 1;
        caseVersions.set(c.case_id, version);
      });
    }
  } catch (error) {
    // İlk çalıştırmada tablo henüz hazır olmayabilir
  }
}

function createBackup() {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (fs.existsSync(dataFile)) {
      const backupFile = path.join(backupDir, `vaka-kayitlari-${stamp}.json`);
      fs.copyFileSync(dataFile, backupFile);
    }
  } catch (error) {
    // ignore
  }
}

async function readCases() {
  try {
    const res = await pool.query('SELECT data FROM cases ORDER BY case_id ASC');
    return res.rows.map((row) => row.data);
  } catch (err) {
    console.error('readCases veritabanı okuma hatası:', err.message);
    return [];
  }
}

async function writeSingleCase(c) {
  try {
    const isCompleted = Boolean(c.doctor_a?.submitted_at && c.doctor_b?.submitted_at);
    await pool.query(
      'INSERT INTO cases (case_id, data, is_completed) VALUES ($1, $2, $3) ON CONFLICT (case_id) DO UPDATE SET data = EXCLUDED.data, is_completed = EXCLUDED.is_completed, updated_at = CURRENT_TIMESTAMP',
      [c.case_id, JSON.stringify(c), isCompleted]
    );

    // Her 100 tamamlanmış vakada bir yedek (backup) al
    const completedRes = await pool.query('SELECT COUNT(*) FROM cases WHERE is_completed = TRUE');
    const completedCount = parseInt(completedRes.rows[0].count);
    if (completedCount % 100 === 0 && completedCount > 0) {
      try {
        const allCompletedRes = await pool.query('SELECT data FROM cases WHERE is_completed = TRUE ORDER BY case_id ASC');
        const completedCases = allCompletedRes.rows.map(r => r.data);
        const backupPath = path.join(backupDir, `tamamlanan-vakalar-${completedCount}.json`);
        fs.writeFileSync(backupPath, JSON.stringify(completedCases, null, 2), 'utf8');
        console.log(`[Backup] Tamamlanan vaka sayısı ${completedCount} olduğu için yedek alındı: ${backupPath}`);
      } catch (err) {
        // ignore
      }
    }
  } catch (err) {
    console.error('writeSingleCase hatası:', err.message);
  }
}

async function writeCases(cases) {
  try {
    for (const c of cases) {
      const isCompleted = Boolean(c.doctor_a?.submitted_at && c.doctor_b?.submitted_at);
      await pool.query(
        'INSERT INTO cases (case_id, data, is_completed) VALUES ($1, $2, $3) ON CONFLICT (case_id) DO UPDATE SET data = EXCLUDED.data, is_completed = EXCLUDED.is_completed, updated_at = CURRENT_TIMESTAMP',
        [c.case_id, JSON.stringify(c), isCompleted]
      );
    }
  } catch (err) {
    console.error('writeCases hatası:', err.message);
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

async function loadDoctors() {
  try {
    const res = await pool.query('SELECT id, ad, sifre_hash FROM doctors ORDER BY id ASC');
    return res.rows;
  } catch (err) {
    console.error('loadDoctors hatası:', err.message);
    return [];
  }
}

async function saveDoctors(doctors) {
  try {
    for (const d of doctors) {
      await pool.query(
        'INSERT INTO doctors (id, ad, sifre_hash) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET ad = EXCLUDED.ad, sifre_hash = EXCLUDED.sifre_hash',
        [d.id, d.ad, d.sifre_hash]
      );
    }
  } catch (err) {
    console.error('saveDoctors hatası:', err.message);
  }
}

// ─── URL Parse ───────────────────────────────────────────────────────────────

function parseCaseIdFromUrl(url) {
  // /api/cases/CASE-100001 → CASE-100001
  const match = url.match(/^\/api\/cases\/([A-Za-z0-9_-]+)$/);
  return match ? match[1] : null;
}

// ─── Başlatma ────────────────────────────────────────────────────────────────

setInterval(cleanupExpiredSessions, 5 * 60 * 1000);

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true });
    return;
  }

  // GET /api/doctors — Doktor listesini döndür (şifresiz)
  if (req.url === '/api/doctors' && req.method === 'GET') {
    try {
      const doctors = await loadDoctors();
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

      const doctors = await loadDoctors();
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
      const cases = await readCases();
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
  if (req.url.startsWith('/api/public/download-completed') && req.method === 'GET') {
    try {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const part = parsedUrl.searchParams.get('part') || 'all';

      let query = 'SELECT data FROM cases WHERE is_completed = TRUE';
      let filename = 'tamamlanan-vakalar.json';

      if (part === '1') {
        query += " AND case_id <= 'CASE-101000'";
        filename = 'tamamlanan-vakalar-part-1.json';
      } else if (part === '2') {
        query += " AND case_id > 'CASE-101000'";
        filename = 'tamamlanan-vakalar-part-2.json';
      }

      query += ' ORDER BY case_id ASC';

      const dbRes = await pool.query(query);
      const completedCases = dbRes.rows.map((row) => row.data);

      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename=${filename}`,
      });
      res.end(JSON.stringify(completedCases, null, 2));
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

      const cases = await readCases();

      if (reset_all) {
        const resetCases = cases.map((c) => ({
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

        resetCases.forEach((c) => {
          caseVersions.set(c.case_id, c._version);
        });

        createBackup();
        await writeCases(resetCases);
      } else if (Array.isArray(case_ids)) {
        const resetSet = new Set(case_ids);
        createBackup();
        for (const c of cases) {
          if (resetSet.has(c.case_id)) {
            const nextVer = (caseVersions.get(c.case_id) || 1) + 1;
            caseVersions.set(c.case_id, nextVer);
            const resetCase = {
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
            await writeSingleCase(resetCase);
          }
        }
      }

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

      const doctors = await loadDoctors();
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
      await saveDoctors(doctors);

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
      const cases = await readCases();
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
      await writeCases(cases);
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
      const cases = await readCases();
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
      await writeSingleCase(targetCase);

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

async function startServer() {
  try {
    ensureDataFile();
    await initDatabase();
    await initVersions();
    
    server.listen(PORT, () => {
      console.log(`Radyoloji veri servisi http://localhost:${PORT} adresinde calisiyor.`);
      console.log(`Kayit dosyasi (Aktif): ${dataFile}`);
      console.log(`Tamamlanan vakalar dosyası: ${completedFile}`);
      console.log(`Yedek klasoru: ${backupDir}`);
    });
  } catch (err) {
    console.error('Sunucu baslatilamadi:', err.message);
  }
}

startServer();
