/**
 * Radyoloji AI Öneri Motoru v2
 * 
 * Çoklu faktör analizi: semptomlar, vital bulgular, kontrendikasyonlar,
 * demografik veriler ve fizik muayene bulguları birlikte değerlendirilir.
 * 
 * Skor tabanlı sistem — en yüksek puanlı klinik senaryo seçilir.
 * Kontrendikasyon filtresi son aşamada uygulanır (güvenlik katmanı).
 */

// ─── Klinik Senaryolar ───────────────────────────────────────────────────────

const CLINICAL_SCENARIOS = [
  // ═══════════════════════════════════════════════════════════════════════════
  // 2.1 NÖROLOJİK ACİLLER (ACR Bölüm 2.1)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'stroke',
    label: 'Akut inme / nörolojik acil',
    keywords: ['hemiparezi', 'afazi', 'konusma', 'konuşma', 'yüz asimetrisi', 'yuz asimetrisi', 'hemipleji', 'dizartri', 'bilinc', 'bilinç'],
    symptomMatches: ['afazi', 'hemiparezi', 'yüz asimetrisi', 'yuz asimetrisi', 'dizartri', 'bilinç kaybı'],
    vitalSignals: { gcs_below: 14, spo2_below: null },
    urgencyBoost: ['Kritik', 'Yüksek'],
    imaging_choice: 'BT Beyin kontrastsız',
    contrast_requirement: 'Kontrastsız',
    treatment_decision: 'Acil nöroloji değerlendirmesi ve inme protokolü aktivasyonu',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'MR Beyin (DWI dahil)',
    rationale: 'Akut nörolojik defisit varlığında kanama/iskemi ayrımı için kontrastsız BT altın standarttır. GKS ve vital bulgular ile birlikte değerlendirilmiştir.',
    baseScore: 40,
  },
  {
    id: 'subarachnoid',
    label: 'Subaraknoid kanama şüphesi',
    keywords: ['şiddetli baş ağrısı', 'siddetli bas agrisi', 'ani başlayan', 'thunderclap', 'ense sertliği', 'ense sertligi', 'bulantı kusma baş ağrısı'],
    symptomMatches: ['şiddetli baş ağrısı', 'ense sertliği', 'kusma', 'fotofobi'],
    vitalSignals: { pulse_above: 100 },
    urgencyBoost: ['Kritik', 'Yüksek'],
    imaging_choice: 'BT Beyin kontrastsız',
    contrast_requirement: 'Kontrastsız',
    treatment_decision: 'Acil BT negatifse LP planlanmalı, nöroşirürji konsültasyonu',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'BTA Beyin',
    rationale: 'Ani başlayan şiddetli baş ağrısında SAK dışlanmalıdır. BT sensitivitesi ilk 6 saatte >%95.',
    baseScore: 38,
  },
  {
    id: 'pulmonary_embolism',
    label: 'Pulmoner emboli şüphesi',
    keywords: ['dispne', 'nefes darlığı', 'nefes darligi', 'göğüs ağrısı', 'gogus agrisi', 'plöretik', 'bacak şişliği', 'bacak sislik', 'dvt', 'hemoptizi'],
    symptomMatches: ['dispne', 'hipoksi', 'göğüs ağrısı', 'bacak ödemi', 'hemoptizi', 'taşikardi'],
    vitalSignals: { spo2_below: 94, pulse_above: 100 },
    urgencyBoost: ['Kritik', 'Yüksek'],
    imaging_choice: 'BTA Toraks',
    contrast_requirement: 'IV kontrastlı',
    treatment_decision: 'Acil antikoagülasyon değerlendirmesi, hemodinami izlemi',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'V/Q Sintigrafisi',
    rationale: 'Dispne, hipoksi ve/veya taşikardi birlikteliğinde pulmoner emboli yüksek olasılıklıdır. BTA altın standarttır.',
    baseScore: 38,
  },
  {
    id: 'aortic_dissection',
    label: 'Aort diseksiyonu şüphesi',
    keywords: ['yırtılma tarzı', 'sırt ağrısı', 'sirt agrisi', 'göğüs ağrısı', 'gogus agrisi', 'tansiyon farkı', 'nabız farkı'],
    symptomMatches: ['göğüs ağrısı', 'sırt ağrısı', 'senkop', 'hipertansiyon'],
    vitalSignals: { bp_systolic_above: 180, pulse_above: 110 },
    urgencyBoost: ['Kritik'],
    imaging_choice: 'BTA Toraks-Abdomen',
    contrast_requirement: 'IV kontrastlı',
    treatment_decision: 'Acil kardiyovasküler cerrahi konsültasyonu, tansiyon kontrolü',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'EKO (TTE)',
    rationale: 'Ani başlayan göğüs/sırt ağrısı ile hemodinamik bulgular aort diseksiyonu için değerlendirilmelidir.',
    baseScore: 36,
  },
  {
    id: 'trauma_major',
    label: 'Majör travma',
    keywords: ['travma', 'kaza', 'trafik', 'düşme', 'dusme', 'yüksekten', 'çoklu travma', 'politravma'],
    symptomMatches: ['travma', 'nörolojik defisit', 'bilinç kaybı', 'hematom'],
    vitalSignals: { gcs_below: 14, pulse_above: 100, bp_systolic_below: 90 },
    urgencyBoost: ['Kritik', 'Yüksek'],
    imaging_choice: 'BT Travma protokolü',
    contrast_requirement: 'Klinik senaryoya göre kontrastlı',
    treatment_decision: 'Travma protokolü aktivasyonu, cerrahi konsültasyon',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'FAST US',
    rationale: 'Travma mekanizması ve klinik bulgular birlikte değerlendirildiğinde tam vücut BT endikasyonu mevcuttur.',
    baseScore: 35,
  },
  {
    id: 'trauma_spinal',
    label: 'Spinal travma / kord basısı',
    keywords: ['sırt ağrısı travma', 'bel agrisi travma', 'uyuşukluk', 'kuvvet kaybı', 'idrar', 'mesane', 'parestezi'],
    symptomMatches: ['nörolojik defisit', 'parestezi', 'güç kaybı', 'idrar retansiyonu'],
    vitalSignals: { gcs_below: 15 },
    urgencyBoost: ['Kritik', 'Yüksek'],
    imaging_choice: 'MR Omurga',
    contrast_requirement: 'Kontrastsız',
    treatment_decision: 'Acil nöroşirürji konsültasyonu, immobilizasyon',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'BT Servikal/Lomber Omurga',
    rationale: 'Travma sonrası nörolojik defisit varlığında spinal kord basısı acil dışlanmalıdır.',
    baseScore: 34,
  },
  {
    id: 'appendicitis',
    label: 'Akut apandisit',
    keywords: ['apandisit', 'sağ alt kadran', 'sag alt kadran', 'mcburney', 'defans', 'rebound'],
    symptomMatches: ['defans', 'ateş', 'kusma', 'iştahsızlık'],
    vitalSignals: { temp_above: 37.5 },
    urgencyBoost: ['Yüksek', 'Kritik'],
    imaging_choice: 'US Abdomen',
    contrast_requirement: 'Uygulanamaz (US)',
    treatment_decision: 'Genel cerrahi konsültasyonu, akut batın izlemi',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'BT Abdomen-Pelvis kontrastlı',
    rationale: 'Sağ alt kadran ağrısı ve peritoneal irritasyon bulguları apandisit için yüksek şüphe oluşturmaktadır.',
    baseScore: 32,
  },
  {
    id: 'acute_abdomen',
    label: 'Akut batın',
    keywords: ['karın ağrısı', 'karin agrisi', 'akut batın', 'akut batin', 'defans', 'peritonit', 'pankreatit', 'ileus', 'obstrüksiyon'],
    symptomMatches: ['defans', 'ateş', 'kusma', 'distansiyon', 'rebound'],
    vitalSignals: { pulse_above: 100, temp_above: 38 },
    urgencyBoost: ['Kritik', 'Yüksek'],
    imaging_choice: 'BT Abdomen-Pelvis kontrastlı',
    contrast_requirement: 'IV kontrastlı',
    treatment_decision: 'Acil cerrahi değerlendirme, geniş spektrumlu antibiyotik',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'US Abdomen',
    rationale: 'Akut batın bulguları ve sistemik inflamasyon yanıtı varlığında ileri görüntüleme ile odak araştırılmalıdır.',
    baseScore: 33,
  },
  {
    id: 'renal_colic',
    label: 'Renal kolik / üriner taş',
    keywords: ['hematüri', 'hematuri', 'flank', 'yan ağrı', 'yan agri', 'kolik', 'renal', 'böbrek taşı', 'bobrek tasi'],
    symptomMatches: ['hematüri', 'hematuri', 'kusma', 'yan ağrısı'],
    vitalSignals: {},
    urgencyBoost: ['Yüksek', 'Orta'],
    imaging_choice: 'BT Abdomen-Pelvis kontrastsız',
    contrast_requirement: 'Kontrastsız',
    treatment_decision: 'Üroloji değerlendirmesi, analjezi ve hidrasyon',
    triage: 'Yarı-acil (<24 saat)',
    alternative_modality: 'US Abdomen',
    rationale: 'Tipik kolik ağrı ve hematüri varlığında kontrastsız BT üriner taş için %97 sensitiviteye sahiptir.',
    baseScore: 28,
  },
  {
    id: 'testicular_torsion',
    label: 'Testiküler torsiyon',
    keywords: ['skrotal', 'testis', 'torsiyon', 'ani başlayan skrotal'],
    symptomMatches: ['skrotal ağrı', 'kusma', 'şişlik'],
    vitalSignals: {},
    urgencyBoost: ['Kritik', 'Yüksek'],
    imaging_choice: 'US Doppler Skrotal',
    contrast_requirement: 'Uygulanamaz (US)',
    treatment_decision: 'Acil üroloji konsültasyonu (6 saat altın zaman)',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'Klinik değerlendirme yeterli olabilir',
    rationale: 'Akut skrotal ağrıda testiküler torsiyon 6 saat içinde dışlanmalıdır — Doppler US ilk tercih.',
    baseScore: 35,
  },
  {
    id: 'ectopic_pregnancy',
    label: 'Ektopik gebelik şüphesi',
    keywords: ['pelvik', 'vajinal kanama', 'gebelik', 'ektopik', 'amenore', 'tek taraflı ağrı'],
    symptomMatches: ['pelvik ağrı', 'pelvik hassasiyet', 'vajinal kanama', 'amenore'],
    vitalSignals: { pulse_above: 100, bp_systolic_below: 100 },
    urgencyBoost: ['Kritik', 'Yüksek'],
    imaging_choice: 'US Pelvik (TV)',
    contrast_requirement: 'Uygulanamaz (US)',
    treatment_decision: 'Acil jinekoloji konsültasyonu, beta-hCG takibi',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'US Abdomen',
    rationale: 'Üreme çağındaki kadında pelvik ağrı ve kanama varlığında ektopik gebelik acil dışlanmalıdır.',
    baseScore: 36,
  },
  {
    id: 'dvt',
    label: 'Derin ven trombozu',
    keywords: ['bacak şişliği', 'bacak sislik', 'tek taraflı ödem', 'baldır ağrısı', 'dvt'],
    symptomMatches: ['bacak ödemi', 'ağrı', 'şişlik', 'eritem'],
    vitalSignals: {},
    urgencyBoost: ['Yüksek', 'Orta'],
    imaging_choice: 'US Doppler Alt Ekstremite',
    contrast_requirement: 'Uygulanamaz (US)',
    treatment_decision: 'Antikoagülasyon değerlendirmesi, Wells skoru hesaplanması',
    triage: 'Yarı-acil (<24 saat)',
    alternative_modality: 'BTA Toraks (PE şüphesi eklenirse)',
    rationale: 'Tek taraflı alt ekstremite ödemi ve ağrısında DVT kompresyon US ile değerlendirilmelidir.',
    baseScore: 26,
  },
  {
    id: 'fracture_extremity',
    label: 'Ekstremite kırığı',
    keywords: ['kırık', 'kirik', 'deformite', 'travma', 'düşme', 'dusme', 'şişlik', 'hareket kısıtlılığı'],
    symptomMatches: ['travma', 'ağrı', 'şişlik', 'deformite'],
    vitalSignals: {},
    urgencyBoost: ['Orta', 'Yüksek'],
    imaging_choice: 'X-Ray Ekstremite',
    contrast_requirement: 'Uygulanamaz (X-Ray)',
    treatment_decision: 'Ortopedi değerlendirmesi, immobilizasyon',
    triage: 'Yarı-acil (<24 saat)',
    alternative_modality: 'BT (kompleks kırık şüphesinde)',
    rationale: 'Travma sonrası lokal ağrı ve deformitede direkt grafi ilk basamak görüntülemedir.',
    baseScore: 22,
  },
  {
    id: 'cardiac_failure',
    label: 'Kalp yetmezliği / kardiyak acil',
    keywords: ['ortopne', 'paroksismal', 'ödem', 'dispne', 'kalp', 'çarpıntı', 'carp'],
    symptomMatches: ['dispne', 'ödem', 'ortopne', 'çabuk yorulma'],
    vitalSignals: { spo2_below: 92, pulse_above: 110 },
    urgencyBoost: ['Kritik', 'Yüksek'],
    imaging_choice: 'X-Ray Toraks',
    contrast_requirement: 'Uygulanamaz (X-Ray)',
    treatment_decision: 'Kardiyoloji değerlendirmesi, diüretik tedavi, oksijen desteği',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'EKO (TTE)',
    rationale: 'Dispne, ödem ve hipoksi birlikteliğinde pulmoner konjesyon değerlendirmesi için PA akciğer grafisi hızlı bilgi sağlar.',
    baseScore: 30,
  },
  {
    id: 'pneumonia_sepsis',
    label: 'Pnömoni / Sepsis',
    keywords: ['ateş', 'öksürük', 'balgam', 'sepsis', 'pnömoni', 'plevral'],
    symptomMatches: ['ateş', 'öksürük', 'dispne', 'hipoksi'],
    vitalSignals: { temp_above: 38.5, pulse_above: 100, spo2_below: 94 },
    urgencyBoost: ['Yüksek', 'Kritik'],
    imaging_choice: 'X-Ray Toraks',
    contrast_requirement: 'Uygulanamaz (X-Ray)',
    treatment_decision: 'Ampirik antibiyotik, kan kültürü, sıvı resüsitasyonu',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'BT Toraks (komplikasyon şüphesinde)',
    rationale: 'Ateş, öksürük ve solunum sıkıntısı varlığında pnömoni/plevral efüzyon değerlendirmesi gerekir.',
    baseScore: 28,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2.1 NÖROLOJİK ACİLLER — EK SENARYOLAR
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'seizure',
    label: 'Nöbet / Status epileptikus',
    keywords: ['nöbet', 'nobet', 'epilepsi', 'konvülziyon', 'konvulziyon', 'status', 'kasılma', 'kasilma'],
    symptomMatches: ['nöbet', 'bilinç kaybı', 'kasılma', 'dil ısırma'],
    vitalSignals: { gcs_below: 14 },
    urgencyBoost: ['Kritik', 'Yüksek'],
    imaging_choice: 'BT Beyin kontrastsız',
    contrast_requirement: 'Kontrastsız',
    treatment_decision: 'Antiepileptik tedavi, nöroloji konsültasyonu, ilk nöbette etiyoloji araştırması',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'MR Beyin (DWI dahil)',
    rationale: 'İlk nöbet veya status epileptikus değerlendirmesinde intrakranial patoloji (kanama, kitle, enfeksiyon) dışlanmalıdır.',
    baseScore: 30,
  },
  {
    id: 'head_trauma',
    label: 'Kafa travması',
    keywords: ['kafa travması', 'kafa travmasi', 'baş yaralanma', 'bas yaralanma', 'düşme kafa', 'dusme kafa', 'bilinç kaybı travma'],
    symptomMatches: ['bilinç kaybı', 'kusma', 'baş ağrısı', 'amnezi', 'hematom'],
    vitalSignals: { gcs_below: 15 },
    urgencyBoost: ['Kritik', 'Yüksek'],
    imaging_choice: 'BT Beyin kontrastsız',
    contrast_requirement: 'Kontrastsız',
    treatment_decision: 'GKS takibi, nöroşirürji konsültasyonu (GKS<14 veya patoloji saptanırsa)',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'MR Beyin (subakut dönemde)',
    rationale: 'Kafa travmasında GKS düşüklüğü veya bilinç kaybı varlığında intrakranial kanama acil dışlanmalıdır.',
    baseScore: 34,
  },
  {
    id: 'syncope',
    label: 'Senkop değerlendirmesi',
    keywords: ['senkop', 'bayılma', 'bayilma', 'bilinç kaybı', 'bilincini kaybetti', 'presenkop'],
    symptomMatches: ['senkop', 'bilinç kaybı', 'çarpıntı', 'göğüs ağrısı'],
    vitalSignals: { bp_systolic_below: 90, pulse_above: 100 },
    urgencyBoost: ['Yüksek'],
    imaging_choice: 'EKO (TTE)',
    contrast_requirement: 'Uygulanamaz',
    treatment_decision: 'Kardiyak ve nörolojik etiyoloji araştırması, telemetri izlemi',
    triage: 'Yarı-acil (<24 saat)',
    alternative_modality: 'BT Beyin kontrastsız',
    rationale: 'Senkop değerlendirmesinde kardiyak nedenler (aort stenozu, kardiyomiyopati) öncelikle dışlanmalıdır.',
    baseScore: 22,
  },
  {
    id: 'vertigo',
    label: 'Baş dönmesi / Vertigo',
    keywords: ['vertigo', 'baş dönmesi', 'bas donmesi', 'denge kaybı', 'denge kaybi', 'ataksi', 'nistagmus'],
    symptomMatches: ['baş dönmesi', 'kusma', 'ataksi', 'nistagmus', 'işitme kaybı'],
    vitalSignals: {},
    urgencyBoost: ['Yüksek'],
    imaging_choice: 'MR Beyin (DWI dahil)',
    contrast_requirement: 'Kontrastsız',
    treatment_decision: 'Santral vs periferik ayrımı, nöroloji konsültasyonu (santral bulgularda)',
    triage: 'Yarı-acil (<24 saat)',
    alternative_modality: 'BT Beyin kontrastsız',
    rationale: 'Akut vertigo ile birlikte ataksi, dizartri veya fokal bulgu varlığında posterior fossa patolojisi (serebellar infarkt) dışlanmalıdır.',
    baseScore: 22,
  },
  {
    id: 'altered_consciousness',
    label: 'Bilinç değişikliği / Koma / Deliryum',
    keywords: ['bilinç', 'bilinc', 'koma', 'deliryum', 'konfüzyon', 'konfuzyon', 'oryantasyon', 'letarji'],
    symptomMatches: ['bilinç kaybı', 'konfüzyon', 'ajitasyon', 'ateş'],
    vitalSignals: { gcs_below: 13 },
    urgencyBoost: ['Kritik', 'Yüksek'],
    imaging_choice: 'BT Beyin kontrastsız',
    contrast_requirement: 'Kontrastsız',
    treatment_decision: 'ABC stabilizasyonu, metabolik panel, toksikoloji tarama, nöroloji konsültasyonu',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'MR Beyin (DWI dahil)',
    rationale: 'Akut bilinç değişikliğinde intrakranial patoloji (kanama, herniasyon, ensefalit) öncelikle dışlanmalıdır.',
    baseScore: 33,
  },
  {
    id: 'facial_trauma',
    label: 'Yüz travması / Maksillofasiyal kırık',
    keywords: ['yüz travma', 'yuz travma', 'burun kırığı', 'burun kirigi', 'orbita', 'mandibula', 'zigoma', 'maksilla', 'le fort'],
    symptomMatches: ['şişlik', 'kanama', 'deformite', 'çift görme', 'maloklüzyon'],
    vitalSignals: {},
    urgencyBoost: ['Yüksek', 'Orta'],
    imaging_choice: 'BT Beyin kontrastsız',
    contrast_requirement: 'Kontrastsız',
    treatment_decision: 'Plastik cerrahi / KBB konsültasyonu, hava yolu değerlendirmesi',
    triage: 'Yarı-acil (<24 saat)',
    alternative_modality: 'X-Ray (Waters grafisi)',
    rationale: 'Maksillofasiyal travmada kemik yapıların ve orbita bütünlüğünün değerlendirmesi için ince kesit BT altın standarttır.',
    baseScore: 24,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2.2 KARDİYOTORASİK ACİLLER — EK SENARYOLAR
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'acs',
    label: 'Akut koroner sendrom şüphesi',
    keywords: ['göğüs ağrısı', 'gogus agrisi', 'retrosternal', 'kola yayılan', 'sıkıştırma', 'baskı hissi', 'efor', 'troponin'],
    symptomMatches: ['göğüs ağrısı', 'terleme', 'çarpıntı', 'dispne', 'bulantı'],
    vitalSignals: { pulse_above: 100, bp_systolic_above: 160 },
    urgencyBoost: ['Kritik', 'Yüksek'],
    imaging_choice: 'EKO (TTE)',
    contrast_requirement: 'Uygulanamaz',
    treatment_decision: 'Troponin seri takibi, kardiyoloji konsültasyonu, koroner girişim değerlendirmesi',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'BTA Toraks (üçlü dışlama protokolü)',
    rationale: 'Tipik göğüs ağrısı ile birlikte kardiyak risk faktörleri varlığında AKS değerlendirmesi önceliklidir.',
    baseScore: 30,
  },
  {
    id: 'pneumothorax',
    label: 'Pnömotoraks / Hemotoraks',
    keywords: ['pnömotoraks', 'pnomotoraks', 'hemotoraks', 'göğüs travma', 'gogus travma', 'nefes darlığı travma'],
    symptomMatches: ['dispne', 'göğüs ağrısı', 'travma', 'azalmış solunum sesi'],
    vitalSignals: { spo2_below: 92, pulse_above: 110 },
    urgencyBoost: ['Kritik', 'Yüksek'],
    imaging_choice: 'X-Ray Toraks',
    contrast_requirement: 'Uygulanamaz (X-Ray)',
    treatment_decision: 'Tansiyon pnömotoraks ise acil dekompresyon, göğüs tüpü takılması',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'BT Toraks',
    rationale: 'Travma sonrası veya spontan dispnede pnömotoraks/hemotoraks acil dışlanmalıdır. PA grafi ilk adımdır.',
    baseScore: 32,
  },
  {
    id: 'chest_trauma_cardiac',
    label: 'Künt göğüs travması — Kardiyak yaralanma',
    keywords: ['künt göğüs', 'kunt gogus', 'direksiyon', 'kontüzyon', 'miyokard', 'tamponad', 'sternum'],
    symptomMatches: ['göğüs ağrısı', 'travma', 'çarpıntı', 'hipotansiyon'],
    vitalSignals: { bp_systolic_below: 90, pulse_above: 120 },
    urgencyBoost: ['Kritik'],
    imaging_choice: 'EKO (TTE)',
    contrast_requirement: 'Uygulanamaz',
    treatment_decision: 'Kardiyak tamponad değerlendirmesi, telemetri izlemi, cerrahi konsültasyon',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'BT Toraks',
    rationale: 'Künt göğüs travmasında miyokard kontüzyonu ve kardiyak tamponad acil dışlanmalıdır.',
    baseScore: 34,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2.3 ABDOMİNAL / GİS ACİLLER — EK SENARYOLAR
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'cholecystitis',
    label: 'Akut kolesistit / Biliyer patoloji',
    keywords: ['safra', 'kolesistit', 'sağ üst kadran', 'sag ust kadran', 'murphy', 'biliyer', 'sarılık', 'sarilik'],
    symptomMatches: ['ateş', 'kusma', 'bulantı', 'sarılık'],
    vitalSignals: { temp_above: 37.8 },
    urgencyBoost: ['Yüksek', 'Orta'],
    imaging_choice: 'US Abdomen',
    contrast_requirement: 'Uygulanamaz (US)',
    treatment_decision: 'Genel cerrahi konsültasyonu, IV antibiyotik, ağrı kontrolü',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'BT Abdomen-Pelvis kontrastlı',
    rationale: 'Sağ üst kadran ağrısı ve ateş birlikteliğinde akut kolesistit ilk US ile değerlendirilmelidir (Murphy bulgusu, duvar kalınlaşması).',
    baseScore: 30,
  },
  {
    id: 'diverticulitis',
    label: 'Akut divertikülit',
    keywords: ['sol alt kadran', 'divertikülit', 'divertikulit', 'sigma', 'sigmoid'],
    symptomMatches: ['ateş', 'defans', 'kabızlık', 'ishal'],
    vitalSignals: { temp_above: 37.8, pulse_above: 90 },
    urgencyBoost: ['Yüksek', 'Orta'],
    imaging_choice: 'BT Abdomen-Pelvis kontrastlı',
    contrast_requirement: 'IV kontrastlı',
    treatment_decision: 'Antibiyotik tedavisi, komplikasyon değerlendirmesi (apse, perforasyon)',
    triage: 'Yarı-acil (<24 saat)',
    alternative_modality: 'US Abdomen',
    rationale: 'Sol alt kadran ağrısında divertikülit ve komplikasyonları (apse, perforasyon) için kontrastlı BT altın standarttır.',
    baseScore: 28,
  },
  {
    id: 'bowel_obstruction',
    label: 'İnce barsak obstrüksiyonu',
    keywords: ['ileus', 'obstrüksiyon', 'obstruksiyon', 'tıkanıklık', 'tikaniklik', 'distansiyon', 'kusma safralı', 'barsak'],
    symptomMatches: ['kusma', 'distansiyon', 'kabızlık', 'kolik ağrı'],
    vitalSignals: { pulse_above: 100 },
    urgencyBoost: ['Yüksek', 'Kritik'],
    imaging_choice: 'BT Abdomen-Pelvis kontrastlı',
    contrast_requirement: 'IV kontrastlı',
    treatment_decision: 'Nazogastrik dekompresyon, cerrahi konsültasyon, strangülasyon değerlendirmesi',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'X-Ray Toraks',
    rationale: 'Mekanik barsak obstrüksiyonunda BT hem tanı hem de strangülasyon/iskemi komplikasyonlarını değerlendirmek için gereklidir.',
    baseScore: 30,
  },
  {
    id: 'mesenteric_ischemia',
    label: 'Mezenterik iskemi',
    keywords: ['mezenterik', 'iskemi', 'yemek sonrası ağrı', 'kilo kaybı karın', 'atriyal fibrilasyon karın', 'laktik asidoz'],
    symptomMatches: ['karın ağrısı', 'kusma', 'kanlı dışkılama', 'ateş'],
    vitalSignals: { pulse_above: 110, bp_systolic_below: 100 },
    urgencyBoost: ['Kritik'],
    imaging_choice: 'BTA Abdomen-Pelvis',
    contrast_requirement: 'IV kontrastlı',
    treatment_decision: 'Acil girişimsel radyoloji veya cerrahi konsültasyon, antikoagülasyon',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'BT Abdomen-Pelvis kontrastlı',
    rationale: 'Akut mezenterik iskemi şüphesinde BTA ile vasküler değerlendirme hayat kurtarıcıdır — mortalite tedavi gecikmesiyle doğru orantılıdır.',
    baseScore: 36,
  },
  {
    id: 'gi_bleeding',
    label: 'Üst GİS kanaması',
    keywords: ['hematemez', 'melena', 'kanama', 'kanlı kusma', 'kahve telvesi', 'üst gis'],
    symptomMatches: ['hematemez', 'melena', 'hipotansiyon', 'taşikardi'],
    vitalSignals: { pulse_above: 100, bp_systolic_below: 90 },
    urgencyBoost: ['Kritik', 'Yüksek'],
    imaging_choice: 'BTA Abdomen-Pelvis',
    contrast_requirement: 'IV kontrastlı',
    treatment_decision: 'Acil endoskopi planı, sıvı resüsitasyonu, kan ürünü hazırlığı',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'US Abdomen',
    rationale: 'Aktif üst GİS kanamasında endoskopi öncesi BTA ile aktif kanama odağı lokalize edilebilir.',
    baseScore: 32,
  },
  {
    id: 'pancreatitis',
    label: 'Akut pankreatit',
    keywords: ['pankreatit', 'epigastrik', 'amilaz', 'lipaz', 'sırta vuran', 'sirta vuran', 'kuşak tarzı'],
    symptomMatches: ['karın ağrısı', 'kusma', 'ateş', 'sarılık'],
    vitalSignals: { pulse_above: 100, temp_above: 38 },
    urgencyBoost: ['Yüksek', 'Kritik'],
    imaging_choice: 'BT Abdomen-Pelvis kontrastlı',
    contrast_requirement: 'IV kontrastlı',
    treatment_decision: 'IV sıvı, analjezi, oral alım kesilmesi, komplikasyon takibi (nekroz, apse)',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'US Abdomen',
    rationale: 'Akut pankreatit tanısında ve komplikasyon değerlendirmesinde (nekroz, peripankreatik koleksiyon) kontrastlı BT standart tetkiktir.',
    baseScore: 28,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2.4 ÜROLOJİK ACİLLER — EK SENARYOLAR
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'pyelonephritis',
    label: 'Akut piyelonefrit',
    keywords: ['piyelonefrit', 'üst üriner', 'ust uriner', 'böbrek enfeksiyonu', 'bobrek enfeksiyonu', 'kostovertebral'],
    symptomMatches: ['ateş', 'yan ağrısı', 'dizüri', 'titreme'],
    vitalSignals: { temp_above: 38.5, pulse_above: 100 },
    urgencyBoost: ['Yüksek'],
    imaging_choice: 'US Abdomen',
    contrast_requirement: 'Uygulanamaz (US)',
    treatment_decision: 'IV antibiyotik, idrar kültürü, hidrasyon, obstrüktif patoloji dışlanmalı',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'BT Abdomen-Pelvis kontrastlı',
    rationale: 'Komplike piyelonefritte obstrüksiyon ve apse dışlanması için US ilk basamaktır. Yanıt alınamazsa BT.',
    baseScore: 26,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2.5 JİNEKOLOJİK / OBSTETRİK ACİLLER — EK SENARYOLAR
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'ovarian_torsion',
    label: 'Over torsiyonu',
    keywords: ['over', 'torsiyon', 'adneksiyal', 'pelvik', 'ani başlayan pelvik'],
    symptomMatches: ['pelvik ağrı', 'kusma', 'bulantı'],
    vitalSignals: { pulse_above: 100 },
    urgencyBoost: ['Kritik', 'Yüksek'],
    imaging_choice: 'US Pelvik (TV)',
    contrast_requirement: 'Uygulanamaz (US)',
    treatment_decision: 'Acil jinekoloji konsültasyonu, cerrahi detorsiyon planı',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'MR Abdomen kontrastsız',
    rationale: 'Ani başlayan pelvik ağrıda over torsiyonu 6 saat içinde değerlendirilmelidir — Doppler US ile over perfüzyonu kontrol edilir.',
    baseScore: 34,
  },
  {
    id: 'vaginal_bleeding_trimester',
    label: '2./3. Trimester vajinal kanama',
    keywords: ['vajinal kanama', 'gebelik kanama', 'plasenta previa', 'dekolman', 'abruptio'],
    symptomMatches: ['vajinal kanama', 'karın ağrısı', 'uterin hassasiyet'],
    vitalSignals: { pulse_above: 100, bp_systolic_below: 100 },
    urgencyBoost: ['Kritik', 'Yüksek'],
    imaging_choice: 'US Pelvik (TV)',
    contrast_requirement: 'Uygulanamaz (US)',
    treatment_decision: 'Acil obstetrik değerlendirme, fetal monitörizasyon, kan ürünü hazırlığı',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'US Abdomen (transabdominal)',
    rationale: 'Gebelikte vajinal kanamada plasenta lokalizasyonu ve fetal durum US ile acil değerlendirilmelidir.',
    baseScore: 35,
  },
  {
    id: 'postpartum_hemorrhage',
    label: 'Postpartum kanama',
    keywords: ['postpartum', 'doğum sonrası', 'dogum sonrasi', 'lohusa', 'uterin atoni', 'retansiyon'],
    symptomMatches: ['vajinal kanama', 'hipotansiyon', 'taşikardi'],
    vitalSignals: { pulse_above: 110, bp_systolic_below: 90 },
    urgencyBoost: ['Kritik'],
    imaging_choice: 'US Pelvik (TV)',
    contrast_requirement: 'Uygulanamaz (US)',
    treatment_decision: 'Uterin masaj, uterotonikler, cerrahi/girişimsel müdahale değerlendirmesi',
    triage: 'Acil (<1 saat)',
    alternative_modality: 'BTA Abdomen-Pelvis',
    rationale: 'Postpartum kanamada retansiyon ve uterin patoloji US ile değerlendirilir. Aktif kanama devamında BTA endikedir.',
    baseScore: 34,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2.6 KAS-İSKELET / TRAVMA ACİLLERİ — EK SENARYOLAR
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'hip_fracture',
    label: 'Kalça kırığı / Akut kalça ağrısı',
    keywords: ['kalça', 'kalca', 'femur', 'düşme yaşlı', 'dusme yasli', 'kısaltma', 'rotasyon'],
    symptomMatches: ['ağrı', 'yürüyememe', 'düşme', 'deformite'],
    vitalSignals: {},
    urgencyBoost: ['Yüksek', 'Orta'],
    imaging_choice: 'X-Ray Pelvis/Kalça',
    contrast_requirement: 'Uygulanamaz (X-Ray)',
    treatment_decision: 'Ortopedi konsültasyonu, cerrahi planlama, ağrı kontrolü',
    triage: 'Yarı-acil (<24 saat)',
    alternative_modality: 'MR (okkült kırık şüphesinde)',
    rationale: 'Yaşlı hastada düşme sonrası kalça ağrısında femur boyun kırığı direkt grafi ile değerlendirilir. Negatifse MR.',
    baseScore: 24,
  },
  {
    id: 'ankle_trauma',
    label: 'Akut ayak bileği travması',
    keywords: ['ayak bileği', 'ayak bilegi', 'inversyon', 'eversyon', 'malleol', 'burkulma', 'ottawa'],
    symptomMatches: ['ağrı', 'şişlik', 'yürüyememe', 'ekimoz'],
    vitalSignals: {},
    urgencyBoost: ['Orta', 'Düşük'],
    imaging_choice: 'X-Ray Ayak Bileği',
    contrast_requirement: 'Uygulanamaz (X-Ray)',
    treatment_decision: 'Ottawa kurallarına göre değerlendirme, RICE protokolü, ortopedi (kırık varsa)',
    triage: 'Yarı-acil (<24 saat)',
    alternative_modality: 'BT (kompleks kırık) veya MR (ligaman yaralanması)',
    rationale: 'Ottawa ayak bileği kurallarına göre pozitif bulgularda direkt grafi endikedir.',
    baseScore: 20,
  },
  {
    id: 'wrist_trauma',
    label: 'Akut el/el bileği travması',
    keywords: ['el bileği', 'el bilegi', 'skafoid', 'colles', 'düşme el', 'dusme el', 'enfiye çukuru'],
    symptomMatches: ['ağrı', 'şişlik', 'deformite', 'hareket kısıtlılığı'],
    vitalSignals: {},
    urgencyBoost: ['Orta', 'Düşük'],
    imaging_choice: 'X-Ray El Bileği',
    contrast_requirement: 'Uygulanamaz (X-Ray)',
    treatment_decision: 'Enfiye çukuru hassasiyetinde skafoid protokolü, ortopedi takibi',
    triage: 'Yarı-acil (<24 saat)',
    alternative_modality: 'MR (okkült skafoid kırığı şüphesinde)',
    rationale: 'El bileği travmasında skafoid kırığı avasküler nekroz riski nedeniyle dikkatle değerlendirilmelidir.',
    baseScore: 20,
  },
  {
    id: 'knee_trauma',
    label: 'Akut diz travması',
    keywords: ['diz', 'patella', 'menisküs', 'meniskus', 'çapraz bağ', 'capraz bag', 'diz kilitlenmesi'],
    symptomMatches: ['ağrı', 'şişlik', 'instabilite', 'kilitlenme'],
    vitalSignals: {},
    urgencyBoost: ['Orta', 'Yüksek'],
    imaging_choice: 'X-Ray Ekstremite',
    contrast_requirement: 'Uygulanamaz (X-Ray)',
    treatment_decision: 'Ottawa diz kuralları, efüzyon varsa artrosentez, ortopedi konsültasyonu',
    triage: 'Yarı-acil (<24 saat)',
    alternative_modality: 'MR (ligaman/menisküs değerlendirmesi)',
    rationale: 'Diz travmasında Ottawa kurallarına göre kırık değerlendirmesi için direkt grafi, yumuşak doku için MR gerekebilir.',
    baseScore: 20,
  },
  {
    id: 'vertebral_compression',
    label: 'Vertebra kompresyon kırığı',
    keywords: ['sırt ağrısı', 'sirt agrisi', 'bel ağrısı', 'bel agrisi', 'osteoporoz', 'kompresyon', 'vertebra'],
    symptomMatches: ['sırt ağrısı', 'hareket kısıtlılığı', 'düşme'],
    vitalSignals: {},
    urgencyBoost: ['Orta', 'Yüksek'],
    imaging_choice: 'X-Ray Ekstremite',
    contrast_requirement: 'Uygulanamaz (X-Ray)',
    treatment_decision: 'Ağrı kontrolü, nörolojik muayene, ortopedi/nöroşirürji konsültasyonu',
    triage: 'Yarı-acil (<24 saat)',
    alternative_modality: 'MR Omurga (akut/kronik ayrımı ve nöral bası değerlendirmesi)',
    rationale: 'Yaşlı hastada düşme sonrası sırt ağrısında osteoporotik vertebra kırığı direkt grafi ile taranır.',
    baseScore: 22,
  },
  {
    id: 'shoulder_injury',
    label: 'Akut omuz ağrısı / Çıkık',
    keywords: ['omuz', 'çıkık', 'cikik', 'dislokasyon', 'rotator', 'abduksiyon'],
    symptomMatches: ['ağrı', 'hareket kısıtlılığı', 'deformite', 'düşme'],
    vitalSignals: {},
    urgencyBoost: ['Orta', 'Yüksek'],
    imaging_choice: 'X-Ray Ekstremite',
    contrast_requirement: 'Uygulanamaz (X-Ray)',
    treatment_decision: 'Çıkık varsa redüksiyon, ortopedi konsültasyonu, immobilizasyon',
    triage: 'Yarı-acil (<24 saat)',
    alternative_modality: 'US (rotator manşet) veya MR',
    rationale: 'Omuz travmasında kırık ve çıkık değerlendirmesi için direkt grafi (AP + aksiller) ilk basamaktır.',
    baseScore: 20,
  },
];

