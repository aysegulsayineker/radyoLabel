import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IMAGING_OPTIONS, RATIONALE_GROUPS } from '../constants/clinicalOptions';

const triageOptions = ['Acil (<1 saat)', 'Yarı-acil (<24 saat)', 'Elektif'];

function buildRationaleGroups(aiRationale) {
  const known = new Set(RATIONALE_GROUPS.flatMap((group) => group.options));
  const groups = RATIONALE_GROUPS.map((group) => ({
    label: group.label,
    options: [...group.options],
  }));

  if (aiRationale && !known.has(aiRationale)) {
    groups.unshift({
      label: 'AI önerisi',
      options: [aiRationale],
    });
  }

  return groups;
}
const complaintOptions = [
  'Mevcut sikayet metni korunsun',
  'Akut norolojik defisit',
  'Akut karin agrisi',
  'Travma sonrasi agri',
  'Nefes darligi ve gogus agrisi',
  'Yan agrisi ve hematuri',
  'Pelvik agri',
  'Kas-iskelet sistemi agrisi',
];
const symptomOptions = [
  'afazi',
  'yuz asimetrisi',
  'hemiparezi',
  'ates',
  'defans',
  'travma',
  'norolojik defisit',
  'dispne',
  'hipoksi',
  'hematuri',
  'kusma',
  'pelvik hassasiyet',
  'kontrast riski',
];
const simpleOptions = {
  urgency_level: ['Kritik', 'Yüksek', 'Orta', 'Düşük'],
  pregnancy_status: ['Yok', 'Var - 1. trimester', 'Var - 2. trimester', 'Var - 3. trimester', 'Postpartum', 'Bilinmiyor'],
  renal_function: ['Normal', 'Bozuk', 'Bilinmiyor'],
  contrast_allergy: ['Yok', 'Var', 'Bilinmiyor'],
  metal_implant: ['Yok', 'Metal implant', 'Pacemaker', 'Bilinmiyor'],
  hemodynamic_status: ['Stabil', 'İnstabil'],
};

function doctorKeyFor(rol) {
  return rol === 'B' ? 'doctor_b' : 'doctor_a';
}

function getConditions(vaka) {
  return vaka.special_conditions || vaka.contraindications || {};
}

function getDisplayFields(vaka) {
  const vitals = vaka.vitals || {};
  const conditions = getConditions(vaka);
  const labs = vaka.optional_context?.labs || {};
  const labText = Object.entries(labs).map(([key, value]) => `${key}: ${value}`).join(', ');

  return {
    age_gender: vaka.display_fields?.age_gender || `${vaka.patient_age} / ${vaka.patient_gender}`,
    chief_complaint: vaka.display_fields?.chief_complaint || vaka.complaint || '',
    duration_onset: vaka.display_fields?.duration_onset || vaka.clinical_presentation?.duration_onset || '',
    additional_symptoms: vaka.display_fields?.additional_symptoms || (vaka.symptoms || []).join(', '),
    pregnancy: vaka.display_fields?.pregnancy || conditions.pregnancy_status || 'Yok',
    renal_function: vaka.display_fields?.renal_function || conditions.renal_function || 'Normal',
    contrast_allergy: vaka.display_fields?.contrast_allergy || conditions.contrast_allergy || 'Yok',
    metal_implant: vaka.display_fields?.metal_implant || conditions.metal_implant || 'Yok',
    hemodynamic_status: vaka.display_fields?.hemodynamic_status || conditions.hemodynamic_status || 'Stabil',
    blood_pressure_pulse: vaka.display_fields?.blood_pressure_pulse || `${vitals.blood_pressure || ''} / ${vitals.pulse || ''}`,
    temperature_spo2: vaka.display_fields?.temperature_spo2 || `${vitals.temperature || ''} / ${vitals.spo2 || ''}`,
    gcs: vaka.display_fields?.gcs || vitals.gcs || '',
    physical_exam: vaka.display_fields?.physical_exam || Object.values(vaka.physical_exam || {}).filter(Boolean).join(', '),
    lab: vaka.display_fields?.lab || labText,
    primary_recommendation: vaka.display_fields?.primary_recommendation || vaka.ai_suggestion?.imaging_choice || '',
    contrast: vaka.display_fields?.contrast || vaka.ai_suggestion?.contrast_requirement || vaka.ai_suggestion?.contrast || '',
    urgency: vaka.display_fields?.urgency || vaka.ai_suggestion?.urgency || vaka.ai_suggestion?.triage || '',
    alternative: vaka.display_fields?.alternative || vaka.ai_suggestion?.alternative_modality || '',
    rationale: vaka.display_fields?.rationale || vaka.ai_suggestion?.rationale || '',
  };
}

