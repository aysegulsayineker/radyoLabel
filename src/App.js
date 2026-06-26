import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Clock, Moon, PencilLine, Sun } from 'lucide-react';
import hastaVeri from './data/hasta_veri.json';
import { buildAiSuggestion } from './utils/aiSuggestionEngine';
import Workstation from './components/Workstation';
import Login from './components/Login';
import TrackingDashboard from './components/TrackingDashboard';
import './App.css';

const THEME_KEY = 'radyoloji-theme';
const STORAGE_KEY = 'radyoloji-vaka-overlay-v1';
const LEGACY_STORAGE_KEY = 'radyoloji-vaka-kayitlari-v4';
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? `http://${window.location.hostname}:4000/api`
  : `${window.location.origin}/api`;
const API_URL = `${API_BASE}/cases`;
const TOKEN_KEY = 'radyoloji-token';
const DOKTOR_ID_KEY = 'radyoloji-doktor-id';

const DOKTOR_SLOT_MAP = {
  'doktor-01': 'A',
  'doktor-02': 'B',
};

function getStoredAuth() {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const doktorId = sessionStorage.getItem(DOKTOR_ID_KEY);
    const doktorAdi = sessionStorage.getItem('radyoloji-doktor-adi');
    if (token && doktorId) return { token, doktorId, doktorAdi };
  } catch (error) { /* ignore */ }
  return null;
}

function getInitialRole(doktorId) {
  if (!doktorId) {
    const params = new URLSearchParams(window.location.search);
    const panel = (params.get('panel') || params.get('reviewer') || '').toLowerCase();
    if (panel === '1' || panel === 'a') return 'A';
    if (panel === '2' || panel === 'b') return 'B';
    return 'A';
  }
  return DOKTOR_SLOT_MAP[doktorId] || 'A';
}

function getInitialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch (error) {
    // Tarayici yedegi okunamazsa varsayilan tema kullanilir.
  }
  return 'light';
}

const emptyDoctor = {
  imaging_choice: null,
  clinical_pattern: null,
  confidence: null,
  ai_action: null,
  treatment_decision: null,
  triage: null,
  dataset_revision: null,
  included_in_decision_set: false,
  submitted_at: null,
};

function doctorKeyFor(rol) {
  return rol === 'A' ? 'doctor_a' : 'doctor_b';
}

function getDoctorEntries(vaka) {
  const entries = [];
  const conditions = vaka.special_conditions || vaka.contraindications || {};
  ['doctor_a', 'doctor_b'].forEach((key) => {
    const doctor = vaka[key] || {};
    if (!doctor.included_in_decision_set) return;

    entries.push({
      reviewer_key: key,
      case_id: vaka.case_id,
      imaging_choice: doctor.imaging_choice,
      treatment_decision: doctor.treatment_decision,
      triage: doctor.triage,
      clinical_pattern: doctor.clinical_pattern,
      confidence: doctor.confidence,
      complaint: doctor.dataset_revision?.complaint || vaka.complaint,
      symptoms: doctor.dataset_revision?.symptoms || vaka.symptoms || [],
      urgency_level: doctor.dataset_revision?.urgency_level || vaka.urgency_level,
      pregnancy_status: doctor.dataset_revision?.pregnancy_status || conditions.pregnancy_status || 'Yok',
      renal_function: doctor.dataset_revision?.renal_function || conditions.renal_function || 'Normal',
      contrast_allergy: doctor.dataset_revision?.contrast_allergy || conditions.contrast_allergy || 'Yok',
      metal_implant: doctor.dataset_revision?.metal_implant || conditions.metal_implant || 'Yok',
      hemodynamic_status: doctor.dataset_revision?.hemodynamic_status || conditions.hemodynamic_status || 'Stabil',
      ai_action: doctor.ai_action,
      created_at: doctor.submitted_at,
    });
  });

  return entries;
}

function markPriority(entries) {
  return entries.map((entry) => {
    const hasMatchingPeer = entries.some((other) => (
      other.reviewer_key !== entry.reviewer_key
      && other.imaging_choice === entry.imaging_choice
      && other.treatment_decision === entry.treatment_decision
      && other.triage === entry.triage
    ));

    return {
      ...entry,
      priority: hasMatchingPeer ? 'iki_uzman_onayli' : 'uzman_onayli',
    };
  });
}