// ─── Vital Bulgu Ayrıştırma ─────────────────────────────────────────────────

function parseVitals(vitals) {
  if (!vitals) return {};

  const parsed = {};

  // SpO2: "%97" veya "97%" veya "97"
  if (vitals.spo2) {
    const match = String(vitals.spo2).match(/(\d+)/);
    if (match) parsed.spo2 = parseInt(match[1], 10);
  }

  // Nabız: "102/dk" veya "102"
  if (vitals.pulse) {
    const match = String(vitals.pulse).match(/(\d+)/);
    if (match) parsed.pulse = parseInt(match[1], 10);
  }

  // Ateş: "37.5 C" veya "37.5"
  if (vitals.temperature) {
    const match = String(vitals.temperature).match(/([\d.]+)/);
    if (match) parsed.temperature = parseFloat(match[1]);
  }

  // GKS: "15" veya "E4V5M6" → sadece sayısal değer
  if (vitals.gcs) {
    const match = String(vitals.gcs).match(/(\d+)/);
    if (match) parsed.gcs = parseInt(match[1], 10);
  }

  // Tansiyon: "128/71 mmHg" → sistolik ve diastolik
  if (vitals.blood_pressure) {
    const match = String(vitals.blood_pressure).match(/(\d+)\s*\/\s*(\d+)/);
    if (match) {
      parsed.bp_systolic = parseInt(match[1], 10);
      parsed.bp_diastolic = parseInt(match[2], 10);
    }
  }

  return parsed;
}

