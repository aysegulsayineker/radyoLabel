function reviewerStorageKey(rol) {
  return rol === 'B' ? 'doctor_b' : 'doctor_a';
}

function mapContrast(aiSuggestion) {
  return aiSuggestion?.contrast_requirement || aiSuggestion?.contrast || null;
}

export function buildFineTuningExport(cases, rol) {
  const reviewerKey = reviewerStorageKey(rol);
  const exportedAt = new Date().toISOString();

  const records = cases
    .filter((vaka) => Boolean(vaka[reviewerKey]?.submitted_at))
    .map((vaka) => {
      const decision = vaka[reviewerKey];
      const conditions = vaka.special_conditions || vaka.contraindications || {};
      const revision = decision.dataset_revision || {};

      return {
        case_id: vaka.case_id,
        input: {
          demographics: {
            age: vaka.patient_age,
            gender: vaka.patient_gender,
          },
          chief_complaint: revision.complaint || vaka.complaint,
          symptoms: revision.symptoms || vaka.symptoms || [],
          urgency_level: revision.urgency_level || vaka.urgency_level,
          special_conditions: {
            pregnancy_status: revision.pregnancy_status || conditions.pregnancy_status,
            renal_function: revision.renal_function || conditions.renal_function,
            contrast_allergy: revision.contrast_allergy || conditions.contrast_allergy,
            metal_implant: revision.metal_implant || conditions.metal_implant,
            hemodynamic_status: revision.hemodynamic_status || conditions.hemodynamic_status,
          },
          vitals: vaka.vitals || {},
          physical_exam: vaka.physical_exam || {},
          optional_context: vaka.optional_context || {},
        },
        ai_suggestion: {
          imaging_choice: vaka.ai_suggestion?.imaging_choice,
          contrast: mapContrast(vaka.ai_suggestion),
          triage: vaka.ai_suggestion?.triage || vaka.ai_suggestion?.urgency,
          alternative_modality: vaka.ai_suggestion?.alternative_modality,
          rationale: vaka.ai_suggestion?.rationale,
          confidence: vaka.ai_suggestion?.confidence,
        },
        label: {
          imaging_choice: decision.imaging_choice,
          contrast: mapContrast(vaka.ai_suggestion),
          triage: decision.triage,
          alternative_modality: vaka.ai_suggestion?.alternative_modality || null,
          rationale: decision.treatment_decision,
          clinical_pattern: decision.clinical_pattern,
          review_action: decision.ai_action,
          reviewed_at: decision.submitted_at,
        },
      };
    });

  return {
    schema: 'acil-goruntuleme-v1',
    exported_at: exportedAt,
    record_count: records.length,
    records,
  };
}

export function downloadFineTuningJson(cases, rol) {
  const payload = buildFineTuningExport(cases, rol);
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `goruntuleme-kararlari-${stamp}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