function deriveStatus(vaka) {
  const aDone = Boolean(vaka.doctor_a?.submitted_at);
  const bDone = Boolean(vaka.doctor_b?.submitted_at);

  if (aDone && bDone) return 'tamamlandi';
  if (aDone || bDone) return 'kismen_islendi';
  return 'bekliyor';
}

function normalizeCase(vaka) {
  const aiSuggestion = vaka.ai_suggestion || buildAiSuggestion(vaka);
  const doctorA = { ...emptyDoctor, ...(vaka.doctor_a || {}) };
  const doctorB = { ...emptyDoctor, ...(vaka.doctor_b || {}) };
  const base = {
    ...vaka,
    doctor_a: doctorA,
    doctor_b: doctorB,
    ai_suggestion: aiSuggestion,
    dataset_revision: vaka.dataset_revision || {
      complaint: vaka.complaint || '',
      symptoms: vaka.symptoms || [],
      urgency_level: vaka.urgency_level || 'Orta',
      pregnancy_status: vaka.pregnancy_status || 'Yok',
      renal_function: vaka.renal_function || 'Normal',
      contrast_allergy: vaka.contrast_allergy || 'Yok',
      metal_implant: vaka.metal_implant || 'Yok',
      hemodynamic_status: vaka.hemodynamic_status || 'Stabil',
      edited_at: null,
      edited_by: null,
    },
    history: vaka.history || [],
  };
  const decisionSetEntries = markPriority(
    Array.isArray(vaka.decision_set_entries)
      ? vaka.decision_set_entries
      : getDoctorEntries(base)
  );

  return {
    ...base,
    status: deriveStatus(base),
    decision_set_entries: decisionSetEntries,
    priority_consensus: decisionSetEntries.some((entry) => entry.priority === 'iki_uzman_onayli'),
  };
}

function caseHasOverlay(vaka) {
  return Boolean(
    vaka.doctor_a?.submitted_at
    || vaka.doctor_b?.submitted_at
    || vaka.dataset_revision?.edited_at
    || (vaka.history && vaka.history.length > 0)
  );
}

function extractCaseOverlay(vaka) {
  return {
    case_id: vaka.case_id,
    doctor_a: vaka.doctor_a,
    doctor_b: vaka.doctor_b,
    dataset_revision: vaka.dataset_revision,
    complaint: vaka.complaint,
    symptoms: vaka.symptoms,
    urgency_level: vaka.urgency_level,
    pregnancy_status: vaka.pregnancy_status,
    renal_function: vaka.renal_function,
    contrast_allergy: vaka.contrast_allergy,
    metal_implant: vaka.metal_implant,
    hemodynamic_status: vaka.hemodynamic_status,
    history: vaka.history,
  };
}

function extractOverlays(cases) {
  return cases.filter(caseHasOverlay).map(extractCaseOverlay);
}

function applyOverlay(vaka, overlay) {
  if (!overlay) return vaka;
  return { ...vaka, ...overlay };
}

function saveOverlay(cases) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(extractOverlays(cases)));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch (error) {
    console.warn('Tarayici yedegi kaydedilemedi:', error);
  }
}

function loadOverlayMap() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const overlays = JSON.parse(saved);
      return new Map(overlays.map((overlay) => [overlay.case_id, overlay]));
    }

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      const overlays = extractOverlays(parsed);
      saveOverlay(parsed);
      return new Map(overlays.map((overlay) => [overlay.case_id, overlay]));
    }
  } catch (error) {
    console.warn('Tarayici yedegi okunamadi:', error);
  }

  return new Map();
}

function loadCases() {
  const overlayMap = loadOverlayMap();
  return hastaVeri.map((vaka) => normalizeCase(applyOverlay(vaka, overlayMap.get(vaka.case_id))));
}

function getCaseCategory(vaka, rol) {
  if (!rol) return 'islerim';

  const caseIndex = parseInt(vaka.case_id.replace('CASE-', '')) - 100001;
  const initialAssignee = caseIndex < 1000 ? 'A' : 'B';

  const doctorKey = rol === 'A' ? 'doctor_a' : 'doctor_b';
  const peerKey = rol === 'A' ? 'doctor_b' : 'doctor_a';

  const myDecision = vaka[doctorKey] || {};
  const peerDecision = vaka[peerKey] || {};

  const mySubmitted = Boolean(myDecision.submitted_at);
  const peerSubmitted = Boolean(peerDecision.submitted_at);

  if (mySubmitted && peerSubmitted) {
    return 'tamamlanan';
  }
  if (!mySubmitted && peerSubmitted) {
    return 'diger_havuz';
  }
  if (!mySubmitted && !peerSubmitted && initialAssignee === rol) {
    return 'islerim';
  }

  return 'bekleyen_diger';
}