// ─── Skor Hesaplama ──────────────────────────────────────────────────────────

function normalizeForSearch(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ı/g, 'i')
    .replace(/İ/g, 'i').replace(/Ş/g, 's').replace(/Ç/g, 'c')
    .replace(/Ğ/g, 'g').replace(/Ü/g, 'u').replace(/Ö/g, 'o');
}

function computeScore(scenario, vaka, searchText, symptoms, vitals, parsedVitals) {
  let score = 0;

  // 1. Anahtar kelime eşleşmesi (en fazla 30 puan)
  let keywordHits = 0;
  for (const keyword of scenario.keywords) {
    const normalizedKeyword = normalizeForSearch(keyword);
    if (searchText.includes(normalizedKeyword)) {
      keywordHits += 1;
    }
  }
  const keywordRatio = scenario.keywords.length > 0
    ? keywordHits / scenario.keywords.length
    : 0;
  score += Math.round(keywordRatio * 30);

  // 2. Semptom eşleşmesi (en fazla 25 puan)
  let symptomHits = 0;
  const normalizedSymptoms = symptoms.map(normalizeForSearch);
  for (const symptomMatch of scenario.symptomMatches) {
    const normalizedMatch = normalizeForSearch(symptomMatch);
    if (normalizedSymptoms.some((s) => s.includes(normalizedMatch) || normalizedMatch.includes(s))) {
      symptomHits += 1;
    }
  }
  const symptomRatio = scenario.symptomMatches.length > 0
    ? symptomHits / scenario.symptomMatches.length
    : 0;
  score += Math.round(symptomRatio * 25);

  // 3. Vital bulgu sinyalleri (en fazla 20 puan)
  let vitalHits = 0;
  let vitalChecks = 0;
  const signals = scenario.vitalSignals || {};

  if (signals.spo2_below && parsedVitals.spo2) {
    vitalChecks += 1;
    if (parsedVitals.spo2 < signals.spo2_below) vitalHits += 1;
  }
  if (signals.pulse_above && parsedVitals.pulse) {
    vitalChecks += 1;
    if (parsedVitals.pulse > signals.pulse_above) vitalHits += 1;
  }
  if (signals.temp_above && parsedVitals.temperature) {
    vitalChecks += 1;
    if (parsedVitals.temperature > signals.temp_above) vitalHits += 1;
  }
  if (signals.gcs_below && parsedVitals.gcs) {
    vitalChecks += 1;
    if (parsedVitals.gcs < signals.gcs_below) vitalHits += 1;
  }
  if (signals.bp_systolic_above && parsedVitals.bp_systolic) {
    vitalChecks += 1;
    if (parsedVitals.bp_systolic > signals.bp_systolic_above) vitalHits += 1;
  }
  if (signals.bp_systolic_below && parsedVitals.bp_systolic) {
    vitalChecks += 1;
    if (parsedVitals.bp_systolic < signals.bp_systolic_below) vitalHits += 1;
  }

  if (vitalChecks > 0) {
    score += Math.round((vitalHits / vitalChecks) * 20);
  }

  // 4. Aciliyet düzeyi uyumu (en fazla 10 puan)
  if (scenario.urgencyBoost && scenario.urgencyBoost.includes(vaka.urgency_level)) {
    score += 10;
  }

  // 5. Fizik muayene eşleşmesi (en fazla 15 puan)
  const examText = normalizeForSearch(
    Object.values(vaka.physical_exam || {}).filter(Boolean).join(' ')
  );
  if (examText && examText !== 'ozellik yok') {
    let examHits = 0;
    for (const keyword of scenario.keywords) {
      if (examText.includes(normalizeForSearch(keyword))) examHits += 1;
    }
    if (examHits > 0) {
      score += Math.min(15, examHits * 5);
    }
  }

  return score;
}