function patternFor(vaka) {
  const topic = `${vaka.source_topic || ''} ${vaka.complaint || ''}`.toLowerCase();
  if (topic.includes('travma') || topic.includes('kirik')) return 'Travma / kırık şüphesi';
  if (topic.includes('pelvik') || topic.includes('gebelik') || topic.includes('trimester')) return 'Jinekolojik/obstetrik acil';
  if (topic.includes('renal') || topic.includes('skrotal') || topic.includes('hematuri')) return 'Uriner sistem bulgusu';
  if (topic.includes('emboli') || topic.includes('aort') || topic.includes('toraks') || topic.includes('gogus')) return 'Solunum-kardiyak risk';
  if (topic.includes('bas') || topic.includes('inme') || topic.includes('norolojik')) return 'Acil nörolojik bulgu';
  if (topic.includes('karin') || topic.includes('apandisit') || topic.includes('pankreatit')) return 'Akut batın';
  return 'Rutin takip';
}

function buildDatasetInitial(vaka, rol) {
  const conditions = getConditions(vaka);
  const revision = vaka[doctorKeyFor(rol)]?.dataset_revision || {};
  return {
    complaintPreset: 'Mevcut sikayet metni korunsun',
    complaint: revision.complaint || vaka.complaint || '',
    symptoms: revision.symptoms || vaka.symptoms || [],
    urgency_level: revision.urgency_level || vaka.urgency_level || 'Orta',
    pregnancy_status: revision.pregnancy_status || conditions.pregnancy_status || 'Yok',
    renal_function: revision.renal_function || conditions.renal_function || 'Normal',
    contrast_allergy: revision.contrast_allergy || conditions.contrast_allergy || 'Yok',
    metal_implant: revision.metal_implant || conditions.metal_implant || 'Yok',
    hemodynamic_status: revision.hemodynamic_status || conditions.hemodynamic_status || 'Stabil',
  };
}

function buildDecisionInitial(vaka, rol) {
  const doctor = vaka[doctorKeyFor(rol)] || {};
  const display = getDisplayFields(vaka);
  return {
    imaging_choice: doctor.imaging_choice || display.primary_recommendation,
    treatment_decision: doctor.treatment_decision || display.rationale,
    triage: doctor.triage || display.urgency || 'Acil (<1 saat)',
  };
}

function applyComplaintPreset(value, fallback) {
  const presets = {
    'Akut norolojik defisit': 'Ani baslayan guc kaybi, konusma bozuklugu veya yuz asimetrisi',
    'Akut karin agrisi': 'Karin agrisi, bulanti, ates veya defans bulgusu',
    'Travma sonrasi agri': 'Travma sonrasi lokal agri, hassasiyet veya norolojik bulgu',
    'Nefes darligi ve gogus agrisi': 'Ani nefes darligi, gogus agrisi veya hipoksi',
    'Yan agrisi ve hematuri': 'Yan agrisi, hematuri veya kolik tarzda agri',
    'Pelvik agri': 'Pelvik agri, vajinal kanama veya tek tarafli hassasiyet',
    'Kas-iskelet sistemi agrisi': 'Kas-iskelet sistemi agrisi ve hareket kisitliligi',
  };
  return presets[value] || fallback;
}

