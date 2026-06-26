const fs = require('fs');
const path = require('path');

const datasetPath = process.argv[2] || path.join('src', 'data', 'hasta_veri.json');
const data = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

function normalizeText(value) {
  return String(value ?? '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function getComplaint(caseItem) {
  return caseItem.complaint
    || caseItem.patient_data?.chief_complaint
    || caseItem.patient_data?.complaint
    || '';
}

function getSymptoms(caseItem) {
  const symptoms = caseItem.symptoms || caseItem.patient_data?.symptoms || [];
  return Array.isArray(symptoms) ? symptoms : [String(symptoms)];
}

function getAge(caseItem) {
  return caseItem.patient_age ?? caseItem.patient_data?.age;
}

function getGender(caseItem) {
  return caseItem.patient_gender ?? caseItem.patient_data?.gender;
}

function getUrgency(caseItem) {
  return caseItem.urgency_level ?? caseItem.patient_data?.urgency_level;
}

function getModality(caseItem) {
  return caseItem.modality
    || caseItem.ai_suggestion?.imaging_choice
    || caseItem.ai_suggestion?.primary_modality
    || caseItem.final_decision?.imaging_choice
    || caseItem.final_decision?.primary_modality;
}

function getSchema(caseItem) {
  if (caseItem.complaint && caseItem.patient_data) return 'mixed';
  if (caseItem.complaint) return 'classic';
  if (caseItem.patient_data) return 'generated';
  return 'unknown';
}

function topEntries(map, limit = 20, predicate = () => true) {
  return [...map.entries()]
    .filter(predicate)
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'tr'))
    .slice(0, limit);
}

const counts = {
  schemas: new Map(),
  ids: new Map(),
  complaints: new Map(),
  signatures: new Map(),
  genders: new Map(),
  urgencies: new Map(),
  modalities: new Map(),
};

const missing = {
  complaint: 0,
  symptoms: 0,
  doctorFields: 0,
  aiSuggestion: 0,
  pdfRequiredBlocks: 0,
};

const ageStats = {
  missing: 0,
  min: Number.POSITIVE_INFINITY,
  max: Number.NEGATIVE_INFINITY,
  under0: 0,
  over100: 0,
};

const examples = {
  duplicateSignatures: [],
  missingComplaint: [],
  missingAiSuggestion: [],
  schemaGenerated: [],
  schemaUnknown: [],
};

const signatureCases = new Map();

for (const caseItem of data) {
  const schema = getSchema(caseItem);
  const complaint = getComplaint(caseItem);
  const symptoms = getSymptoms(caseItem);
  const age = getAge(caseItem);
  const gender = getGender(caseItem);
  const urgency = getUrgency(caseItem);
  const modality = getModality(caseItem);
  const signature = caseItem.clinical_signature
    ? normalizeText(caseItem.clinical_signature)
    : `${normalizeText(complaint)} || ${symptoms.map(normalizeText).sort().join('|')}`;

  increment(counts.schemas, schema);
  increment(counts.ids, caseItem.case_id);
  increment(counts.genders, gender || 'MISSING');
  increment(counts.urgencies, urgency || 'MISSING');
  increment(counts.modalities, modality || 'MISSING');

  if (complaint) increment(counts.complaints, normalizeText(complaint));
  if (signature.trim() !== '||') increment(counts.signatures, signature);

  if (!signatureCases.has(signature)) signatureCases.set(signature, []);
  signatureCases.get(signature).push(caseItem.case_id);

  if (!complaint) {
    missing.complaint += 1;
    if (examples.missingComplaint.length < 8) examples.missingComplaint.push(caseItem.case_id);
  }

  if (!symptoms.length) missing.symptoms += 1;

  if (!caseItem.doctor_a || !caseItem.doctor_b) missing.doctorFields += 1;

  if (!caseItem.ai_suggestion) {
    missing.aiSuggestion += 1;
    if (examples.missingAiSuggestion.length < 8) examples.missingAiSuggestion.push(caseItem.case_id);
  }

  const hasPdfRequiredBlocks = Boolean(
    caseItem.demographics
    && caseItem.clinical_presentation
    && caseItem.contraindications
    && caseItem.vitals
    && caseItem.physical_exam
  );
  if (!hasPdfRequiredBlocks) missing.pdfRequiredBlocks += 1;

  if (typeof age !== 'number') {
    ageStats.missing += 1;
  } else {
    ageStats.min = Math.min(ageStats.min, age);
    ageStats.max = Math.max(ageStats.max, age);
    if (age < 0) ageStats.under0 += 1;
    if (age > 100) ageStats.over100 += 1;
  }

  if (schema === 'generated' && examples.schemaGenerated.length < 5) {
    examples.schemaGenerated.push(caseItem.case_id);
  }

  if (schema === 'unknown' && examples.schemaUnknown.length < 5) {
    examples.schemaUnknown.push(caseItem.case_id);
  }
}

for (const [signature, caseIds] of signatureCases.entries()) {
  if (caseIds.length > 1 && examples.duplicateSignatures.length < 20) {
    examples.duplicateSignatures.push({ signature, count: caseIds.length, caseIds: caseIds.slice(0, 12) });
  }
}

const result = {
  datasetPath,
  caseCount: data.length,
  schemaCounts: Object.fromEntries(counts.schemas),
  duplicateIds: topEntries(counts.ids, 20, ([, count]) => count > 1),
  repeatedComplaints: topEntries(counts.complaints, 20, ([, count]) => count > 1),
  repeatedClinicalSignatures: topEntries(counts.signatures, 30, ([, count]) => count > 1),
  missing,
  ageStats: {
    ...ageStats,
    min: Number.isFinite(ageStats.min) ? ageStats.min : null,
    max: Number.isFinite(ageStats.max) ? ageStats.max : null,
  },
  genders: Object.fromEntries([...counts.genders.entries()].sort()),
  urgencies: Object.fromEntries([...counts.urgencies.entries()].sort()),
  modalities: topEntries(counts.modalities, 40),
  examples,
};

console.log(JSON.stringify(result, null, 2));