// ─── Kontrendikasyon Filtresi ────────────────────────────────────────────────

function applyContraindications(suggestion, conditions) {
  const result = { ...suggestion };
  const pregnancy = (conditions.pregnancy_status || '').toLowerCase();
  const renal = (conditions.renal_function || '').toLowerCase();
  const allergy = (conditions.contrast_allergy || '').toLowerCase();
  const metal = (conditions.metal_implant || '').toLowerCase();
  const hemodynamic = (conditions.hemodynamic_status || '').toLowerCase();

  const isPregnant = pregnancy.includes('var') || pregnancy.includes('trimester');
  const isRenalImpaired = renal.includes('bozuk');
  const hasContrastAllergy = allergy.includes('var');
  const hasMetalImplant = metal.includes('metal') || metal.includes('pacemaker');
  const isUnstable = hemodynamic.includes('instabil') || hemodynamic.includes('İnstabil');

  // Gebelik: Radyasyon içeren modaliteleri US/MR'a yönlendir
  if (isPregnant) {
    if (result.imaging_choice.startsWith('BT') || result.imaging_choice.startsWith('X-Ray')) {
      const originalChoice = result.imaging_choice;
      if (result.imaging_choice.includes('Abdomen') || result.imaging_choice.includes('Pelvis')) {
        result.imaging_choice = 'US Abdomen';
        result.contrast_requirement = 'Uygulanamaz (US)';
      } else if (result.imaging_choice.includes('Beyin')) {
        result.imaging_choice = 'MR Beyin (DWI dahil)';
        result.contrast_requirement = 'Kontrastsız';
      } else {
        result.imaging_choice = 'US Abdomen';
        result.contrast_requirement = 'Uygulanamaz (US)';
      }
      result.rationale += ` [GEBELİK: ${originalChoice} yerine radyasyonsuz modalite tercih edildi.]`;
      result.alternative_modality = originalChoice + ' (yalnızca hayatı tehdit eden durumda)';
    }
  }

  // Böbrek fonksiyon bozukluğu: Kontrastlı tetkikleri kontrastsıza çevir
  if (isRenalImpaired && result.contrast_requirement && result.contrast_requirement.toLowerCase().includes('kontrastlı')) {
    const originalContrast = result.contrast_requirement;
    result.contrast_requirement = 'Kontrastsız (böbrek fonksiyon bozukluğu)';
    if (result.imaging_choice.includes('BTA')) {
      result.alternative_modality = result.imaging_choice;
      result.imaging_choice = result.imaging_choice.replace('BTA', 'BT') + ' kontrastsız';
    }
    result.rationale += ` [RENAL: ${originalContrast} kontrendike, kontrastsız protokol uygulanmalı.]`;
  }

  // Kontrast alerjisi: Kontrastlı tetkikleri kontrastsıza çevir veya alternatif öner
  if (hasContrastAllergy && result.contrast_requirement && result.contrast_requirement.toLowerCase().includes('kontrastlı')) {
    result.contrast_requirement = 'Kontrastsız (kontrast alerjisi)';
    if (result.imaging_choice.includes('BTA')) {
      result.alternative_modality = result.imaging_choice + ' (premedikasyon ile)';
      result.imaging_choice = result.imaging_choice.replace('BTA', 'BT');
    }
    result.rationale += ' [ALERJİ: Kontrast madde alerjisi nedeniyle kontrastsız protokol tercih edildi.]';
  }

  // Metal implant / Pacemaker: MR yerine BT öner
  if (hasMetalImplant && result.imaging_choice.startsWith('MR')) {
    const originalChoice = result.imaging_choice;
    result.imaging_choice = result.imaging_choice.replace('MR', 'BT');
    result.alternative_modality = originalChoice + ' (MR güvenlik değerlendirmesi sonrası)';
    result.rationale += ' [METAL İMPLANT: MR kontrendike, BT tercih edildi.]';
  }

  // Hemodinamik instabilite: Taşınabilir/yatak başı modalitelere yönlendir
  if (isUnstable) {
    if (!result.imaging_choice.includes('US') && !result.imaging_choice.includes('X-Ray') && !result.imaging_choice.includes('FAST')) {
      result.alternative_modality = result.imaging_choice;
      const triage = result.triage;
      if (triage === 'Acil (<1 saat)') {
        result.rationale += ' [HEMODİNAMİK İNSTABİLİTE: Stabilizasyon öncelikli, yatak başı görüntüleme düşünülmeli.]';
      }
    }
  }

  return result;
}