function doctorActionLabel(action) {
  const labels = {
    islerim: 'Bekliyor',
    diger_havuz: 'Uzman Onayında',
    tamamlanan: 'Tamamlandı',
    bekleyen_diger: 'Diğer Uzmanda'
  };

  return labels[action] || action;
}

function canDoctorWork(vaka, rol) {
  if (!rol) return false;
  const cat = getCaseCategory(vaka, rol);
  return cat === 'islerim' || cat === 'diger_havuz';
}

function getDoctorAction(vaka, rol) {
  return getCaseCategory(vaka, rol);
}

const LIST_TABS = [
  { key: 'islerim', label: 'İlk Havuzum', Icon: Clock },
  { key: 'diger_havuz', label: 'Uzman Onayındakiler', Icon: PencilLine },
  { key: 'tamamlanan', label: 'Akışı Bitenler', Icon: CheckCircle },
];

export default function App() {
  const [page, setPage] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('page') === 'takip' || window.location.pathname === '/takip') return 'takip';
    return 'app';
  });

  function handleGoToApp() {
    setPage('app');
    const url = new URL(window.location);
    url.searchParams.delete('page');
    if (window.location.pathname === '/takip') {
      window.history.pushState({}, '', '/');
    } else {
      window.history.pushState({}, '', url);
    }
  }

  const [theme, setTheme] = useState(getInitialTheme);
  const [oturum, setOturum] = useState(getStoredAuth);
  const [rol] = useState(() => getInitialRole(oturum?.doktorId));
  const [vakalar, setVakalar] = useState(loadCases);
  const [selectedId, setSelectedId] = useState(() => loadCases()[0]?.case_id || null);
  const [arananId, setArananId] = useState('');
  const [aktifListe, setAktifListe] = useState('islerim');
  const [listeSayfasi, setListeSayfasi] = useState(0);
  const [serverStatus, setServerStatus] = useState('checking');
  const [saveError, setSaveError] = useState(null);

  const selectedIndex = selectedId ? vakalar.findIndex((vaka) => vaka.case_id === selectedId) : -1;
  const selectedCase = selectedIndex !== -1 ? vakalar[selectedIndex] : null;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (error) {
      // Tema tercihi kaydedilemezse uygulama akisi devam eder.
    }
  }, [theme]);

  useEffect(() => {
    if (!oturum?.token) {
      setServerStatus('unauthenticated');
      return;
    }
    const baslik = { 'Content-Type': 'application/json', Authorization: `Bearer ${oturum.token}` };
    fetch(API_URL, { headers: baslik, cache: 'no-store' })
      .then((response) => {
        if (response.status === 401) {
          sessionStorage.removeItem(TOKEN_KEY);
          sessionStorage.removeItem(DOKTOR_ID_KEY);
          setOturum(null);
          return null;
        }
        if (!response.ok) throw new Error('Veri servisi cevap vermedi.');
        return response.json();
      })
      .then((serverCases) => {
        if (!serverCases) return;
        const normalized = serverCases.map(normalizeCase);
        setVakalar(normalized);
        setSelectedId((currentId) => currentId || normalized[0]?.case_id || null);
        saveOverlay(normalized);
        setServerStatus('online');
      })
      .catch(() => {
        setServerStatus('offline');
      });
  }, [oturum?.token]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!oturum?.token) return;
      fetch(API_URL, { headers: { Authorization: `Bearer ${oturum.token}` }, cache: 'no-store' })
        .then((r) => {
          if (r.status === 401) {
            sessionStorage.removeItem(TOKEN_KEY);
            sessionStorage.removeItem(DOKTOR_ID_KEY);
            setOturum(null);
            return;
          }
          setServerStatus(r.ok ? 'online' : 'offline');
        })
        .catch(() => setServerStatus('offline'));
    }, 30000);
    return () => clearInterval(interval);
  }, [oturum?.token]);

  const stats = useMemo(() => {
    if (!rol) {
      return { islerim: vakalar.length, diger_havuz: 0, tamamlanan: 0 };
    }

    return LIST_TABS.reduce((acc, tab) => {
      acc[tab.key] = vakalar.filter((vaka) => getCaseCategory(vaka, rol) === tab.key).length;
      return acc;
    }, {});
  }, [rol, vakalar]);

  const visibleCases = useMemo(() => {
    const term = arananId.trim().toLowerCase();
    return vakalar.filter((vaka) => {
      if (term) {
        const haystack = [
          vaka.case_id,
          vaka.complaint,
          ...(vaka.symptoms || []),
        ].join(' ').toLowerCase();
        return haystack.includes(term);
      }
      if (!rol) return aktifListe === 'islerim';

      return getCaseCategory(vaka, rol) === aktifListe;
    });
  }, [aktifListe, arananId, rol, vakalar]);

  const visibleIndex = Math.max(0, visibleCases.findIndex((vaka) => vaka.case_id === selectedId));

  const progress = useMemo(() => {
    const completed = vakalar.filter((vaka) => {
      return vaka.doctor_a?.submitted_at && vaka.doctor_b?.submitted_at;
    }).length;
    const total = vakalar.length;
    const pct = total ? Math.round((completed / total) * 100) : 0;
    return { completed, total, pct };
  }, [vakalar]);

  useEffect(() => {
    if (visibleCases.length > 0) {
      const exists = visibleCases.some((v) => v.case_id === selectedId);
      if (!exists) {
        setSelectedId(visibleCases[0].case_id);
      }
    } else {
      setSelectedId(null);
    }
  }, [visibleCases, selectedId]);

  const casesPerPage = 18;
  const pageCount = Math.max(1, Math.ceil(visibleCases.length / casesPerPage));
  const safePage = Math.min(listeSayfasi, pageCount - 1);
  const pagedCases = visibleCases.slice(safePage * casesPerPage, safePage * casesPerPage + casesPerPage);

  function persist(nextCases) {
    setVakalar(nextCases);
    saveOverlay(nextCases);
  }

  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      ...(oturum?.token ? { Authorization: `Bearer ${oturum.token}` } : {}),
    };
  }

  function patchCase(caseId, doctorKey, doctorData, historyEntry, decisionSetEntries) {
    const targetCase = vakalar.find((v) => v.case_id === caseId);
    const clientVersion = targetCase?._version;

    fetch(`${API_URL}/${caseId}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({
        doctor_key: doctorKey,
        data: doctorData,
        history_entry: historyEntry || undefined,
        decision_set_entries: decisionSetEntries || undefined,
        _version: clientVersion,
      }),
    })
      .then((response) => {
        if (response.status === 409) {
          return fetch(API_URL, { headers: authHeaders() })
            .then((r) => r.json())
            .then((serverCases) => {
              const normalized = serverCases.map(normalizeCase);
              setVakalar(normalized);
              saveOverlay(normalized);
            });
        }
        if (!response.ok) throw new Error('Kayit basarisiz.');
        return response.json().then((result) => {
          if (result._version) {
            setVakalar((current) =>
              current.map((v) =>
                v.case_id === caseId ? { ...v, _version: result._version } : v
              )
            );
          }
        });
      })
      .catch(() => {
        setServerStatus('offline');
        setSaveError({ message: 'Karar sunucuya kaydedilemedi. Yerel yedek aktif.', timestamp: Date.now() });
      });
  }

  function updateCase(caseId, updater) {
    const nextCases = vakalar.map((vaka) => (
      vaka.case_id === caseId ? normalizeCase(updater(vaka)) : vaka
    ));
    persist(nextCases);

    const updated = nextCases.find((v) => v.case_id === caseId);
    const doctorKey = doctorKeyFor(rol);
    if (updated && oturum?.token) {
      patchCase(caseId, doctorKey, updated[doctorKey], null, updated.decision_set_entries);
    }
  }

  function handleDoctorUnlock(caseId) {
    updateCase(caseId, (vaka) => ({
      ...vaka,
      [doctorKeyFor(rol)]: { ...emptyDoctor },
    }));
  }

  function handleDoctorSubmit(caseId, payload) {
    const now = new Date().toISOString();
    const doctorKey = doctorKeyFor(rol);
    const included = payload.ai_action !== 'reddedildi';

    const doctorDecision = {
      imaging_choice: payload.imaging_choice,
      clinical_pattern: payload.clinical_pattern,
      confidence: payload.confidence,
      ai_action: payload.ai_action,
      treatment_decision: included ? payload.treatment_decision : null,
      triage: included ? payload.triage : null,
      dataset_revision: payload.dataset_revision,
      included_in_decision_set: included,
      submitted_at: now,
    };

    const historyEntry = {
      by: oturum?.doktorAdi || 'Uzman',
      action: included ? (payload.ai_action === 'duzenlendi' ? 'review_edited' : 'review_approved') : 'review_rejected',
      imaging_choice: payload.imaging_choice,
      ai_action: payload.ai_action,
      submitted_at: now,
    };

    const nextCases = vakalar.map((vaka) => {
      if (vaka.case_id !== caseId) return vaka;

      const otherRole = rol === 'A' ? 'B' : 'A';
      const otherKey = doctorKeyFor(otherRole);
      const peer = vaka[otherKey] || {};

      let updatedPeer = { ...peer };
      if (peer.submitted_at) {
        const match = (
          doctorDecision.imaging_choice === peer.imaging_choice &&
          doctorDecision.treatment_decision === peer.treatment_decision &&
          doctorDecision.triage === peer.triage &&
          doctorDecision.ai_action === peer.ai_action
        );
        if (!match) {
          updatedPeer = {
            ...peer,
            submitted_at: null,
            included_in_decision_set: false,
          };
        }
      }

      const nextCase = {
        ...vaka,
        [doctorKey]: doctorDecision,
        [otherKey]: updatedPeer,
        history: [...(vaka.history || []), historyEntry],
      };

      return normalizeCase({
        ...nextCase,
        decision_set_entries: markPriority(getDoctorEntries(nextCase)),
      });
    });

    persist(nextCases);

    const updatedCase = nextCases.find((v) => v.case_id === caseId);
    patchCase(
      caseId,
      doctorKey,
      doctorDecision,
      historyEntry,
      updatedCase?.decision_set_entries
    );

    const nextPending = nextCases.find((vaka) => {
      const cat = getCaseCategory(vaka, rol);
      return cat === 'islerim' || cat === 'diger_havuz';
    });
    if (nextPending) {
      setSelectedId(nextPending.case_id);
      setAktifListe(getCaseCategory(nextPending, rol));
      setListeSayfasi(0);
    }
  }

  function goToVisibleOffset(offset) {
    if (visibleCases.length === 0) return;
    const currentIdx = Math.max(0, visibleCases.findIndex((vaka) => vaka.case_id === selectedId));
    const nextIdx = Math.min(Math.max(currentIdx + offset, 0), visibleCases.length - 1);
    setSelectedId(visibleCases[nextIdx].case_id);
  }

  function handleLogin(loginData) {
    setOturum({
      token: loginData.token,
      doktorId: loginData.doktor_id,
      doktorAdi: loginData.doktor_adi,
    });
  }

  function handleLogout() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(DOKTOR_ID_KEY);
    sessionStorage.removeItem('radyoloji-doktor-adi');
    setOturum(null);
    setVakalar(loadCases());
    setAktifListe('islerim');
    setListeSayfasi(0);
  }

  if (page === 'takip') {
    return <TrackingDashboard onBack={handleGoToApp} apiUrl={API_BASE} />;
  }

  if (!oturum?.token) {
    return <Login onLogin={handleLogin} apiUrl={API_BASE} />;
  }

  return (
    <main className="app-shell">
      <aside className="dashboard">
        <div className="dashboard-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '2px' }}>
              <p className="eyebrow">Acil görüntüleme</p>
              {oturum?.doktorAdi && (
                <span className="doktor-adi-badge" title="Giriş Yapan Doktor">
                  {oturum.doktorAdi}
                </span>
              )}
            </div>
            <h1>Vakalar</h1>
          </div>
          <div className="header-sag">
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
              title={theme === 'light' ? 'Karanlık moda geç' : 'Açık moda geç'}
            >
              {theme === 'light' ? <Moon size={15} strokeWidth={2.2} /> : <Sun size={15} strokeWidth={2.2} />}
              <span>{theme === 'light' ? 'Karanlık' : 'Açık'}</span>
            </button>
            <button
              type="button"
              className="logout-buton"
              onClick={handleLogout}
              title="Giris yapilmis cikis yap"
            >
              Çıkış
            </button>
          </div>
        </div>

        <div className={`connection-status connection-status--${serverStatus}`}>
          <span className="connection-dot" />
          <span className="connection-label">
            {serverStatus === 'online' && 'Sunucu bagli'}
            {serverStatus === 'offline' && 'Sunucu baglantisi yok — yerel yedek aktif'}
            {serverStatus === 'checking' && 'Baglanti kontrol ediliyor...'}
            {serverStatus === 'unauthenticated' && 'Giris yapiniz'}
          </span>
        </div>

        {saveError && (
          <div className="save-error-banner" onClick={() => setSaveError(null)} title="Kapatmak icin tiklayin">
            <span className="save-error-icon">!</span>
            <span>{saveError.message}</span>
          </div>
        )}

        <div className="progress-bar-wrap">
          <div className="progress-meta">
            <span>{progress.completed} / {progress.total} tamamlandi</span>
            <span>%{progress.pct}</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>

        <div className="stats-grid">
          {LIST_TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              className={`stats-tab stats-tab-${
                key === 'islerim' ? 'bekleyen' :
                key === 'diger_havuz' ? 'duzenlenen' :
                'onaylanan'
              } ${aktifListe === key ? 'active' : ''}`}
              onClick={() => {
                setAktifListe(key);
                setListeSayfasi(0);
              }}
            >
              <Icon size={15} strokeWidth={2.2} />
              <strong>{stats[key] ?? 0}</strong>
              <span>{label}</span>
            </button>
          ))}
        </div>

        <label className="search-box">
          Vaka veya sikayet ara
          <input
            value={arananId}
            onChange={(event) => {
              setArananId(event.target.value);
              setListeSayfasi(0);
            }}
            placeholder="CASE-100001 veya dispne"
          />
        </label>

        <div className="case-list">
          {pagedCases.map((vaka) => {
            const action = rol ? getDoctorAction(vaka, rol) : 'bekliyor';
            const statusClass = 
              action === 'islerim' ? 'bekliyor' :
              action === 'diger_havuz' ? 'duzenlendi' :
              action === 'tamamlanan' ? 'onaylandi' :
              'reddedildi';
            return (
              <button
                key={vaka.case_id}
                className={`case-row case-${statusClass} ${vaka.case_id === selectedCase?.case_id ? 'active' : ''}`}
                onClick={() => setSelectedId(vaka.case_id)}
              >
                <span>
                  <strong>{vaka.case_id}</strong>
                  <small>{vaka.complaint}</small>
                </span>
                <em>{doctorActionLabel(action)}</em>
              </button>
            );
          })}
        </div>

        <div className="list-pager">
          <button type="button" onClick={() => setListeSayfasi(Math.max(safePage - 1, 0))} disabled={safePage === 0}>
            {'<'}
          </button>
          <span>{visibleCases.length === 0 ? 0 : safePage + 1} / {pageCount}</span>
          <button type="button" onClick={() => setListeSayfasi(Math.min(safePage + 1, pageCount - 1))} disabled={safePage >= pageCount - 1}>
            {'>'}
          </button>
        </div>
      </aside>

      {selectedCase ? (
        <Workstation
          key={`${selectedCase.case_id}-${rol}-${getDoctorAction(selectedCase, rol)}`}
          vaka={selectedCase}
          rol={rol}
          listIndex={visibleIndex}
          listTotal={visibleCases.length}
          canEdit={canDoctorWork(selectedCase, rol)}
          doctorAction={getDoctorAction(selectedCase, rol)}
          doctorActionLabel={doctorActionLabel}
          onNext={() => goToVisibleOffset(1)}
          onPrev={() => goToVisibleOffset(-1)}
          onDoctorSubmit={handleDoctorSubmit}
          onDoctorUnlock={handleDoctorUnlock}
        />
      ) : (
        <div className="empty-workstation">
          <div className="empty-content">
            <CheckCircle size={64} className="empty-icon" />
            <h2>Harika!</h2>
            <p>Bu havuzda işlem yapmanızı bekleyen herhangi bir vaka bulunmuyor.</p>
          </div>
        </div>
      )}
    </main>
  );
}