function EditableCell({ value, editing, children }) {
  return <span>{editing ? children : value}</span>;
}

export default function Workstation({
  vaka,
  rol,
  canEdit,
  doctorAction,
  doctorActionLabel,
  onNext,
  onPrev,
  onDoctorSubmit,
  onDoctorUnlock,
  listIndex,
  listTotal,
}) {
  const doctor = vaka[doctorKeyFor(rol)] || {};
  const display = useMemo(() => getDisplayFields(vaka), [vaka]);
  const rationaleGroups = useMemo(
    () => buildRationaleGroups(display.rationale),
    [display.rationale]
  );
  const [editing, setEditing] = useState(false);
  const [flash, setFlash] = useState(null);
  const [datasetDraft, setDatasetDraft] = useState(() => buildDatasetInitial(vaka, rol));
  const [decision, setDecision] = useState(() => buildDecisionInitial(vaka, rol));
  const isSubmitted = Boolean(doctor.submitted_at);

  function setDatasetField(field, value) {
    setDatasetDraft((current) => ({ ...current, [field]: value }));
  }

  function setDecisionField(field, value) {
    setDecision((current) => ({ ...current, [field]: value }));
  }

  function toggleSymptom(symptom) {
    setDatasetDraft((current) => {
      const hasSymptom = current.symptoms.includes(symptom);
      return {
        ...current,
        symptoms: hasSymptom
          ? current.symptoms.filter((item) => item !== symptom)
          : [...current.symptoms, symptom],
      };
    });
  }

  const submit = useCallback((action) => {
    const included = action !== 'reddedildi';
    const datasetEdited = action === 'duzenlendi';
    setFlash(action);
    window.setTimeout(() => setFlash(null), 300);
    onDoctorSubmit(vaka.case_id, {
      imaging_choice: decision.imaging_choice,
      clinical_pattern: patternFor(vaka),
      confidence: vaka.ai_suggestion?.confidence || 'Orta',
      ai_action: action,
      treatment_decision: decision.treatment_decision,
      triage: decision.triage,
      dataset_revision: {
        complaint: datasetDraft.complaint,
        symptoms: datasetDraft.symptoms,
        urgency_level: datasetDraft.urgency_level,
        pregnancy_status: datasetDraft.pregnancy_status,
        renal_function: datasetDraft.renal_function,
        contrast_allergy: datasetDraft.contrast_allergy,
        metal_implant: datasetDraft.metal_implant,
        hemodynamic_status: datasetDraft.hemodynamic_status,
      },
      dataset_edited: datasetEdited && included,
    });
  }, [datasetDraft, decision, onDoctorSubmit, vaka]);

  useEffect(() => {
    function handleKeyDown(event) {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onPrev();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onNext();
        return;
      }
      if (isSubmitted || !canEdit) return;

      const key = event.key.toLowerCase();
        if (key === 'o' || event.key === 'Enter') {
           event.preventDefault();
           if (editing) submit('duzenlendi');
           else submit('onaylandi');
           return;
        }
        if (key === 'r') {
           event.preventDefault();
           if (!editing) submit('reddedildi');
           return;
        }
      if (key === 'd') {
        event.preventDefault();
        if (!editing) setEditing(true);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canEdit, editing, isSubmitted, onNext, onPrev, submit]);

  const patientRows = [
    ['Yaş / Cinsiyet', display.age_gender, null],
    ['Ana Şikâyet', datasetDraft.complaint, (
      <select
        value={datasetDraft.complaintPreset}
        onChange={(event) => {
          const preset = event.target.value;
          setDatasetDraft((current) => ({
            ...current,
            complaintPreset: preset,
            complaint: applyComplaintPreset(preset, vaka.complaint),
          }));
        }}
      >
        {complaintOptions.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    )],
    ['Süre / Başlangıç', display.duration_onset, null],
    ['Ek Semptomlar', datasetDraft.symptoms.join(', '), (
      <div className="inline-tags">
        {symptomOptions.map((symptom) => (
          <button
            key={symptom}
            className={datasetDraft.symptoms.includes(symptom) ? 'active' : ''}
            onClick={() => toggleSymptom(symptom)}
            type="button"
          >
            {symptom}
          </button>
        ))}
      </div>
    )],
    ['Gebelik', datasetDraft.pregnancy_status, (
      <select value={datasetDraft.pregnancy_status} onChange={(event) => setDatasetField('pregnancy_status', event.target.value)}>
        {simpleOptions.pregnancy_status.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    )],
    ['Böbrek Fonksiyonu', datasetDraft.renal_function, (
      <select value={datasetDraft.renal_function} onChange={(event) => setDatasetField('renal_function', event.target.value)}>
        {simpleOptions.renal_function.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    )],
    ['Kontrast Alerjisi', datasetDraft.contrast_allergy, (
      <select value={datasetDraft.contrast_allergy} onChange={(event) => setDatasetField('contrast_allergy', event.target.value)}>
        {simpleOptions.contrast_allergy.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    )],
    ['Metal Implant', datasetDraft.metal_implant, (
      <select value={datasetDraft.metal_implant} onChange={(event) => setDatasetField('metal_implant', event.target.value)}>
        {simpleOptions.metal_implant.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    )],
    ['Hemodinamik Durum', datasetDraft.hemodynamic_status, (
      <select value={datasetDraft.hemodynamic_status} onChange={(event) => setDatasetField('hemodynamic_status', event.target.value)}>
        {simpleOptions.hemodynamic_status.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    )],
    ['Aciliyet Düzeyi', datasetDraft.urgency_level, (
      <select value={datasetDraft.urgency_level} onChange={(event) => setDatasetField('urgency_level', event.target.value)}>
        {simpleOptions.urgency_level.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    )],
    ['Tansiyon / Nabız', display.blood_pressure_pulse, null],
    ['Ateş / SpO2', display.temperature_spo2, null],
    ['GKS', display.gcs, null],
    ['Fizik Muayene', display.physical_exam, null],
    ['Lab', display.lab, null],
  ];

  const aiRows = [
    ['BİRİNCİL ÖNERİ', display.primary_recommendation],
    ['Kontrastli/Kontrastsiz', display.contrast],
    ['Aciliyet', display.urgency],
    ['Alternatif', display.alternative],
    ['Gerekçe', display.rationale],
  ];

  return (
    <section className={`workstation ${flash ? `flash-${flash}` : ''}`}>
      <div className="patient-panel">
        <div className="patient-title compact-title">
          <div>
            <p className="eyebrow">Vaka bilgileri</p>
            <h2>{vaka.case_id}</h2>
          </div>
          <span className={`status-pill status-${doctorAction}`}>{doctorActionLabel(doctorAction)}</span>
        </div>

        <div className={`clinical-table ${editing ? 'editing' : ''}`}>
          {patientRows.filter(([, value]) => value).map(([label, value, editor]) => (
            <React.Fragment key={label}>
              <strong>{label}</strong>
              <EditableCell value={value} editing={editing && Boolean(editor)}>{editor}</EditableCell>
            </React.Fragment>
          ))}
        </div>

        <div className="recommendation-table">
          <div className="clinical-table">
            {aiRows.map(([label, value]) => (
              <React.Fragment key={label}>
                <strong>{label}</strong>
                <span>{value}</span>
              </React.Fragment>
            ))}
          </div>
        </div>

        {vaka.history && vaka.history.length > 0 && (
          <div className="flow-history-section">
            <h3 className="history-title">Akış Tarihçesi</h3>
            <div className="timeline">
              {vaka.history.map((entry, idx) => {
                const formattedTime = new Date(entry.submitted_at).toLocaleTimeString('tr-TR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                });
                const formattedDate = new Date(entry.submitted_at).toLocaleDateString('tr-TR');
                
                let actionText = '';
                let badgeClass = '';
                if (entry.action === 'review_approved' || entry.ai_action === 'onaylandi') {
                  actionText = 'AI Önerisini Onayladı';
                  badgeClass = 'approved';
                } else if (entry.action === 'review_edited' || entry.ai_action === 'duzenlendi') {
                  actionText = 'Kararı Düzenledi';
                  badgeClass = 'edited';
                } else if (entry.action === 'review_rejected' || entry.ai_action === 'reddedildi') {
                  actionText = 'AI Önerisini Reddetti';
                  badgeClass = 'rejected';
                } else {
                  actionText = entry.action || '';
                  badgeClass = 'other';
                }

                return (
                  <div key={idx} className="timeline-item">
                    <div className="timeline-dot" />
                    <div className="timeline-content">
                      <div className="timeline-header">
                        <strong>{entry.by}</strong>
                        <span className="timeline-time">{formattedDate} {formattedTime}</span>
                      </div>
                      <div className="timeline-body">
                        <span className={`action-badge ${badgeClass}`}>{actionText}</span>
                        {entry.imaging_choice && (
                          <span className="choice-text">Seçim: {entry.imaging_choice}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="decision-panel compact-decision">
        <div className="decision-head">
          <div>
            <p className="eyebrow">Karar</p>
            <h2>{display.primary_recommendation}</h2>
          </div>
          <strong>{listTotal === 0 ? 0 : listIndex + 1} / {listTotal}</strong>
        </div>

        {editing && (
          <div className="quick-edit">
            <label>
              Görüntüleme
              <select value={decision.imaging_choice} onChange={(event) => setDecisionField('imaging_choice', event.target.value)}>
                {IMAGING_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label>
              Aciliyet
              <select value={decision.triage} onChange={(event) => setDecisionField('triage', event.target.value)}>
                {triageOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label>
              Gerekçe
              <select value={decision.treatment_decision} onChange={(event) => setDecisionField('treatment_decision', event.target.value)}>
                {rationaleGroups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((option) => (
                      <option key={`${group.label}-${option}`} value={option}>{option}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>
        )}

        {isSubmitted ? (
          <div className="submitted-bar">
            <span className={`submitted-badge submitted-${doctorAction}`}>
              {doctorActionLabel(doctorAction)}
            </span>
            <button
              className="change-button"
              type="button"
              onClick={() => {
                setEditing(false);
                onDoctorUnlock(vaka.case_id);
              }}
            >
              Kararı değiştir
            </button>
          </div>
        ) : (
          <div className="action-dock">
            {!editing && (
              <>
                <button className="approve-button" type="button" onClick={() => submit('onaylandi')} disabled={!canEdit}>Onayla</button>
                <button className="reject-button" type="button" onClick={() => submit('reddedildi')} disabled={!canEdit}>Reddet</button>
                <button className="edit-button" type="button" onClick={() => setEditing(true)} disabled={!canEdit}>Düzenle</button>
              </>
            )}
            {editing && (
              <>
                <button className="approve-button" type="button" onClick={() => submit('duzenlendi')} disabled={!canEdit}>Düzenlenmiş kaydet</button>
                <button className="edit-button" type="button" onClick={() => {
                  setEditing(false);
                  setDatasetDraft(() => buildDatasetInitial(vaka, rol));
                  setDecision(() => buildDecisionInitial(vaka, rol));
                }} disabled={!canEdit}>Vazgeç</button>
              </>
            )}
          </div>
        )}

        {!isSubmitted && (
          <p className="shortcut-hint">O Onayla · R Reddet · D Düzenle · ← → Gezin · Enter Onayla</p>
        )}

        <div className="bottom-nav">
          <button type="button" onClick={onPrev} disabled={listIndex === 0 || listTotal === 0}>Önceki</button>
          <button type="button" onClick={onNext} disabled={listIndex >= listTotal - 1 || listTotal === 0}>Sonraki</button>
        </div>
      </div>
    </section>
  );
}