// ─── Güven Düzeyi Hesaplama ──────────────────────────────────────────────────

function computeConfidence(topScore, secondScore) {
  // Yüksek puan ve ikinci seçenekle belirgin fark varsa güven yüksek
  if (topScore >= 60 && (topScore - secondScore) >= 20) return 'Yüksek';
  if (topScore >= 45 && (topScore - secondScore) >= 10) return 'Orta-Yüksek';
  if (topScore >= 30) return 'Orta';
  if (topScore >= 15) return 'Düşük-Orta';
  return 'Düşük';
}

// ─── Ana Fonksiyon ───────────────────────────────────────────────────────────

export function buildAiSuggestion(vaka) {
  const complaint = vaka.complaint || '';
  const symptoms = vaka.symptoms || [];
  const conditions = vaka.special_conditions || vaka.contraindications || {};
  const vitals = vaka.vitals || {};
  const parsedVitals = parseVitals(vitals);

  // Arama metni: şikayet + semptomlar + fizik muayene
  const searchText = normalizeForSearch(
    [complaint, ...symptoms, ...Object.values(vaka.physical_exam || {})].join(' ')
  );

  // Her senaryo için skor hesapla
  const scored = CLINICAL_SCENARIOS.map((scenario) => ({
    scenario,
    score: computeScore(scenario, vaka, searchText, symptoms, vitals, parsedVitals),
  }));

  // Skora göre sırala
  scored.sort((a, b) => b.score - a.score);

  const topResult = scored[0];
  const secondResult = scored[1];

  // Minimum eşik: en az 12 puan olmalı, yoksa genel öneri ver
  if (topResult.score < 12) {
    const isCritical = vaka.urgency_level === 'Kritik';
    return {
      imaging_choice: isCritical ? 'BT Abdomen-Pelvis kontrastlı' : 'Tetkik gerekmez',
      contrast_requirement: isCritical ? 'IV kontrastlı' : 'Uygulanamaz',
      treatment_decision: isCritical
        ? 'Klinik bulgular spesifik senaryo oluşturmuyor, geniş değerlendirme önerilir'
        : 'Acil görüntüleme endikasyonu zayıf, poliklinik izlemi önerilir',
      triage: isCritical ? 'Acil (<1 saat)' : 'Elektif',
      alternative_modality: isCritical ? 'US Abdomen' : 'Klinik takip',
      rationale: isCritical
        ? 'Kritik aciliyet düzeyi mevcut ancak klinik bulgular belirli bir senaryoya yönlendirmiyor. Geniş değerlendirme önerilir.'
        : 'Mevcut klinik bulgular belirli bir acil görüntüleme senaryosuna uymamaktadır.',
      confidence: 'Düşük',
      _engine: 'v2',
      _top_scenario: null,
      _top_score: topResult.score,
    };
  }

  const scenario = topResult.scenario;
  let suggestion = {
    imaging_choice: scenario.imaging_choice,
    contrast_requirement: scenario.contrast_requirement,
    treatment_decision: scenario.treatment_decision,
    triage: scenario.triage,
    alternative_modality: scenario.alternative_modality,
    rationale: scenario.rationale,
    confidence: computeConfidence(topResult.score, secondResult?.score || 0),
    _engine: 'v2',
    _top_scenario: scenario.id,
    _top_score: topResult.score,
    _second_scenario: secondResult?.scenario.id || null,
    _second_score: secondResult?.score || 0,
  };

  // Kontrendikasyon filtresi uygula (güvenlik katmanı)
  suggestion = applyContraindications(suggestion, conditions);

  return suggestion;
}
