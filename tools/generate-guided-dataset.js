const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_SOURCE = path.join(ROOT, 'src', 'data', 'hasta_veri.json');
const OUT_SERVER = path.join(ROOT, 'server', 'data', 'vaka-kayitlari.json');
const BACKUP_DIR = path.join(ROOT, 'server', 'data', 'backups');
const CASE_COUNT = Number(process.argv[2] || 2000);

let seed = Number(process.argv[3] || 20260609);
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}

function pick(items) {
  return items[Math.floor(random() * items.length)];
}

function chance(value) {
  return random() < value;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pickSome(items, min, max) {
  const list = [...items].sort(() => random() - 0.5);
  const count = clamp(min + Math.floor(random() * (max - min + 1)), 0, items.length);
  return list.slice(0, count);
}

function caseId(index) {
  return `CASE-${String(100001 + index).padStart(6, '0')}`;
}

function ageGroup(age) {
  if (age < 1) return 'infant';
  if (age < 18) return 'pediatric';
  if (age < 65) return 'adult';
  return 'geriatric';
}

function lower(value) {
  return String(value).toLocaleLowerCase('tr-TR');
}

function doctorEmpty() {
  return {
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
}

const presentationTimes = ['Gündüz', 'Gece', 'Hafta sonu', 'Mesai dışı', 'Sabah erken', 'Akşam'];
const contexts = [
  'acil servise ayaktan başvurdu',
  '112 ile getirildi',
  'triajda öncelikli değerlendirildi',
  'yakını tarafından getirildi',
  'iş yerinden acile yönlendirildi',
  'evde başlayan yakınması nedeniyle geldi',
  'aile hekimi yönlendirmesiyle başvurdu',
  'bekleme alanında tekrar değerlendirildi',
  'dış merkezden sevk edildi',
  'acile kendi imkanlarıyla geldi',
  'ambulans ile getirildi',
  'polis refakatinde getirildi',
];
const courses = ['giderek artıyor', 'dalgalı seyrediyor', 'sabit seyrediyor', 'ataklar halinde geliyor', 'son saatlerde belirginleşti', 'tedaviye kısmi yanıt veriyor', 'giderek kötüleşiyor'];
const severityWords = ['hafif-orta', 'orta', 'belirgin', 'şiddetli', 'dayanılmaz'];
const ordinaryDetails = [
  'vital bulgular ilk değerlendirmede izlendi',
  'muayene bulguları başvuru yakınmasıyla uyumlu',
  'önceki başvurularından farklı tarif ediyor',
  'semptomlar günlük aktiviteyi kısıtlıyor',
  'eşlik eden risk faktörleri nedeniyle görüntüleme istendi',
  'klinik ekip radyoloji önerisi istedi',
  'ilk tedavi sonrası görüntüleme kararı netleştirildi',
  'hasta semptomlarını detaylı tarif ediyor',
  'özgeçmişinde ek risk faktörleri mevcut',
  'kardiyak enzimler takip ediliyor',
  'triajda öncelikli hasta olarak değerlendirildi',
  'analjezi ihtiyacı belirtildi',
  'hasta ve yakını bilgilendirildi',
  'klinik karar destek sistemi aktive edildi',
];
const complaintTails = [
  'muayenede bulgu belirginleşmiş',
  'yakını başlangıç zamanını net tarif ediyor',
  'analjezi sonrası kısmi rahatlamış',
  'hareketle yakınması artıyor',
  'oral alımı azalmış',
  'triajda tekrar değerlendirilmiş',
  'ön değerlendirmede risk faktörü not edilmiş',
  'gece saatlerinde belirginleşmiş',
  'klinik ekip radyoloji görüşü istemiş',
  'benzer yakınması daha önce olmamış',
  'semptomlar istirahatle hafiflemiş',
  'pozisyon değişikliği ile yakınması artıyor',
  'soğuk uygulama sonrası kısmen rahatlamış',
  'derin nefes almakla ağrısı tetikleniyor',
  'öksürükle birlikte ağrı belirginleşiyor',
  'yatmakla rahatlayan yakınma',
];
const histories = [
  'Bilinen kronik hastalık yok',
  'Hipertansiyon',
  'Diabetes mellitus',
  'Koroner arter hastalığı',
  'Kronik böbrek hastalığı',
  'KOAH/astım',
  'Malignite öyküsü',
  'Geçirilmiş operasyon',
  'Atriyal fibrilasyon',
  'Gebelik takibi',
  'Taş öyküsü',
  'Kalp yetmezliği',
  'Serebrovasküler hastalık',
  'Osteoporoz',
  'Depresyon',
  'Romatolojik hastalık',
];
const medications = [
  'Düzenli ilaç kullanımı yok',
  'Antihipertansif',
  'Metformin',
  'İnsülin/oral antidiyabetik',
  'Antiagregan',
  'Antikoagülan',
  'Steroid',
  'Bronkodilatör',
  'NSAİİ kullanımı',
  'Beta bloker',
  'ACE inhibitörü',
  'Diüretik',
  'Statın',
  'SSRI',
  'Antiepileptik',
];

const drugMap = {
  'Hipertansiyon': ['Antihipertansif', 'Beta bloker', 'ACE inhibitörü', 'Diüretik'],
  'Diabetes mellitus': ['Metformin', 'İnsülin/oral antidiyabetik'],
  'Koroner arter hastalığı': ['Antiagregan', 'Statın', 'Beta bloker'],
  'Atriyal fibrilasyon': ['Antikoagülan', 'Beta bloker'],
  'KOAH/astım': ['Bronkodilatör', 'Steroid'],
  'Kalp yetmezliği': ['Diüretik', 'Beta bloker', 'ACE inhibitörü'],
  'Serebrovasküler hastalık': ['Antiagregan', 'Antihipertansif'],
  'Depresyon': ['SSRI'],
  'Romatolojik hastalık': ['Steroid', 'NSAİİ kullanımı'],
  'Malignite öyküsü': ['NSAİİ kullanımı'],
  'Kronik böbrek hastalığı': ['Diüretik', 'Antihipertansif'],
};

const adultOnlyMeds = new Set(['Antihipertansif', 'Beta bloker', 'ACE inhibitörü', 'Diüretik', 'Statın', 'Antikoagülan', 'Antiagregan', 'Metformin', 'İnsülin/oral antidiyabetik']);

function medicationsForHistory(historyList, age) {
  const pool = new Set();
  historyList.forEach(h => {
    (drugMap[h] || []).forEach(d => pool.add(d));
  });
  if (pool.size === 0) return ['Düzenli ilaç kullanımı yok'];
  const extras = ['NSAİİ kullanımı', 'SSRI', 'Antiepileptik', 'Steroid', 'Statın'];
  if (chance(0.15)) pool.add(pick(extras));
  const filtered = age < 12 ? [...pool].filter(m => !adultOnlyMeds.has(m)) : [...pool];
  if (filtered.length === 0) return ['Düzenli ilaç kullanımı yok'];
  const result = pickSome(filtered, Math.min(1, filtered.length), Math.min(3, filtered.length));
  return result.length === 0 ? ['Düzenli ilaç kullanımı yok'] : [...new Set(result)];
}

const durationProfiles = {
  minutes: ['15 dakika', '25 dakika', '35 dakika', '45 dakika', '55 dakika', '1 saat', '1.5 saat', '2 saat'],
  acuteHours: ['1 saat', '2 saat', '3 saat', '4 saat', '5 saat', '6 saat', '8 saat', '10 saat', '12 saat'],
  sameDay: ['2 saat', '4 saat', '6 saat', '8 saat', '10 saat', '12 saat', '18 saat', 'bugün sabah', 'öğleden sonra'],
  shortDays: ['1 gün', '2 gün', '3 gün', '4 gün'],
  severalDays: ['2 gün', '3 gün', '4 gün', '5 gün', '6 gün', '1 hafta'],
  trauma: ['hemen', '20 dakika', '30 dakika', '45 dakika', '1 saat', '2 saat', '3 saat', '6 saat', 'aynı gün'],
  pregnancy: ['2 saat', '4 saat', '6 saat', '8 saat', '10 saat', '1 gün'],
  subacute: ['3 gün', '5 gün', '1 hafta', '10 gün', '2 hafta'],
  chronic: ['1 hafta', '2 hafta', '3 hafta', '1 ay'],
};

function T(template) {
  return template;
}

const templates = [
  T({
    topic: 'Ani başlangıçlı baş ağrısı - SAK şüphesi',
    phase: 1,
    weight: 9,
    category: 'neuro',
    genders: ['Kadın', 'Erkek'],
    age: [18, 85],
    duration: 'minutes',
    onset: ['ani başlangıçlı', 'dakikalar içinde pik yapan'],
    complaintBases: ['çok şiddetli baş ağrısı', 'enseye vuran patlayıcı baş ağrısı', 'hayatının en kötü baş ağrısı'],
    symptoms: ['bulantı', 'kusma', 'ense sertliği', 'fotofobi', 'baş dönmesi'],
    exam: { neurological: ['ense sertliği (+), fokal defisit yok', 'GKS 14, ense sertliği mevcut', 'pupil izokorik, ense sertliği şüpheli'], abdomen: ['doğal'], extremity: ['doğal'], cardiopulmonary: ['doğal'] },
    urgency: 'Kritik',
    ai: ['BT Beyin kontrastsız', 'Kontrastsız', 'Acil (<1 saat)', 'BTA Beyin', 'Ani başlangıçlı şiddetli baş ağrısında subaraknoid kanama dışlanmalıdır.'],
    labs: [],
  }),
  T({
    topic: 'Akut inme bulgusu',
    phase: 1,
    weight: 12,
    category: 'neuro',
    genders: ['Kadın', 'Erkek'],
    age: [45, 92],
    duration: 'minutes',
    onset: ['ani başlangıçlı', 'son görülme zamanı net olan'],
    complaintBases: ['konuşma bozukluğu ve tek taraflı güç kaybı', 'yüzde kayma ve kol güçsüzlüğü', 'akut nörolojik defisit'],
    symptoms: ['afazi', 'hemiparezi', 'yüz asimetrisi', 'dizartri', 'denge kaybı'],
    exam: { neurological: ['tek taraflı güç kaybı', 'konuşma bozukluğu ve fasiyal asimetri', 'kol drift pozitif'], abdomen: ['doğal'], extremity: ['lateralize güç kaybı'], cardiopulmonary: ['ritim düzensizliği olabilir'] },
    urgency: 'Kritik',
    ai: ['BT Beyin kontrastsız', 'Kontrastsız', 'Acil (<1 saat)', 'BTA Beyin veya MR Beyin (DWI dahil)', 'Akut inmede kanama dışlanması ve damar değerlendirmesi için hızlı görüntüleme gerekir.'],
    labs: ['glucose', 'inr'],
  }),
  T({
    topic: 'Kafa travması',
    phase: 1,
    weight: 11,
    category: 'neuro_trauma',
    genders: ['Kadın', 'Erkek'],
    age: [1, 90],
    duration: 'trauma',
    onset: ['travma sonrası'],
    complaintBases: ['baş travması sonrası baş ağrısı', 'düşme sonrası bulantı ve baş ağrısı', 'darp sonrası bilinç bulanıklığı'],
    trauma: ['basit düşme', 'trafik kazası', 'darp', 'bisiklet kazası', 'merdivenden düşme'],
    symptoms: ['kusma', 'kısa süreli bilinç kaybı', 'amnezi', 'baş ağrısı', 'skalpte hematom'],
    exam: { neurological: ['GKS 14-15, fokal defisit yok', 'skalpte hematom', 'konfüzyon hafif'], abdomen: ['doğal'], extremity: ['ekimoz olabilir'], cardiopulmonary: ['doğal'] },
    urgency: 'Yüksek',
    ai: ['BT Beyin kontrastsız', 'Kontrastsız', 'Acil (<1 saat)', 'BT Servikal/Lomber Omurga', 'Travma sonrası bilinç kaybı, kusma veya antikoagülan kullanımı varsa kafa BT endikedir.'],
    labs: [],
  }),
  T({
    topic: 'İlk nöbet / status epileptikus sonrası',
    phase: 2,
    weight: 5,
    category: 'neuro',
    genders: ['Kadın', 'Erkek'],
    age: [6, 86],
    duration: 'sameDay',
    onset: ['ani gelişen', 'tanıklı atak sonrası'],
    complaintBases: ['ilk kez nöbet geçirme', 'nöbet sonrası bilinç bulanıklığı', 'uzamış postiktal konfüzyon'],
    symptoms: ['dil ısırma', 'postiktal uyku hali', 'baş ağrısı', 'idrar kaçırma', 'ateş yok'],
    exam: { neurological: ['postiktal, fokal defisit yok', 'bilinç toparlıyor', 'ense sertliği yok'], abdomen: ['doğal'], extremity: ['doğal'], cardiopulmonary: ['doğal'] },
    urgency: 'Yüksek',
    ai: ['BT Beyin kontrastsız', 'Kontrastsız', 'Acil (<1 saat)', 'MR Beyin (DWI dahil)', 'İlk nöbet veya uzamış bilinç değişikliğinde akut yapısal nedenler dışlanmalıdır.'],
    labs: ['glucose', 'sodium'],
  }),
  T({
    topic: 'Santral vertigo / ataksi şüphesi',
    phase: 2,
    weight: 5,
    category: 'neuro',
    genders: ['Kadın', 'Erkek'],
    age: [40, 88],
    duration: 'acuteHours',
    onset: ['ani başlangıçlı', 'sabah fark edilen'],
    complaintBases: ['dengesizlik ve yürüme bozukluğu', 'şiddetli baş dönmesi ve ataksi', 'santral vertigo düşündüren tablo'],
    symptoms: ['ataksi', 'nistagmus', 'kusma', 'dizartri olabilir', 'baş dönmesi'],
    exam: { neurological: ['ataksik yürüyüş', 'nistagmus mevcut', 'fokal defisit belirsiz'], abdomen: ['doğal'], extremity: ['doğal'], cardiopulmonary: ['doğal'] },
    urgency: 'Yüksek',
    ai: ['MR Beyin (DWI dahil)', 'Kontrastsız', 'Acil (<1 saat)', 'BT Beyin kontrastsız', 'Santral vertigo veya posterior dolaşım inmesi şüphesinde DWI içeren MR daha duyarlıdır.'],
    labs: [],
  }),
  T({
    topic: 'Düşük risk senkop',
    phase: 3,
    weight: 5,
    category: 'neuro_low',
    genders: ['Kadın', 'Erkek'],
    age: [18, 75],
    duration: 'sameDay',
    onset: ['kısa süreli', 'prodrom sonrası'],
    complaintBases: ['kısa süreli bayılma', 'ayakta beklerken senkop', 'prodromla gelen bayılma hissi'],
    symptoms: ['baş dönmesi', 'soğuk terleme', 'çarpıntı yok', 'travma yok', 'nörolojik defisit yok'],
    exam: { neurological: ['fokal defisit yok', 'GKS 15', 'nörolojik muayene doğal'], abdomen: ['doğal'], extremity: ['doğal'], cardiopulmonary: ['ritim düzenli'] },
    urgency: 'Düşük',
    ai: ['Tetkik gerekmez', 'Uygulanamaz', 'Elektif', 'Klinik takip', 'Düşük risk senkopta nörolojik defisit veya travma yoksa rutin beyin görüntüleme endikasyonu zayıftır.'],
    labs: ['glucose'],
  }),
  T({
    topic: 'Pulmoner emboli şüphesi',
    phase: 1,
    weight: 11,
    category: 'thorax',
    genders: ['Kadın', 'Erkek'],
    age: [18, 88],
    duration: 'acuteHours',
    onset: ['ani başlangıçlı', 'son saatlerde gelişen'],
    complaintBases: ['nefes darlığı ve plevritik göğüs ağrısı', 'dispne ve oksijen düşüklüğü', 'ani başlayan göğüs ağrısı'],
    symptoms: ['dispne', 'taşikardi', 'plevritik ağrı', 'hipoksi', 'tek taraflı baldır ağrısı'],
    exam: { neurological: ['doğal'], abdomen: ['doğal'], extremity: ['tek taraflı baldır hassasiyeti olabilir'], cardiopulmonary: ['taşikardi, solunum sesleri doğal'] },
    urgency: 'Kritik',
    ai: ['BTA Toraks', 'IV kontrastlı', 'Acil (<1 saat)', 'V/Q Sintigrafisi veya US Doppler Alt Ekstremite', 'Pulmoner emboli şüphesinde kontrastlı toraks anjiyografi birincil ileri tetkiktir.'],
    labs: ['d_dimer', 'creatinine'],
  }),
  T({
    topic: 'Akut aort sendromu',
    phase: 1,
    weight: 7,
    category: 'thorax',
    genders: ['Kadın', 'Erkek'],
    age: [40, 90],
    duration: 'minutes',
    onset: ['ani başlangıçlı', 'istirahat sırasında başlayan'],
    complaintBases: ['sırta vuran yırtıcı göğüs ağrısı', 'ani şiddetli göğüs ve sırt ağrısı', 'nabız farkıyla birlikte göğüs ağrısı'],
    symptoms: ['terleme', 'sırt ağrısı', 'senkop hissi', 'tansiyon farkı', 'bulantı'],
    exam: { neurological: ['doğal veya geçici defisit', 'fokal defisit yok'], abdomen: ['hassasiyet yok'], extremity: ['nabız asimetrisi olabilir'], cardiopulmonary: ['hipertansiyon, taşikardi'] },
    urgency: 'Kritik',
    ai: ['BTA Toraks-Abdomen', 'IV kontrastlı', 'Acil (<1 saat)', 'EKO (TTE) veya MRA', 'Akut aort sendromunda hızlı damar haritalaması gerekir.'],
    labs: ['creatinine', 'troponin'],
  }),
  T({
    topic: 'Düşük risk akut göğüs ağrısı',
    phase: 3,
    weight: 6,
    category: 'thorax_low',
    genders: ['Kadın', 'Erkek'],
    age: [18, 70],
    duration: 'sameDay',
    onset: ['yavaş başlayan', 'eforla ilişkisiz'],
    complaintBases: ['nonspesifik göğüs ağrısı', 'batıcı tarzda göğüs ağrısı', 'öksürükle artan göğüs ağrısı'],
    symptoms: ['dispne yok', 'ateş yok', 'EKG akut iskemi göstermiyor', 'palpasyonla hassasiyet olabilir'],
    exam: { neurological: ['doğal'], abdomen: ['doğal'], extremity: ['doğal'], cardiopulmonary: ['akciğer sesleri doğal, göğüs duvarı hassas'] },
    urgency: 'Orta',
    ai: ['X-Ray Toraks', 'Uygulanamaz', 'Yarı-acil (<24 saat)', 'Klinik takip', 'Düşük risk göğüs ağrısında akciğer patolojisi veya göğüs duvarı nedeni için grafi yeterli olabilir.'],
    labs: ['troponin'],
  }),
  T({
    topic: 'Kardiyak kökenli dispne / kalp yetmezliği',
    phase: 1,
    weight: 7,
    category: 'thorax',
    genders: ['Kadın', 'Erkek'],
    age: [45, 92],
    duration: 'shortDays',
    onset: ['giderek artan', 'son günlerde belirginleşen'],
    complaintBases: ['nefes darlığı ve ortopne', 'bacak şişliğiyle birlikte dispne', 'efor kapasitesinde azalma'],
    symptoms: ['ortopne', 'bacak ödemi', 'öksürük', 'çabuk yorulma', 'hipoksi olabilir'],
    exam: { neurological: ['doğal'], abdomen: ['hafif hepatomegali olabilir'], extremity: ['pretibial ödem'], cardiopulmonary: ['bazallerde ral, taşikardi'] },
    urgency: 'Yüksek',
    ai: ['X-Ray Toraks', 'Uygulanamaz', 'Acil (<1 saat)', 'EKO (TTE)', 'Kardiyak dispnede akciğer grafisi ve ekokardiyografi klinik ayrımı destekler.'],
    labs: ['bnp', 'creatinine'],
  }),
  T({
    topic: 'Pnömotoraks şüphesi',
    phase: 1,
    weight: 6,
    category: 'thorax',
    genders: ['Kadın', 'Erkek'],
    age: [16, 75],
    duration: 'minutes',
    onset: ['ani başlangıçlı', 'travma sonrası'],
    complaintBases: ['tek taraflı göğüs ağrısı ve nefes darlığı', 'travma sonrası nefes darlığı', 'ani plevritik ağrı'],
    trauma: ['Yok', 'künt göğüs travması', 'spor yaralanması'],
    symptoms: ['dispne', 'plevritik ağrı', 'oksijen ihtiyacı', 'öksürük', 'hipoksi olabilir'],
    exam: { neurological: ['doğal'], abdomen: ['doğal'], extremity: ['doğal'], cardiopulmonary: ['tek tarafta solunum sesi azalması'] },
    urgency: 'Yüksek',
    ai: ['X-Ray Toraks', 'Uygulanamaz', 'Acil (<1 saat)', 'BT Toraks', 'Pnömotoraks şüphesinde hızlı ilk basamak toraks grafisidir.'],
    labs: [],
  }),
  T({
    topic: 'Künt toraks travması',
    phase: 1,
    weight: 6,
    category: 'trauma',
    genders: ['Kadın', 'Erkek'],
    age: [16, 90],
    duration: 'trauma',
    onset: ['travma sonrası'],
    complaintBases: ['künt travma sonrası göğüs ağrısı', 'emniyet kemeri izi ve toraks ağrısı', 'düşme sonrası kaburga ağrısı'],
    trauma: ['trafik kazası', 'yüksekten düşme', 'darp', 'bisiklet kazası'],
    symptoms: ['göğüs duvarı hassasiyeti', 'dispne olabilir', 'ekimoz', 'öksürükle ağrı artışı'],
    exam: { neurological: ['doğal'], abdomen: ['batın hassasiyeti yok veya hafif'], extremity: ['ekimoz olabilir'], cardiopulmonary: ['göğüs duvarı hassas, solunum sesleri izleniyor'] },
    urgency: 'Yüksek',
    ai: ['BT Travma protokolü', 'Klinik senaryoya göre IV kontrastlı', 'Acil (<1 saat)', 'X-Ray Toraks veya FAST US', 'Yüksek enerjili travmada toraks ve eşlik eden yaralanmalar hızlı değerlendirilmelidir.'],
    labs: ['hemoglobin'],
  }),
  T({
    topic: 'Erişkinde apandisit şüphesi',
    phase: 1,
    weight: 12,
    category: 'abdomen',
    genders: ['Kadın', 'Erkek'],
    age: [16, 75],
    duration: 'sameDay',
    onset: ['yavaş başlayan', 'göbek çevresinden sağa kayan'],
    complaintBases: ['sağ alt kadran ağrısı', 'göbek çevresinden sağ alt kadrana kayan ağrı', 'iştahsızlıkla birlikte karın ağrısı'],
    symptoms: ['bulantı', 'iştahsızlık', 'kusma', 'ateş', 'rebound'],
    exam: { neurological: ['doğal'], abdomen: ['McBurney hassasiyeti (+)', 'sağ alt kadranda hassasiyet', 'rebound şüpheli'], extremity: ['doğal'], cardiopulmonary: ['doğal'] },
    urgency: 'Yüksek',
    ai: ['BT Abdomen-Pelvis kontrastlı', 'IV kontrastlı', 'Acil (<1 saat)', 'US Abdomen', 'Erişkin akut apandisit şüphesinde kontrastlı BT tanısal değeri yüksek bir seçenektir.'],
    labs: ['leukocyte', 'crp', 'creatinine'],
  }),
  T({
    topic: 'Gebelikte sağ alt kadran ağrısı',
    phase: 2,
    weight: 7,
    category: 'abdomen_pregnancy',
    genders: ['Kadın'],
    age: [18, 42],
    pregnancy: ['Var - 1. trimester', 'Var - 2. trimester', 'Var - 3. trimester'],
    duration: 'pregnancy',
    onset: ['yavaş başlayan', 'giderek artan'],
    complaintBases: ['gebelikte sağ alt kadran ağrısı', 'gebede bulantı ve sağ alt kadran ağrısı', 'gebelikte apandisit şüphesi'],
    symptoms: ['bulantı', 'iştahsızlık', 'kusma', 'hafif ateş', 'uterin hassasiyet yok'],
    exam: { neurological: ['doğal'], abdomen: ['sağ alt kadranda hassasiyet', 'rebound olabilir'], extremity: ['doğal'], cardiopulmonary: ['doğal'] },
    urgency: 'Yüksek',
    ai: ['US Abdomen (graded compression)', 'Kontrastsız (US)', 'Acil (<1 saat)', 'MR Abdomen kontrastsız', 'Gebelikte radyasyon içermeyen modalite önceliklidir; US tanısız kalırsa kontrastsız MR düşünülür.'],
    labs: ['leukocyte', 'crp', 'beta_hcg'],
  }),
  T({
    topic: 'Kolesistit / sağ üst kadran ağrısı',
    phase: 1,
    weight: 9,
    category: 'abdomen',
    genders: ['Kadın', 'Erkek'],
    age: [18, 85],
    duration: 'shortDays',
    onset: ['yemek sonrası artan', 'yavaş başlayan'],
    complaintBases: ['sağ üst kadran ağrısı', 'yemek sonrası artan üst karın ağrısı', 'ateşle birlikte sağ üst kadran hassasiyeti'],
    symptoms: ['bulantı', 'kusma', 'ateş', 'sarılık olabilir', 'yemekle artma'],
    exam: { neurological: ['doğal'], abdomen: ['Murphy bulgusu (+)', 'sağ üst kadran hassasiyeti'], extremity: ['doğal'], cardiopulmonary: ['doğal'] },
    urgency: 'Yüksek',
    ai: ['US Abdomen', 'Kontrastsız (US)', 'Acil (<1 saat)', 'BT Abdomen-Pelvis kontrastlı', 'Kolesistit veya biliyer patolojide ilk basamak safra kesesi ultrasonografisidir.'],
    labs: ['leukocyte', 'crp', 'bilirubin'],
  }),
  T({
    topic: 'Divertikülit şüphesi',
    phase: 1,
    weight: 8,
    category: 'abdomen',
    genders: ['Kadın', 'Erkek'],
    age: [35, 90],
    duration: 'shortDays',
    onset: ['yavaş başlayan', 'giderek artan'],
    complaintBases: ['sol alt kadran ağrısı', 'ateşle birlikte sol alt karın ağrısı', 'dışkılama değişikliğiyle sol alt kadran ağrısı'],
    symptoms: ['ateş', 'bulantı', 'kabızlık', 'lökositoz', 'lokal defans'],
    exam: { neurological: ['doğal'], abdomen: ['sol alt kadran hassasiyeti', 'lokal defans olabilir'], extremity: ['doğal'], cardiopulmonary: ['doğal'] },
    urgency: 'Yüksek',
    ai: ['BT Abdomen-Pelvis kontrastlı', 'IV kontrastlı', 'Yarı-acil (<24 saat)', 'US Abdomen', 'Divertikülit ve komplikasyon değerlendirmesinde kontrastlı BT yararlıdır.'],
    labs: ['leukocyte', 'crp', 'creatinine'],
  }),
  T({
    topic: 'Akut pankreatit komplikasyon şüphesi',
    phase: 1,
    weight: 7,
    category: 'abdomen',
    genders: ['Kadın', 'Erkek'],
    age: [25, 88],
    duration: 'shortDays',
    onset: ['ani başlayan', 'giderek artan'],
    complaintBases: ['sırta vuran epigastrik ağrı', 'şiddetli üst karın ağrısı', 'pankreatit tanısıyla kötüleşme'],
    symptoms: ['bulantı', 'kusma', 'lipaz yüksekliği', 'ateş', 'alkol veya safra taşı öyküsü'],
    exam: { neurological: ['doğal'], abdomen: ['epigastrik hassasiyet', 'defans olabilir'], extremity: ['doğal'], cardiopulmonary: ['doğal'] },
    urgency: 'Yüksek',
    ai: ['BT Abdomen-Pelvis kontrastlı', 'IV kontrastlı', 'Yarı-acil (<24 saat)', 'MR Abdomen kontrastlı', 'Komplikasyon veya ağır pankreatit şüphesinde kontrastlı BT evreleme sağlar.'],
    labs: ['lipase', 'crp', 'creatinine'],
  }),
  T({
    topic: 'Nonlokalize akut karın ağrısı',
    phase: 1,
    weight: 8,
    category: 'abdomen',
    genders: ['Kadın', 'Erkek'],
    age: [45, 95],
    duration: 'sameDay',
    onset: ['belirsiz başlangıçlı', 'giderek artan'],
    complaintBases: ['yaygın karın ağrısı', 'lokalize edilemeyen akut karın ağrısı', 'genel durum bozukluğuyla karın ağrısı'],
    symptoms: ['bulantı', 'iştahsızlık', 'ateş olabilir', 'defans şüpheli', 'lökositoz'],
    exam: { neurological: ['doğal veya hafif konfüze'], abdomen: ['yaygın hassasiyet', 'peritonit bulgusu net değil'], extremity: ['doğal'], cardiopulmonary: ['taşikardi olabilir'] },
    urgency: 'Yüksek',
    ai: ['BT Abdomen-Pelvis kontrastlı', 'IV kontrastlı', 'Acil (<1 saat)', 'US Abdomen veya X-Ray Toraks', 'Yaşlı veya belirsiz akut batın tablosunda kontrastlı BT tanısal kapsam sağlar.'],
    labs: ['leukocyte', 'crp', 'creatinine', 'lactate'],
  }),
  T({
    topic: 'İnce barsak obstrüksiyonu',
    phase: 1,
    weight: 6,
    category: 'abdomen',
    genders: ['Kadın', 'Erkek'],
    age: [25, 90],
    duration: 'shortDays',
    onset: ['ataklar halinde başlayan', 'giderek artan'],
    complaintBases: ['kramp tarzında karın ağrısı ve kusma', 'gaz-gaita çıkaramama', 'geçirilmiş operasyon sonrası karın şişliği'],
    symptoms: ['kusma', 'karında distansiyon', 'gaz-gaita çıkaramama', 'kolik ağrı', 'geçirilmiş operasyon'],
    exam: { neurological: ['doğal'], abdomen: ['distansiyon, barsak sesleri artmış', 'yaygın hassasiyet'], extremity: ['doğal'], cardiopulmonary: ['doğal'] },
    urgency: 'Yüksek',
    ai: ['BT Abdomen-Pelvis kontrastlı', 'IV kontrastlı', 'Yarı-acil (<24 saat)', 'X-Ray Toraks', 'Barsak obstrüksiyonu ve komplikasyon değerlendirmesinde BT uygun ilk ileri tetkiktir.'],
    labs: ['creatinine', 'leukocyte'],
  }),
  T({
    topic: 'Mezenterik iskemi şüphesi',
    phase: 3,
    weight: 6,
    category: 'abdomen_vascular',
    genders: ['Kadın', 'Erkek'],
    age: [55, 92],
    duration: 'acuteHours',
    onset: ['ani başlangıçlı', 'muayeneyle uyumsuz şiddette'],
    complaintBases: ['muayeneye göre orantısız karın ağrısı', 'atrial fibrilasyon öyküsüyle ani karın ağrısı', 'şiddetli yaygın karın ağrısı'],
    symptoms: ['bulantı', 'kusma', 'laktat yüksekliği', 'kanlı dışkı olabilir', 'AF öyküsü'],
    exam: { neurological: ['doğal veya konfüze'], abdomen: ['erken dönemde defans az, ağrı belirgin', 'yaygın hassasiyet'], extremity: ['doğal'], cardiopulmonary: ['ritim düzensizliği olabilir'] },
    urgency: 'Kritik',
    ai: ['BTA Abdomen-Pelvis', 'IV kontrastlı', 'Acil (<1 saat)', 'Konvansiyonel Anjiyografi', 'Mezenterik iskemi şüphesinde arteriyel vasküler değerlendirme acildir.'],
    labs: ['lactate', 'creatinine', 'leukocyte'],
  }),
  T({
    topic: 'Üst GİS kanama / aktif kanama şüphesi',
    phase: 3,
    weight: 4,
    category: 'abdomen_bleed',
    genders: ['Kadın', 'Erkek'],
    age: [35, 92],
    duration: 'sameDay',
    onset: ['ani gelişen', 'son saatlerde tekrarlayan'],
    complaintBases: ['hematemez ve melena', 'tansiyon düşüklüğüyle siyah dışkılama', 'aktif gastrointestinal kanama şüphesi'],
    symptoms: ['melena', 'hematemez', 'baş dönmesi', 'soğuk terleme', 'antikoagülan kullanımı'],
    exam: { neurological: ['halsiz, oryante'], abdomen: ['epigastrik hassasiyet olabilir'], extremity: ['soğuk ekstremiteler olabilir'], cardiopulmonary: ['taşikardi'] },
    urgency: 'Kritik',
    ai: ['BTA Abdomen-Pelvis', 'IV kontrastlı', 'Acil (<1 saat)', 'Konvansiyonel Anjiyografi', 'Aktif kanama odağı araştırmasında kontrastlı anjiyografik BT uygun olabilir.'],
    labs: ['hemoglobin', 'creatinine', 'inr'],
  }),
  T({
    topic: 'Sepsis - enfeksiyon odağı',
    phase: 3,
    weight: 7,
    category: 'sepsis',
    genders: ['Kadın', 'Erkek'],
    age: [18, 95],
    duration: 'shortDays',
    onset: ['giderek kötüleşen', 'ateş sonrası belirginleşen'],
    complaintBases: ['ateş ve genel durum bozukluğu', 'sepsis şüphesiyle odak araştırması', 'hipotansiyon ve enfeksiyon bulguları'],
    symptoms: ['ateş', 'taşikardi', 'hipotansiyon', 'lökositoz', 'konfüzyon olabilir'],
    exam: { neurological: ['konfüzyon olabilir'], abdomen: ['odağa göre hassasiyet olabilir'], extremity: ['doğal'], cardiopulmonary: ['taşikardi, takipne'] },
    urgency: 'Kritik',
    ai: ['BT Abdomen-Pelvis kontrastlı', 'IV kontrastlı', 'Acil (<1 saat)', 'US Abdomen veya X-Ray Toraks', 'Sepsiste odak araştırması klinik şüpheye göre hızlı görüntüleme gerektirir.'],
    labs: ['leukocyte', 'crp', 'lactate', 'creatinine'],
  }),
  T({
    topic: 'Obstrüktif sarılık',
    phase: 2,
    weight: 4,
    category: 'abdomen',
    genders: ['Kadın', 'Erkek'],
    age: [35, 90],
    duration: 'subacute',
    onset: ['yavaş gelişen', 'son günlerde fark edilen'],
    complaintBases: ['sarılık ve sağ üst kadran rahatsızlığı', 'koyu idrar ve sararma', 'kaşıntıyla birlikte sarılık'],
    symptoms: ['kaşıntı', 'koyu idrar', 'iştahsızlık', 'sağ üst kadran ağrısı olabilir'],
    exam: { neurological: ['doğal'], abdomen: ['sağ üst kadran hassasiyeti hafif', 'hepatomegali olabilir'], extremity: ['doğal'], cardiopulmonary: ['doğal'] },
    urgency: 'Orta',
    ai: ['US Abdomen', 'Kontrastsız (US)', 'Yarı-acil (<24 saat)', 'MR Abdomen kontrastlı', 'Sarılıkta biliyer dilatasyon ve safra yolu patolojisi için ilk basamak US uygundur.'],
    labs: ['bilirubin', 'crp'],
  }),
  T({
    topic: 'Renal kolik',
    phase: 2,
    weight: 10,
    category: 'uro',
    genders: ['Kadın', 'Erkek'],
    age: [16, 80],
    duration: 'acuteHours',
    onset: ['ani başlangıçlı', 'ataklar halinde başlayan'],
    complaintBases: ['kasığa vuran yan ağrısı', 'kolik tarzda flank ağrısı', 'hematüriyle birlikte yan ağrısı'],
    symptoms: ['hematüri', 'bulantı', 'kusma', 'huzursuzluk', 'kostovertebral hassasiyet'],
    exam: { neurological: ['doğal'], abdomen: ['defans yok', 'kostovertebral açı hassasiyeti'], extremity: ['doğal'], cardiopulmonary: ['doğal'] },
    urgency: 'Orta',
    ai: ['BT Abdomen-Pelvis kontrastsız', 'Kontrastsız', 'Yarı-acil (<24 saat)', 'US Abdomen', 'Üriner taş şüphesinde kontrastsız BT taş saptamada yüksek duyarlılığa sahiptir.'],
    labs: ['urinalysis', 'creatinine'],
  }),
  T({
    topic: 'Komplike piyelonefrit',
    phase: 2,
    weight: 5,
    category: 'uro',
    genders: ['Kadın', 'Erkek'],
    age: [18, 88],
    duration: 'shortDays',
    onset: ['ateş sonrası gelişen', 'giderek artan'],
    complaintBases: ['ateş ve yan ağrısı', 'titremeyle birlikte flank ağrısı', 'üriner enfeksiyon tedavisine rağmen kötüleşme'],
    symptoms: ['ateş', 'dizüri', 'bulantı', 'kostovertebral hassasiyet', 'lökositoz'],
    exam: { neurological: ['doğal veya halsiz'], abdomen: ['kostovertebral açı hassasiyeti'], extremity: ['doğal'], cardiopulmonary: ['taşikardi olabilir'] },
    urgency: 'Yüksek',
    ai: ['BT Abdomen-Pelvis kontrastlı', 'IV kontrastlı', 'Yarı-acil (<24 saat)', 'US Abdomen', 'Komplike piyelonefritte obstrüksiyon, apse veya komplikasyon BT ile değerlendirilebilir.'],
    labs: ['leukocyte', 'crp', 'creatinine', 'urinalysis'],
  }),
  T({
    topic: 'Akut skrotal ağrı',
    phase: 2,
    weight: 6,
    category: 'uro',
    genders: ['Erkek'],
    age: [1, 45],
    duration: 'acuteHours',
    onset: ['ani başlangıçlı', 'uykudan uyandıran'],
    complaintBases: ['tek taraflı skrotal ağrı', 'testiste şiddetli ağrı ve şişlik', 'ani başlayan kasık ve testis ağrısı'],
    symptoms: ['bulantı', 'skrotal şişlik', 'hassasiyet', 'ateş olabilir', 'kremaster refleksi azalmış'],
    exam: { neurological: ['doğal'], abdomen: ['doğal'], extremity: ['doğal'], cardiopulmonary: ['doğal'], other: ['testiste yüksek yerleşim veya belirgin hassasiyet'] },
    urgency: 'Kritik',
    ai: ['US Doppler Skrotal', 'Kontrastsız (US)', 'Acil (<1 saat)', 'Cerrahi eksplorasyon klinik olarak gerekebilir', 'Torsiyon şüphesinde doppler US kan akımını hızla değerlendirir.'],
    labs: [],
  }),
  T({
    topic: 'Akut pelvik ağrı - üreme çağı',
    phase: 2,
    weight: 8,
    category: 'gyn',
    genders: ['Kadın'],
    age: [13, 50],
    duration: 'pregnancy',
    onset: ['ani başlangıçlı', 'tek taraflı başlayan'],
    complaintBases: ['tek taraflı pelvik ağrı', 'alt karın ağrısı ve adet gecikmesi', 'ani pelvik ağrı'],
    symptoms: ['bulantı', 'vajinal kanama olabilir', 'beta-hCG sonucu bekleniyor', 'ateş olabilir', 'pelvik hassasiyet'],
    exam: { neurological: ['doğal'], abdomen: ['alt kadran hassasiyeti'], extremity: ['doğal'], cardiopulmonary: ['doğal'], other: ['pelvik hassasiyet'] },
    urgency: 'Yüksek',
    ai: ['US Pelvik (TV)', 'Kontrastsız (US)', 'Acil (<1 saat)', 'MR Abdomen kontrastsız', 'Ektopik gebelik veya over torsiyonu gibi acillerde ilk basamak pelvik US uygundur.'],
    labs: ['beta_hcg', 'leukocyte'],
  }),
  T({
    topic: 'İlk trimester vajinal kanama',
    phase: 2,
    weight: 7,
    category: 'ob',
    genders: ['Kadın'],
    age: [16, 45],
    pregnancy: ['Var - 1. trimester'],
    duration: 'pregnancy',
    onset: ['yavaş başlayan', 'kramp sonrası gelişen'],
    complaintBases: ['gebelikte vajinal kanama', 'alt karın ağrısı ve vajinal lekelenme', 'pozitif gebelik testiyle lekelenme'],
    symptoms: ['pelvik ağrı', 'baş dönmesi olabilir', 'beta-hCG pozitif', 'lekelenme', 'kramp'],
    exam: { neurological: ['doğal'], abdomen: ['suprapubik hassasiyet'], extremity: ['doğal'], cardiopulmonary: ['doğal'] },
    urgency: 'Yüksek',
    ai: ['US Pelvik (TV)', 'Kontrastsız (US)', 'Acil (<1 saat)', 'Seri beta-hCG ve klinik takip', 'İlk trimester kanamada intrauterin gebelik ve ektopik gebelik ayrımı için US gerekir.'],
    labs: ['beta_hcg', 'hemoglobin'],
  }),
  T({
    topic: 'Postpartum kanama',
    phase: 3,
    weight: 3,
    category: 'ob',
    genders: ['Kadın'],
    age: [18, 44],
    postpartum: true,
    duration: 'sameDay',
    onset: ['doğum sonrası gelişen', 'son saatlerde artan'],
    complaintBases: ['postpartum vajinal kanama', 'doğum sonrası hipotansiyon ve kanama', 'loşi artışı ve pelvik ağrı'],
    symptoms: ['baş dönmesi', 'pelvik ağrı', 'kanama artışı', 'halsizlik', 'taşikardi'],
    exam: { neurological: ['halsiz ama oryante'], abdomen: ['uterin hassasiyet olabilir'], extremity: ['soğukluk olabilir'], cardiopulmonary: ['taşikardi'] },
    urgency: 'Kritik',
    ai: ['US Pelvik (TV)', 'Kontrastsız (US)', 'Acil (<1 saat)', 'BTA Abdomen-Pelvis', 'Postpartum kanamada retained ürün, uterin patoloji veya aktif kanama için hızlı değerlendirme gerekir.'],
    labs: ['hemoglobin', 'creatinine'],
  }),
  T({
    topic: 'Akut spinal travma',
    phase: 1,
    weight: 7,
    category: 'msk_trauma',
    genders: ['Kadın', 'Erkek'],
    age: [12, 90],
    duration: 'trauma',
    onset: ['travma sonrası'],
    complaintBases: ['boyun orta hat hassasiyeti', 'yüksekten düşme sonrası bel ağrısı', 'kaza sonrası omurga ağrısı'],
    trauma: ['trafik kazası', 'yüksekten düşme', 'spor yaralanması', 'merdivenden düşme'],
    symptoms: ['uyuşma', 'güç kaybı olabilir', 'lokal hassasiyet', 'hareket kısıtlılığı', 'orta hat hassasiyeti'],
    exam: { neurological: ['duyu kusuru olabilir', 'motor defisit şüpheli', 'nörolojik muayene doğal'], abdomen: ['doğal'], extremity: ['hareket kısıtlılığı'], cardiopulmonary: ['doğal'] },
    urgency: 'Yüksek',
    ai: ['BT Servikal/Lomber Omurga', 'Kontrastsız', 'Acil (<1 saat)', 'MR Omurga', 'Travmada kemik yaralanma için BT, nörolojik defisit varsa MR tamamlayıcıdır.'],
    labs: ['creatinine'],
  }),
  T({
    topic: 'Kalça kırığı şüphesi',
    phase: 1,
    weight: 8,
    category: 'msk_trauma',
    genders: ['Kadın', 'Erkek'],
    age: [55, 95],
    duration: 'trauma',
    onset: ['travma sonrası'],
    complaintBases: ['düşme sonrası kalça ağrısı', 'kalça üzerine basamama', 'kasık ağrısı ve yük verememe'],
    trauma: ['basit düşme', 'merdivenden düşme', 'ev içi düşme'],
    symptoms: ['hareket kısıtlılığı', 'bacakta kısalık', 'dışa rotasyon', 'ekimoz', 'yük verememe'],
    exam: { neurological: ['doğal'], abdomen: ['doğal'], extremity: ['kalça hassasiyeti ve yük verememe', 'dışa rotasyon'], cardiopulmonary: ['doğal'] },
    urgency: 'Yüksek',
    ai: ['X-Ray Pelvis/Kalça', 'Uygulanamaz', 'Acil (<1 saat)', 'MR Kalça veya BT Kalça', 'Kalça kırığı şüphesinde ilk basamak direkt grafidir; negatifse ileri tetkik düşünülür.'],
    labs: [],
  }),
  T({
    topic: 'Ayak bileği travması',
    phase: 1,
    weight: 9,
    category: 'msk_trauma',
    genders: ['Kadın', 'Erkek'],
    age: [5, 80],
    duration: 'trauma',
    onset: ['travma sonrası'],
    complaintBases: ['ayak bileği burkulması', 'üzerine basamama ve ayak bileği şişliği', 'ters basma sonrası lateral malleol ağrısı'],
    trauma: ['spor yaralanması', 'ters basma', 'basit düşme'],
    symptoms: ['şişlik', 'ekimoz', 'malleol hassasiyeti', 'yük verememe', 'hareket kısıtlılığı'],
    exam: { neurological: ['doğal'], abdomen: ['doğal'], extremity: ['malleol hassasiyeti, şişlik', 'yük verememe'], cardiopulmonary: ['doğal'] },
    urgency: 'Orta',
    ai: ['X-Ray Ayak Bileği', 'Uygulanamaz', 'Yarı-acil (<24 saat)', 'BT Ayak Bileği veya MR', 'Ottawa kriterleri pozitifse kırık dışlamak için direkt grafi uygundur.'],
    labs: [],
  }),
  T({
    topic: 'El bileği / skafoid şüphesi',
    phase: 1,
    weight: 7,
    category: 'msk_trauma',
    genders: ['Kadın', 'Erkek'],
    age: [10, 75],
    duration: 'trauma',
    onset: ['travma sonrası'],
    complaintBases: ['el üzerine düşme sonrası el bileği ağrısı', 'anatomik enfiye çukurunda hassasiyet', 'kavrama gücü azalmış el bileği ağrısı'],
    trauma: ['el üzerine düşme', 'spor yaralanması', 'bisiklet kazası'],
    symptoms: ['lokal hassasiyet', 'şişlik', 'kavrama gücünde azalma', 'enfiye çukuru hassasiyeti'],
    exam: { neurological: ['doğal'], abdomen: ['doğal'], extremity: ['skafoid hassasiyeti', 'hareket kısıtlılığı'], cardiopulmonary: ['doğal'] },
    urgency: 'Orta',
    ai: ['X-Ray El Bileği', 'Uygulanamaz', 'Yarı-acil (<24 saat)', 'MR El Bileği veya BT', 'Skafoid kırığı şüphesinde ilk basamak grafi, negatifse MR/BT tamamlayıcıdır.'],
    labs: [],
  }),
  T({
    topic: 'Diz travması',
    phase: 1,
    weight: 6,
    category: 'msk_trauma',
    genders: ['Kadın', 'Erkek'],
    age: [12, 75],
    duration: 'trauma',
    onset: ['travma sonrası'],
    complaintBases: ['diz dönmesi sonrası şişlik', 'travma sonrası diz ağrısı', 'dizde kilitlenme ve yük verememe'],
    trauma: ['spor yaralanması', 'düşme', 'burkulma'],
    symptoms: ['şişlik', 'ekimoz', 'hareket kısıtlılığı', 'yük verememe', 'kilitlenme'],
    exam: { neurological: ['doğal'], abdomen: ['doğal'], extremity: ['diz effüzyonu ve hassasiyet', 'bağ yaralanması şüpheli'], cardiopulmonary: ['doğal'] },
    urgency: 'Orta',
    ai: ['X-Ray Ekstremite', 'Uygulanamaz', 'Yarı-acil (<24 saat)', 'MR', 'Akut diz travmasında kırık dışlamak için ilk basamak direkt grafidir; bağ/menisküs için MR planlanabilir.'],
    labs: [],
  }),
  T({
    topic: 'Omuz çıkığı / kırık şüphesi',
    phase: 1,
    weight: 5,
    category: 'msk_trauma',
    genders: ['Kadın', 'Erkek'],
    age: [12, 80],
    duration: 'trauma',
    onset: ['travma sonrası'],
    complaintBases: ['omuz travması sonrası hareket kısıtlılığı', 'omuzda deformite ve ağrı', 'düşme sonrası omuz ağrısı'],
    trauma: ['düşme', 'spor yaralanması', 'darp'],
    symptoms: ['hareket kısıtlılığı', 'deformite', 'lokal hassasiyet', 'kolunu kaldıramama'],
    exam: { neurological: ['duyu-motor distal doğal', 'aksiller sinir muayenesi izleniyor'], abdomen: ['doğal'], extremity: ['omuz deformitesi veya hassasiyet'], cardiopulmonary: ['doğal'] },
    urgency: 'Orta',
    ai: ['X-Ray Ekstremite', 'Uygulanamaz', 'Yarı-acil (<24 saat)', 'BT veya MR', 'Omuz travmasında çıkık/kırık değerlendirmesi için direkt grafi ilk basamaktır.'],
    labs: [],
  }),
  T({
    topic: 'Vertebra kompresyon kırığı şüphesi',
    phase: 2,
    weight: 4,
    category: 'msk',
    genders: ['Kadın', 'Erkek'],
    age: [60, 95],
    duration: 'severalDays',
    onset: ['hafif travma sonrası', 'giderek artan'],
    complaintBases: ['bel ağrısı ve yükseklik kaybı şüphesi', 'osteoporotik hastada sırt ağrısı', 'hafif düşme sonrası omurga ağrısı'],
    trauma: ['basit düşme', 'ağır kaldırma', 'travma yok veya minimal travma'],
    symptoms: ['lokal hassasiyet', 'hareketle artan ağrı', 'nörolojik defisit yok', 'osteoporoz öyküsü'],
    exam: { neurological: ['motor defisit yok', 'duyu doğal'], abdomen: ['doğal'], extremity: ['doğal'], cardiopulmonary: ['doğal'], other: ['vertebral orta hat hassasiyeti'] },
    urgency: 'Orta',
    ai: ['X-Ray Ekstremite', 'Uygulanamaz', 'Yarı-acil (<24 saat)', 'MR Omurga veya BT', 'Kompresyon kırığı şüphesinde ilk değerlendirme grafi ile yapılabilir; nörolojik bulguda MR gerekir.'],
    labs: [],
  }),
  T({
    topic: 'Pediatrik krup / stridor',
    phase: 2,
    weight: 5,
    category: 'pediatric',
    genders: ['Kadın', 'Erkek'],
    age: [1, 6],
    duration: 'shortDays',
    onset: ['gece artan', 'viral prodrom sonrası'],
    complaintBases: ['havlar tarzda öksürük', 'çocukta stridor ve öksürük', 'nefes alırken ses gelmesi'],
    symptoms: ['stridor', 'ateş', 'öksürük', 'çekilme olabilir', 'ses kısıklığı'],
    exam: { neurological: ['doğal'], abdomen: ['doğal'], extremity: ['doğal'], cardiopulmonary: ['inspiratuar stridor, hafif çekilme'] },
    urgency: 'Yüksek',
    ai: ['Tetkik gerekmez', 'Uygulanamaz', 'Acil (<1 saat)', 'X-Ray Boyun/Yumuşak Doku', 'Tipik krup klinik tanıdır; atipik veya yabancı cisim şüphesinde görüntüleme düşünülür.'],
    labs: [],
  }),
  T({
    topic: 'Yüz travması / maksillofasiyal kırık',
    phase: 1,
    weight: 5,
    category: 'neuro_trauma',
    genders: ['Kadın', 'Erkek'],
    age: [12, 80],
    duration: 'trauma',
    onset: ['travma sonrası', 'darp sonrası'],
    complaintBases: ['yüz travması sonrası şişlik ve ağrı', 'çene hareketlerinde kısıtlılık', 'yüzde asimetri ve hassasiyet'],
    trauma: ['darp', 'trafik kazası', 'spor yaralanması', 'düşme'],
    symptoms: ['yüzde şişlik', 'lokal hassasiyet', 'çene hareketinde kısıtlılık', 'maloklüzyon şüphesi', 'periorbital ekimoz'],
    exam: { neurological: ['doğal', 'infraorbital sinir hipoestezisi olabilir'], abdomen: ['doğal'], extremity: ['doğal'], cardiopulmonary: ['doğal'], other: ['fasiyal asimetri, palpasyonda hassasiyet', 'periorbital ödem ve ekimoz'] },
    urgency: 'Orta',
    ai: ['BT Beyin kontrastsız', 'Kontrastsız', 'Acil (<1 saat)', 'Yüz BT (ince kesit)', 'Maksillofasiyal travmada kemik değerlendirme için yüz BT uygun ilk tetkiktir.'],
    labs: [],
  }),
  T({
    topic: 'Akut bilinç değişikliği / deliryum',
    phase: 2,
    weight: 6,
    category: 'neuro',
    genders: ['Kadın', 'Erkek'],
    age: [50, 92],
    duration: 'acuteHours',
    onset: ['ani gelişen', 'son saatlerde fark edilen'],
    complaintBases: ['ani gelişen bilinç bulanıklığı', 'son saatlerde konfüzyon', 'oryantasyon bozukluğu ve huzursuzluk'],
    symptoms: ['konfüzyon', 'ajitasyon', 'oryantasyon bozukluğu', 'halüsinasyon olabilir', 'ates olabilir'],
    exam: { neurological: ['konfüze, ajite', 'oryantasyon bozuk, koopere değil', 'GKS 12-13, konfüze'], abdomen: ['doğal'], extremity: ['doğal'], cardiopulmonary: ['doğal veya taşikardi'] },
    urgency: 'Yüksek',
    ai: ['BT Beyin kontrastsız', 'Kontrastsız', 'Acil (<1 saat)', 'MR Beyin (DWI dahil)', 'Akut bilinç değişikliğinde intrakraniyal nedenler kontrastsız BT ile öncelikle dışlanmalıdır.'],
    labs: ['glucose', 'sodium', 'creatinine'],
  }),
  T({
    topic: 'Sol üst kadran ağrısı / splenik patoloji',
    phase: 2,
    weight: 4,
    category: 'abdomen',
    genders: ['Kadın', 'Erkek'],
    age: [18, 75],
    duration: 'shortDays',
    onset: ['yavaş başlayan', 'giderek artan'],
    complaintBases: ['sol üst kadranda künt ağrı', 'sol kaburga altında dolgunluk hissi', 'yemek sonrası sol üst kadran ağrısı'],
    symptoms: ['sol üst kadran hassasiyeti', 'bulantı', 'iştahsızlık', 'sol omuza vuran ağrı', 'halsizlik'],
    exam: { neurological: ['doğal'], abdomen: ['sol üst kadran hassasiyeti', 'splenomegali olabilir'], extremity: ['doğal'], cardiopulmonary: ['doğal'] },
    urgency: 'Orta',
    ai: ['US Abdomen', 'Kontrastsız (US)', 'Yarı-acil (<24 saat)', 'BT Abdomen-Pelvis kontrastlı', 'Sol üst kadran ağrısında dalak ve sol böbrek patolojileri için US ilk basamaktır.'],
    labs: ['leukocyte', 'crp'],
  }),
  T({
    topic: 'Epigastrik ağrı / peptik ülser şüphesi',
    phase: 2,
    weight: 6,
    category: 'abdomen',
    genders: ['Kadın', 'Erkek'],
    age: [20, 80],
    duration: 'shortDays',
    onset: ['yemekle ilişkili', 'yavaş başlayan'],
    complaintBases: ['epigastrik yanma ve ağrı', 'açlıkla artan mide ağrısı', 'yemek sonrası epigastrik rahatsızlık'],
    symptoms: ['mide yanması', 'bulantı', 'geğirme', 'iştahsızlık', 'melena olabilir'],
    exam: { neurological: ['doğal'], abdomen: ['epigastrik hassasiyet', 'defans yok'], extremity: ['doğal'], cardiopulmonary: ['doğal'] },
    urgency: 'Orta',
    ai: ['Tetkik gerekmez', 'Uygulanamaz', 'Yarı-acil (<24 saat)', 'Üst GİS endoskopi', 'Komplike olmayan epigastrik ağrıda görüntüleme endikasyonu zayıftır; klinik takip uygundur.'],
    labs: ['hemoglobin'],
  }),
  T({
    topic: 'Hematüri / üriner sistem patolojisi',
    phase: 2,
    weight: 5,
    category: 'uro',
    genders: ['Kadın', 'Erkek'],
    age: [20, 85],
    duration: 'shortDays',
    onset: ['ani fark edilen', 'birkaç gündür devam eden'],
    complaintBases: ['idrarda kan görme', 'makroskopik hematüri', 'ağrısız hematüri'],
    symptoms: ['makroskopik kanama', 'dizüri olabilir', 'pelvik rahatsızlık', 'pıhtı gelmesi'],
    exam: { neurological: ['doğal'], abdomen: ['suprapubik hassasiyet olabilir'], extremity: ['doğal'], cardiopulmonary: ['doğal'] },
    urgency: 'Orta',
    ai: ['BT Abdomen-Pelvis kontrastsız', 'Kontrastsız', 'Yarı-acil (<24 saat)', 'US Abdomen', 'Ağrısız hematüride üriner sistem taşı ve tümör araştırması için kontrastsız BT uygun ilk tetkiktir.'],
    labs: ['urinalysis', 'creatinine'],
  }),
  T({
    topic: 'Postmenopozal akut pelvik ağrı',
    phase: 2,
    weight: 4,
    category: 'gyn',
    genders: ['Kadın'],
    age: [48, 70],
    duration: 'shortDays',
    onset: ['ani başlayan', 'giderek artan'],
    complaintBases: ['postmenopozal kadında pelvik ağrı', 'alt karın ağrısı ve dolgunluk', 'menopoz sonrası pelvik rahatsızlık'],
    symptoms: ['pelvik bası hissi', 'bulantı', 'vajinal kanama olabilir', 'bel ağrısı', 'sık idrara çıkma'],
    exam: { neurological: ['doğal'], abdomen: ['alt kadran hassasiyeti', 'pelvik kitle olabilir'], extremity: ['doğal'], cardiopulmonary: ['doğal'] },
    urgency: 'Orta',
    ai: ['US Pelvik (TV)', 'Kontrastsız (US)', 'Yarı-acil (<24 saat)', 'MR Abdomen kontrastlı', 'Postmenopozal pelvik ağrıda over patolojisi ve endometrial kalınlık için US ilk basamaktır.'],
    labs: ['leukocyte', 'crp'],
  }),
  T({
    topic: 'İleri trimester vajinal kanama',
    phase: 2,
    weight: 6,
    category: 'ob',
    genders: ['Kadın'],
    age: [18, 44],
    pregnancy: ['Var - 2. trimester', 'Var - 3. trimester'],
    duration: 'pregnancy',
    onset: ['ani başlayan', 'travma sonrası gelişen'],
    complaintBases: ['gebelikte vajinal kanama', 'ileri gebelikte kanama', 'son trimesterde lekelenme ve ağrı'],
    symptoms: ['vajinal kanama', 'pelvik ağrı', 'karında sertleşme', 'kontraksiyon olabilir', 'baş dönmesi'],
    exam: { neurological: ['doğal'], abdomen: ['uterin hassasiyet', 'kanama aktif'], extremity: ['doğal'], cardiopulmonary: ['taşikardi olabilir'] },
    urgency: 'Kritik',
    ai: ['US Pelvik (TV)', 'Kontrastsız (US)', 'Acil (<1 saat)', 'MR Abdomen kontrastsız', 'İleri trimester kanamada plasenta previa ve dekolman plasenta değerlendirmesi için acil US gerekir.'],
    labs: ['hemoglobin', 'beta_hcg'],
  }),
  T({
    topic: 'Akut ayak / metatars travması',
    phase: 1,
    weight: 6,
    category: 'msk_trauma',
    genders: ['Kadın', 'Erkek'],
    age: [10, 75],
    duration: 'trauma',
    onset: ['travma sonrası'],
    complaintBases: ['ayağa basamama ve ayak şişliği', 'parmak üzerine düşme sonrası ağrı', 'ayak sırtında travma sonrası hassasiyet'],
    trauma: ['düşme', 'spor yaralanması', 'trafik kazası', 'ağır cisim düşmesi'],
    symptoms: ['şişlik', 'ekimoz', 'yük verememe', 'lokal hassasiyet', 'deformite olabilir'],
    exam: { neurological: ['doğal'], abdomen: ['doğal'], extremity: ['metatars hassasiyeti, şişlik', 'ayak sırtında ödem ve ekimoz', 'ayak deformitesi'], cardiopulmonary: ['doğal'] },
    urgency: 'Orta',
    ai: ['X-Ray Ekstremite', 'Uygulanamaz', 'Yarı-acil (<24 saat)', 'BT Ayak', 'Ayak travmasında Ottawa kurallarına göre grafi; şüpheli durumda BT tamamlayıcıdır.'],
    labs: [],
  }),
  T({
    topic: 'Akut dirsek / önkol travması',
    phase: 1,
    weight: 5,
    category: 'msk_trauma',
    genders: ['Kadın', 'Erkek'],
    age: [4, 75],
    duration: 'trauma',
    onset: ['travma sonrası'],
    complaintBases: ['el üzerine düşme sonrası dirsek ağrısı', 'dirsekte şişlik ve hareket kısıtlılığı', 'önkol travması sonrası deformite'],
    trauma: ['düşme', 'spor yaralanması', 'el üzerine düşme', 'bisiklet kazası'],
    symptoms: ['şişlik', 'hareket kısıtlılığı', 'ekimoz', 'deformite şüphesi', 'lokal hassasiyet'],
    exam: { neurological: ['distal nörovasküler muayene doğal'], abdomen: ['doğal'], extremity: ['dirsekte şişlik ve hassasiyet', 'önkol deformitesi', 'hareket kısıtlılığı'], cardiopulmonary: ['doğal'] },
    urgency: 'Orta',
    ai: ['X-Ray Ekstremite', 'Uygulanamaz', 'Yarı-acil (<24 saat)', 'BT Dirsek', 'Dirsek/önkol travmasında öncelikle direkt grafi ile kırık/çıkık değerlendirmesi yapılır.'],
    labs: [],
  }),
  T({
    topic: 'Non-travmatik kalça ağrısı / AVN şüphesi',
    phase: 3,
    weight: 4,
    category: 'msk',
    genders: ['Kadın', 'Erkek'],
    age: [30, 80],
    duration: 'subacute',
    onset: ['sinsi başlangıçlı', 'giderek artan'],
    complaintBases: ['kalçada künt ağrı ve hareket kısıtlılığı', 'kasığa vuran kalça ağrısı', 'topallamayla birlikte kalça rahatsızlığı'],
    symptoms: ['hareketle artan ağrı', 'topallama', 'kalça ekleminde tutukluk', 'istirahatte azalan ağrı'],
    exam: { neurological: ['doğal'], abdomen: ['doğal'], extremity: ['kalça eklem hareket kısıtlılığı', 'antialjik yürüyüş'], cardiopulmonary: ['doğal'] },
    urgency: 'Orta',
    ai: ['X-Ray Pelvis/Kalça', 'Uygulanamaz', 'Yarı-acil (<24 saat)', 'MR Kalça', 'Non-travmatik kalça ağrısında ilk basamak grafi; AVN şüphesinde MR daha duyarlıdır.'],
    labs: [],
  }),
  T({
    topic: 'Non-travmatik omuz ağrısı / rotator manşet',
    phase: 3,
    weight: 5,
    category: 'msk',
    genders: ['Kadın', 'Erkek'],
    age: [35, 80],
    duration: 'shortDays',
    onset: ['sinsi başlangıçlı', 'zorlanma sonrası'],
    complaintBases: ['omuzda güç kaybı ve ağrı', 'kol kaldırmada zorlanma', 'gece artan omuz ağrısı'],
    symptoms: ['kol kaldıramama', 'gece ağrısı', 'aktif hareket kısıtlılığı', 'omuzda krepitasyon', 'kas güçsüzlüğü'],
    exam: { neurological: ['duyu-motor distal doğal'], abdomen: ['doğal'], extremity: ['omuz abdüksiyonunda kısıtlılık', 'impingement bulgusu (+), rotator manşet güçsüzlüğü'], cardiopulmonary: ['doğal'] },
    urgency: 'Orta',
    ai: ['X-Ray Ekstremite', 'Uygulanamaz', 'Yarı-acil (<24 saat)', 'MR Omuz', 'Rotator manşet patolojisinde direkt grafi ilk basamak; MR kesin tanı sağlar.'],
    labs: [],
  }),
  T({
    topic: 'Derin ven trombozu şüphesi',
    phase: 2,
    weight: 7,
    category: 'thorax',
    genders: ['Kadın', 'Erkek'],
    age: [30, 85],
    duration: 'shortDays',
    onset: ['giderek artan', 'son günlerde fark edilen'],
    complaintBases: ['tek bacakta şişlik ve ağrı', 'baldırda hassasiyet ve ödem', 'bacakta renk değişikliği ve ısı artışı'],
    symptoms: ['tek taraflı bacak şişliği', 'baldır hassasiyeti', 'ekstremitede ısı artışı', 'yürümekle artan ağrı'],
    exam: { neurological: ['doğal'], abdomen: ['doğal'], extremity: ['tek taraflı baldır ödemi, hassasiyet', 'Homans bulgusu (+), cilt sıcak'], cardiopulmonary: ['doğal'] },
    urgency: 'Yüksek',
    ai: ['US Doppler Alt Ekstremite', 'Kontrastsız (US)', 'Acil (<1 saat)', 'BTA Toraks', 'DVT şüphesinde venöz doppler US birincil tanı yöntemidir.'],
    labs: ['d_dimer'],
  }),
];

function weightedTemplate() {
  const total = templates.reduce((sum, item) => sum + item.weight, 0);
  let cursor = random() * total;
  for (const item of templates) {
    cursor -= item.weight;
    if (cursor <= 0) return item;
  }
  return templates[templates.length - 1];
}

function makeAge(template) {
  return template.age[0] + Math.floor(random() * (template.age[1] - template.age[0] + 1));
}

function makePregnancy(template, gender, age) {
  if (template.postpartum) return 'Postpartum';
  if (template.pregnancy) return pick(template.pregnancy);
  if (gender === 'Kadın' && age >= 13 && age <= 45 && chance(0.04)) {
    return pick(['Var - 1. trimester', 'Var - 2. trimester', 'Var - 3. trimester']);
  }
  return 'Yok';
}

function makeDuration(template) {
  return pick(durationProfiles[template.duration] || durationProfiles.sameDay);
}

function makeChiefComplaint(template, duration, onset, symptoms, usedComplaints) {
  const base = pick(template.complaintBases);
  const course = pick(courses);
  const durationSince = duration === 'hemen' ? 'travmadan hemen sonra'
    : duration === 'aynı gün' ? 'bugün içinde'
      : duration === 'bugün sabah' ? 'bugün sabah'
        : `${duration} süredir`;
  const durationStart = duration === 'hemen' ? 'travmadan hemen sonra başlayan'
    : duration === 'aynı gün' ? 'bugün başlayan'
      : duration === 'bugün sabah' ? 'bugün sabah başlayan'
        : `${duration} önce başlayan`;
  const durationWindow = duration === 'hemen' ? 'başvuru öncesinde'
    : duration === 'aynı gün' ? 'bugün içinde'
      : duration === 'bugün sabah' ? 'bugün sabah'
        : `${duration} içinde`;
  const style = pick([
    `${durationSince} ${base}`,
    `${durationStart} ${base}`,
    `${lower(onset)} ${base}`,
    `${base}; ${durationWindow} ${course}`,
    `${durationStart} ${base}; ${course}`,
    `${base} şikayeti ${durationWindow} ${course}`,
    `${lower(onset)} ${base}, ${durationSince}`,
    `${base} - ${durationWindow} fark edilen`,
  ]);
  let complaint = style;
  let attempts = 0;
  while (usedComplaints.has(complaint) && attempts < 15) {
    const tail = attempts % 3 === 0 ? pick(symptoms) : attempts % 3 === 1 ? pick(complaintTails) : `${pick(symptoms)} eşlik ediyor`;
    complaint = `${style}; ${tail}`;
    attempts += 1;
  }
  usedComplaints.add(complaint);
  return complaint;
}

function makeSymptoms(template) {
  const picked = pickSome(template.symptoms, Math.min(3, template.symptoms.length), Math.min(5, template.symptoms.length));
  return [...new Set(picked)].slice(0, 6);
}

function makeSpecialConditions(template, age, gender, pregnancy) {
  const contrastLikely = template.ai[1].includes('kontrast');
  return {
    pregnancy_status: pregnancy,
    renal_function: chance(age > 70 ? 0.14 : contrastLikely ? 0.08 : 0.04) ? 'Bozuk' : 'Normal',
    contrast_allergy: contrastLikely && chance(0.045) ? 'Var' : 'Yok',
    metal_implant: chance(age > 60 ? 0.09 : 0.025) ? pick(['Metal implant', 'Pacemaker']) : 'Yok',
    hemodynamic_status: template.urgency === 'Kritik' && chance(0.18) ? 'İnstabil' : 'Stabil',
  };
}

function makeVitals(template, age, special) {
  const critical = template.urgency === 'Kritik';
  const high = template.urgency === 'Yüksek';
  const topic = template.topic || '';
  const cat = template.category || '';
  const infection = cat === 'abdomen' || cat === 'sepsis' || cat === 'uro';

  let systolic, diastolic, temperature, spo2;
  let gcs = 15;

  // ─── Kan Basıncı ──────────────────────────────────────────────────────────
  if (topic.includes('aort') || topic.includes('baş ağrısı - SAK')) {
    systolic = 155 + Math.floor(random() * 45);
  } else if (topic.includes('sepsis') || topic.includes('kanama') || topic.includes('kanama') || topic.includes('Üst GİS')) {
    systolic = chance(0.6) ? 65 + Math.floor(random() * 35) : 80 + Math.floor(random() * 40);
  } else if (topic.includes('inme')) {
    systolic = 140 + Math.floor(random() * 55);
  } else if (critical && chance(0.25)) {
    systolic = 70 + Math.floor(random() * 30);
  } else if (critical) {
    systolic = 90 + Math.floor(random() * 50);
  } else if (high) {
    systolic = 105 + Math.floor(random() * 50);
  } else {
    systolic = 115 + Math.floor(random() * 35);
  }

  diastolic = Math.round(systolic * (0.50 + random() * 0.18));
  if (diastolic < 40) diastolic = 45 + Math.floor(random() * 15);
  if (diastolic > 110) diastolic = 85 + Math.floor(random() * 15);

  if (special.hemodynamic_status === 'İnstabil') {
    systolic = Math.min(systolic, 80 + Math.floor(random() * 18));
    diastolic = Math.round(systolic * (0.45 + random() * 0.10));
  }
  if (age > 70 && systolic < 150) {
    systolic += Math.floor(random() * 20);
  }

  // ─── Sıcaklık ──────────────────────────────────────────────────────────────
  if (cat === 'sepsis') {
    temperature = chance(0.55) ? 38.0 + random() * 2.0 : chance(0.3) ? 37.5 + random() * 0.8 : 35.2 + random() * 0.8;
  } else if (infection && chance(0.5)) {
    temperature = 37.5 + random() * 2.0;
  } else if ((cat === 'gyn' || cat === 'ob') && chance(0.2)) {
    temperature = 37.3 + random() * 1.5;
  } else if (critical && chance(0.15)) {
    temperature = chance(0.5) ? 38.0 + random() * 1.5 : 35.0 + random() * 0.8;
  } else {
    temperature = 36.0 + random() * 1.0;
  }

  // ─── Nabız (sıcaklıkla bağlantılı) ────────────────────────────────────────
  let pulse;
  let feverBoost = 0;
  if (temperature >= 39) feverBoost = 26 + Math.floor(random() * 14); // 26-40
  else if (temperature >= 38) feverBoost = 14 + Math.floor(random() * 16); // 14-30
  else if (temperature < 35.5) feverBoost = 18 + Math.floor(random() * 20); // 18-38 (hipotermi-sepsis)

  if (special.hemodynamic_status === 'İnstabil' || (critical && chance(0.35))) {
    pulse = 120 + Math.floor(random() * 35);
  } else if (topic.includes('sepsis') || topic.includes('kanama') || topic.includes('emboli') || topic.includes('aort')) {
    pulse = 100 + Math.floor(random() * 35);
  } else if (cat === 'sepsis' || cat === 'ob') {
    pulse = 100 + Math.floor(random() * 30);
  } else if (cat === 'neuro' && !critical && chance(0.15)) {
    pulse = 44 + Math.floor(random() * 14);
  } else if (critical) {
    pulse = 96 + Math.floor(random() * 28);
  } else if (high) {
    pulse = 80 + Math.floor(random() * 30);
  } else {
    pulse = 66 + Math.floor(random() * 24);
  }
  pulse = clamp(pulse + feverBoost, 40, 168);

  // ─── SpO2 ──────────────────────────────────────────────────────────────────
  if (topic.includes('dispne') || topic.includes('Pnömotoraks') || topic.includes('emboli') || cat === 'thorax') {
    spo2 = 82 + Math.floor(random() * 14);
  } else if (topic.includes('krup') || topic.includes('stridor')) {
    spo2 = 88 + Math.floor(random() * 10);
  } else if (cat === 'sepsis' && chance(0.3)) {
    spo2 = 86 + Math.floor(random() * 10);
  } else {
    spo2 = 93 + Math.floor(random() * 7);
  }

  // ─── GCS ───────────────────────────────────────────────────────────────────
  if (cat.includes('neuro') || cat === 'sepsis' || critical) {
    const gcsPool = critical ? [13, 14, 15, 15] : [14, 15, 15, 15];
    gcs = pick(gcsPool);
  }
  if (age < 5) gcs = pick([14, 15]);

  // ─── Pediatrik vital override (1 ay-17 yaş) ──────────────────────────────
  if (age < 18) {
    // Yaş grubuna göre normal aralıklar
    let hrMin, hrMax, bpSysMin, bpSysMax, bpDiaMin, bpDiaMax;
    if (age < 1) {
      hrMin = 120; hrMax = 160; bpSysMin = 70; bpSysMax = 90; bpDiaMin = 40; bpDiaMax = 60;
    } else if (age <= 3) {
      hrMin = 90; hrMax = 140; bpSysMin = 80; bpSysMax = 105; bpDiaMin = 45; bpDiaMax = 65;
    } else if (age <= 6) {
      hrMin = 80; hrMax = 120; bpSysMin = 85; bpSysMax = 110; bpDiaMin = 50; bpDiaMax = 70;
    } else if (age <= 12) {
      hrMin = 70; hrMax = 110; bpSysMin = 90; bpSysMax = 120; bpDiaMin = 55; bpDiaMax = 75;
    } else {
      hrMin = 60; hrMax = 100; bpSysMin = 100; bpSysMax = 130; bpDiaMin = 55; bpDiaMax = 85;
    }

    // Nabız (mevcut conditional'a sadık kal, ama pediatrik tavan/taban uygula)
    if (pulse < hrMin) pulse = hrMin + Math.floor(random() * 10);
    if (pulse > hrMax) pulse = hrMax - Math.floor(random() * 10);
    pulse = clamp(pulse, hrMin - 5, hrMax + 5);

    // Tansiyon (pediatrik aralığa çek)
    if (systolic < bpSysMin) systolic = bpSysMin + Math.floor(random() * 10);
    if (systolic > bpSysMax) systolic = bpSysMax - Math.floor(random() * 10);
    if (diastolic < bpDiaMin) diastolic = bpDiaMin + Math.floor(random() * 5);
    if (diastolic > bpDiaMax) diastolic = bpDiaMax - Math.floor(random() * 5);

    // Sıcaklık: çocuklarda ateş daha yüksek olabilir
    if (temperature >= 38) temperature += random() * 0.5;
  }
  // Süt çocuğu (<1 yaş) için özel GCS
  if (age < 1) gcs = pick(['15', '15', '14']);

  return {
    blood_pressure: `${Math.round(systolic)}/${Math.round(diastolic)} mmHg`,
    pulse: `${pulse}/dk`,
    temperature: `${temperature.toFixed(1)} C`,
    spo2: `${spo2}`,
    gcs: String(gcs),
  };
}

function makeLabs(template, special, gender, pregnancy, age, historyList) {
  const labs = {};
  const keys = new Set(template.labs || []);

  // Her vakada en az kreatinin + bir temel lab olsun
  if (template.ai[1].includes('kontrast') || (
    keys.size === 0 && chance(0.7)
  ) || chance(0.2)) keys.add('creatinine');

  // Fallback: template'de lab yoksa bile 1-2 rutin lab ekle
  if (keys.size === 0) {
    const fallbacks = ['hemoglobin', 'glucose', 'crp'];
    pickSome(fallbacks, 1, 2).forEach(k => keys.add(k));
  }

  if (pregnancy.startsWith('Var') || template.category === 'gyn' || template.category === 'ob') keys.add('beta_hcg');

  const critical = template.urgency === 'Kritik';
  const high = template.urgency === 'Yüksek';
  const cat = template.category || '';
  const inflammatory = ['abdomen', 'sepsis', 'uro'].includes(cat);

  // Antikoagülan kullanımı kontrolü (ilaç listesinden)
  const onAnticoagulant = (historyList || []).some(h => h === 'Atriyal fibrilasyon' || h === 'Koroner arter hastalığı');

  for (const key of keys) {
    if (key === 'leukocyte') {
      if (cat === 'sepsis') {
        labs.leukocyte = chance(0.15)
          ? `${(2000 + Math.floor(random() * 3500))}/uL`
          : `${(12000 + Math.floor(random() * 18000))}/uL`;
      } else if (inflammatory && (critical || high)) {
        labs.leukocyte = `${(12000 + Math.floor(random() * 15000))}/uL`;
      } else if (inflammatory) {
        labs.leukocyte = `${(8000 + Math.floor(random() * 10000))}/uL`;
      } else if (high) {
        labs.leukocyte = `${(6000 + Math.floor(random() * 8000))}/uL`;
      } else {
        labs.leukocyte = `${(4000 + Math.floor(random() * 6000))}/uL`;
      }
    }
    if (key === 'crp') {
      if (cat === 'sepsis' || (critical && inflammatory)) {
        labs.crp = `${(80 + Math.floor(random() * 220))} mg/L`;
      } else if (inflammatory && high) {
        labs.crp = `${(30 + Math.floor(random() * 150))} mg/L`;
      } else if (high) {
        labs.crp = `${(10 + Math.floor(random() * 70))} mg/L`;
      } else if (inflammatory) {
        labs.crp = `${(8 + Math.floor(random() * 60))} mg/L`;
      } else {
        labs.crp = `${(3 + Math.floor(random() * 15))} mg/L`;
      }
    }
    if (key === 'd_dimer') {
      const ageCutoff = age * 10;
      labs.d_dimer = `${(ageCutoff * 0.5 + Math.floor(random() * 5000))} ng/mL`;
    }
    if (key === 'creatinine') {
      if (special.renal_function === 'Bozuk') {
        labs.creatinine = `${(1.8 + random() * 2.7).toFixed(1)} mg/dL`;
      } else if (age > 70) {
        labs.creatinine = `${(0.8 + random() * 0.7).toFixed(1)} mg/dL`;
      } else if (age > 60) {
        labs.creatinine = `${(0.7 + random() * 0.5).toFixed(1)} mg/dL`;
      } else {
        labs.creatinine = `${(0.6 + random() * 0.5).toFixed(1)} mg/dL`;
      }
    }
    if (key === 'lipase') labs.lipase = `${(200 + Math.floor(random() * 2000))} U/L`;
    if (key === 'lactate') {
      labs.lactate = critical
        ? `${(3.0 + random() * 7.0).toFixed(1)} mmol/L`
        : high
          ? `${(1.5 + random() * 3.5).toFixed(1)} mmol/L`
          : `${(0.8 + random() * 1.2).toFixed(1)} mmol/L`;
    }
    if (key === 'hemoglobin') {
      if (template.topic.includes('kanama')) {
        const severity = chance(0.3) ? 'massive' : 'moderate';
        labs.hemoglobin = severity === 'massive'
          ? `${(5.5 + random() * 3.0).toFixed(1)} g/dL`
          : `${(7.5 + random() * 4.0).toFixed(1)} g/dL`;
      } else if (chance(0.08) && age > 65) {
        labs.hemoglobin = `${(9.5 + random() * 2.0).toFixed(1)} g/dL`;
      } else {
        const base = gender === 'Kadın' ? 11.5 : 13.0;
        const range = gender === 'Kadın' ? 3.5 : 4.0;
        labs.hemoglobin = `${(base + random() * range).toFixed(1)} g/dL`;
      }
    }
    if (key === 'bilirubin') {
      labs.bilirubin = template.topic.includes('obstrüktif')
        ? `${(3.5 + random() * 9.0).toFixed(1)} mg/dL`
        : `${(0.5 + random() * 2.0).toFixed(1)} mg/dL`;
    }
    if (key === 'beta_hcg') labs.beta_hcg = pregnancy.startsWith('Var') ? 'pozitif' : gender === 'Kadın' ? pick(['negatif', 'negatif', 'sonuç bekleniyor']) : 'uygulanamaz';
    if (key === 'troponin') labs.troponin = pick(['normal', 'normal', 'sınırda', '0.12 ng/mL', 'seri takip planlandı']);
    if (key === 'bnp') labs.bnp = `${(150 + Math.floor(random() * 1800))} pg/mL`;
    if (key === 'glucose') {
      if (chance(0.2) && (critical || high)) {
        labs.glucose = `${(140 + Math.floor(random() * 80))} mg/dL`;
      } else if (chance(0.25) && age > 50) {
        labs.glucose = `${(126 + Math.floor(random() * 150))} mg/dL`;
      } else {
        labs.glucose = `${(70 + Math.floor(random() * 55))} mg/dL`;
      }
    }
    if (key === 'sodium') labs.sodium = `${(128 + Math.floor(random() * 14))} mmol/L`;
    if (key === 'inr') {
      if (onAnticoagulant && chance(0.4)) {
        labs.inr = `${(2.0 + random() * 2.0).toFixed(1)} (antikoagülan)`;
      } else if (chance(0.1) && age > 65) {
        labs.inr = `${(1.5 + random() * 1.5).toFixed(1)} (antikoagülan)`;
      } else {
        labs.inr = `${(0.9 + random() * 0.5).toFixed(1)}`;
      }
    }
    if (key === 'urinalysis') labs.urinalysis = pick(['eritrosit (+++)', 'nitrit (+), lökosit (++)', 'mikroskopik hematüri (+)', 'dansite yüksek, pH 5.5']);
    if (key === 'pt_inr') labs.pt_inr = `${(0.9 + random() * 1.8).toFixed(1)}`;
  }

  // ─── Klinik duruma göre ekstra lab ekle ────────────────────────────────
  const extraLabs = [];
  const isInflamed = inflammatory || cat === 'thorax';
  const hbVal = labs.hemoglobin ? parseFloat(labs.hemoglobin) : null;

  // Sepsis/abdomen/thorax → prokalsitonin, troponin
  if (isInflamed && chance(0.25) && !labs.troponin) {
    const pctVal = critical ? (5 + random() * 25).toFixed(1) : (0.5 + random() * 4).toFixed(1);
    extraLabs.push(['procalcitonin', `${pctVal} ng/mL`]);
  }

  // İleri yaş + enfeksiyon → troponin (myokard hasarı riski)
  if (isInflamed && age > 65 && chance(0.2) && !labs.troponin) {
    const tnt = chance(0.6) ? '<0.01 ng/mL' : (0.015 + random() * 0.08).toFixed(3) + ' ng/mL';
    extraLabs.push(['troponin', tnt]);
  }

  // Karın ağrısı → LFT
  if ((cat === 'abdomen' || template.topic.includes('karın') || template.topic.includes('üst kadran')) && chance(0.2)) {
    const alt = 15 + Math.floor(random() * 50);
    const ast_ = 15 + Math.floor(random() * 40);
    extraLabs.push(['alt', `${alt} U/L`]);
    extraLabs.push(['ast', `${ast_} U/L`]);
    if (chance(0.4)) {
      const alp = 40 + Math.floor(random() * 120);
      extraLabs.push(['alp', `${alp} U/L`]);
    }
  }

  // Travma → INR, aPTT
  if (template.trauma && chance(0.3)) {
    if (!labs.inr) extraLabs.push(['inr', `${(0.9 + random() * 0.4).toFixed(1)}`]);
    extraLabs.push(['aptt', `${(22 + Math.floor(random() * 12))} sn`]);
  }

  // Antikoagülan kullanan → INR mutlaka
  if (onAnticoagulant && !labs.inr && chance(0.5)) {
    extraLabs.push(['inr', `${(2.0 + random() * 1.5).toFixed(1)}`]);
  }

  // Anemi → demir, ferritin, B12
  if (hbVal !== null && hbVal < 11 && chance(0.25)) {
    extraLabs.push(['ferritin', `${(15 + Math.floor(random() * 200))} ng/mL`]);
    extraLabs.push(['vitamin_b12', `${(150 + Math.floor(random() * 300))} pg/mL`]);
  }

  // Diyabet → HbA1c
  if ((historyList || []).some(h => h.includes('DM') || h.includes('diyabet') || h.includes('şeker')) && chance(0.35)) {
    extraLabs.push(['hba1c', `${(6.5 + random() * 3.0).toFixed(1)}%`]);
  }

  extraLabs.forEach(([k, v]) => { if (!(k in labs)) labs[k] = v; });

  // ─── Pediatrik lab override ────────────────────────────────────────────────
  if (age < 18 && !template.topic.includes('kanama')) {
    if (labs.hemoglobin) {
      const hbBase = age < 6 ? 10.0 : age < 12 ? 10.5 : age < 18 ? 11.0 : gender === 'Kadın' ? 11.5 : 13.0;
      const hbRange = age < 6 ? 3.0 : age < 12 ? 3.5 : age < 18 ? 4.0 : 0;
      if (labs.hemoglobin && parseFloat(labs.hemoglobin) < hbBase) {
        labs.hemoglobin = `${(hbBase + random() * hbRange).toFixed(1)} g/dL`;
      }
    }
    if (labs.creatinine) {
      const crMax = age < 1 ? 0.4 : age < 6 ? 0.5 : age < 12 ? 0.7 : 1.0;
      const crVal = parseFloat(labs.creatinine);
      if (crVal > crMax) labs.creatinine = `${(0.3 + random() * crMax).toFixed(1)} mg/dL`;
    }
    if (labs.leukocyte) {
      const wbcMin = age < 1 ? 6000 : age < 6 ? 5000 : age < 12 ? 4500 : 4000;
      const wbcMax = age < 1 ? 17000 : age < 6 ? 15000 : age < 12 ? 14000 : 12000;
      const wbcVal = parseInt(labs.leukocyte);
      const wbcAdjusted = clamp(wbcVal, wbcMin, wbcMax);
      if (wbcVal !== wbcAdjusted) labs.leukocyte = `${wbcAdjusted}/uL`;
    }
  }

  return labs;
}

function formatPregnancy(pregnancy, age, gender) {
  if (!pregnancy || pregnancy === 'Yok') {
    if (gender === 'Kadın' && age > 50) return 'Yok (postmenopozal)';
    return 'Yok';
  }
  if (pregnancy === 'Postpartum') return `Postpartum ${pick(['3. gün', '1. hafta', '10. gün'])}`;
  if (!pregnancy.startsWith('Var')) return pregnancy;
  const week = pregnancy.includes('1.') ? 6 + Math.floor(random() * 7)
    : pregnancy.includes('2.') ? 14 + Math.floor(random() * 13)
      : 28 + Math.floor(random() * 10);
  return `${pregnancy.replace('Var - ', 'EVET - ')} (${week} hafta)`;
}

const peExtra = {
  neuro: {
    cardiopulmonary: ['taşikardi yok, solunum doğal', 'taşipne yok, oksijen ihtiyacı yok', 'solunum sesleri doğal, ritim düzenli'],
    extremity: ['periferik nabızlar doğal', 'periferik siyanoz yok', 'kapiller dolum <2 sn'],
    other: ['pupil ışık refleksi bilateral +', 'göz dibi muayenesi doğal', 'pupiller izokorik'],
  },
  neuro_trauma: {
    cardiopulmonary: ['solunum paterni doğal', 'taşikardi yok', 'oksijen ihtiyacı yok'],
    extremity: ['periferik nabızlar palpable', 'kapiller dolum doğal', 'ekstremiteler ılık'],
    other: ['servikal orta hat hassasiyeti', 'skalp hematomu inspekte', 'kafa tabanı fraktür bulgusu yok'],
  },
  thorax: {
    cardiopulmonary: ['taşipne, solunum sesleri kaba', 'bazal ralleri mevcut', 'taşipne, taşikardi, oksijen ihtiyacı var', 'solunum sesleri bilateral kaba', 'sternal hassasiyet yok', 'solunum sesleri bilateral bazallerde azalmış'],
    extremity: ['periferik siyanoz mevcut', 'kapiller dolum >2 sn', 'ekstremiteler soğuk, nabız zayıf'],
    other: ['solunum sesleri eşit, yardımcı solunum kasları kullanılmıyor', 'trakea deviyasyonu yok', 'göğüs duvarı palpasyonda hassas'],
  },
  abdomen: {
    cardiopulmonary: ['taşikardi mevcut', 'solunum doğal, taşikardi yok', 'taşipne yok', 'solunum sesleri doğal'],
    extremity: ['ekstremiteler doğal', 'kapiller dolum doğal', 'ekstremiteler ılık, renk doğal'],
    other: ['rektal tuşede hassasiyet yok', 'gaitada gizli kan (+)', 'rektal tuşede gevşek hematokezya'],
  },
  msk_trauma: {
    cardiopulmonary: ['solunum doğal, ritim düzenli', 'taşikardi yok', 'oksijen ihtiyacı yok'],
    extremity: ['eklem hareket açıklığı kısıtlı', 'hedef eklemde instabilite yok', 'eklemde krepitasyon yok', 'ekstremite distal nabızlar palpable'],
    other: ['eklemde şişlik ve ısı artışı', 'palpasyonda krepitasyon yok', 'hedef eklemde effüzyon mevcut'],
  },
  msk: {
    cardiopulmonary: ['solunum doğal, ritim düzenli', 'taşikardi yok, oksijen ihtiyacı yok', 'taşipne yok'],
    extremity: ['eklem hareket açıklığı kısıtlı', 'etkilenen eklemde hassasiyet', 'antialjik yürüyüş', 'kas gücü etkilenen tarafta azalmış'],
    other: ['palpasyonda hassasiyet mevcut', 'eklem çevresinde atrofi yok'],
  },
  sepsis: {
    cardiopulmonary: ['taşikardi, takipne', 'taşipne, oksijen ihtiyacı var', 'taşikardi, hipotansiyon bulgusu var'],
    extremity: ['ekstremiteler soğuk, kapiller dolum >2 sn', 'periferik siyanoz mevcut', 'ekstremitelerde peteşi olabilir'],
    other: ['cilt döküntüsü mevcut', 'konjonktiva soluk', 'mukoz membranlar kuru'],
  },
  uro: {
    cardiopulmonary: ['solunum doğal, ritim düzenli', 'taşikardi yok', 'oksijen ihtiyacı yok'],
    extremity: ['periferik nabızlar doğal', 'ekstremiteler ılık', 'kapiller dolum doğal'],
    other: ['kostovertebral açı hassasiyeti', 'suprapubik hassasiyet', 'yan kadran hassasiyeti'],
  },
  gyn: {
    cardiopulmonary: ['solunum doğal, ritim düzenli', 'taşikardi yok', 'oksijen ihtiyacı yok'],
    extremity: ['periferik nabızlar doğal', 'ekstremiteler ılık', 'kapiller dolum doğal'],
    other: ['pelvik hassasiyet mevcut', 'servikal mobilite ağrılı', 'adneksiyal hassasiyet'],
  },
  ob: {
    cardiopulmonary: ['taşikardi olabilir', 'solunum doğal', 'oksijen ihtiyacı yok'],
    extremity: ['pretibial ödem mevcut', 'ekstremiteler ılık', 'kapiller dolum doğal'],
    other: ['uterin hassasiyet mevcut', 'kanama aktif inspekte', 'servikal os kapalı'],
  },
  pediatric: {
    cardiopulmonary: ['inspiratuar stridor, çekilme yok', 'solunum sesleri bilateral eşit', 'hafif takipne, stridor'],
    extremity: ['periferik nabızlar doğal', 'kapiller dolum <2 sn', 'ekstremiteler ılık'],
    other: ['çocuk huzursuz, koopere değil', 'oral mukoza kuru', 'cilt turgoru normal'],
  },
  abdomen_vascular: {
    cardiopulmonary: ['taşikardi mevcut', 'ritim düzensiz olabilir', 'taşipne var', 'hipotansiyon bulgusu var'],
    extremity: ['ekstremiteler soğuk, nabız zayıf', 'kapiller dolum >2 sn', 'periferik siyanoz'],
    other: ['rektal tuşede hematokezya', 'abdominal distansiyon belirgin', 'barsak sesleri yok/hipoaktif'],
  },
  abdmen_bleed: {
    cardiopulmonary: ['taşikardi belirgin', 'hipotansiyon bulgusu var', 'taşipne mevcut', 'solunum doğal'],
    extremity: ['ekstremiteler soğuk, kapiller dolum >2 sn', 'periferik siyanoz', 'nabız zayıf ip şeklinde'],
    other: ['rektal tuşede melena (+)', 'rektal tuşede taze kan', 'nazogastrik tüpte kan'],
  },
  thorax_low: {
    cardiopulmonary: ['göğüs duvarı hassas, solunum sesleri doğal', 'solunum sesleri doğal, ritim düzenli', 'taşikardi yok, solunum doğal'],
    extremity: ['periferik nabızlar doğal', 'ekstremiteler ılık', 'kapiller dolum <2 sn'],
    other: ['göğüs duvarı palpasyonda hassas', 'kostakondral hassasiyet (+)', 'sternumda hassasiyet yok'],
  },
  neuro_low: {
    cardiopulmonary: ['ritim düzenli, solunum doğal', 'taşikardi yok', 'oksijen ihtiyacı yok'],
    extremity: ['periferik nabızlar doğal', 'ekstremiteler ılık', 'kapiller dolum doğal'],
    other: ['ortostatik vital bulgu değişikliği yok', 'oda içi yürüme stabil'],
  },
};

function makePhysicalExam(template, age) {
  const neuroOptions = template.exam.neurological || ['doğal'];
  const abdoOptions = template.exam.abdomen || ['doğal'];
  const extOptions = template.exam.extremity || ['doğal'];
  const cardioOptions = template.exam.cardiopulmonary || ['doğal'];
  const otherOptions = template.exam.other || null;

  // Kategori bazında ekstra muayene bulguları ekle
  const extras = peExtra[template.category] || peExtra[template.category.split('_')[0]];
  const cardioMerged = extras?.cardiopulmonary
    ? [...new Set([...cardioOptions, ...extras.cardiopulmonary])]
    : cardioOptions;
  const extMerged = extras?.extremity
    ? [...new Set([...extOptions, ...extras.extremity])]
    : extOptions;
  const otherMerged = otherOptions
    ? otherOptions
    : (extras?.other || ['özellik yok']);

  return {
    neurological: pick(neuroOptions),
    abdomen: pick(abdoOptions),
    extremity: pick(extMerged),
    cardiopulmonary: pick(cardioMerged),
    other: pick(otherMerged),
  };
}

function formatExam(exam) {
  return [exam.neurological, exam.abdomen, exam.extremity, exam.cardiopulmonary, exam.other]
    .filter((item) => item && item !== 'doğal' && item !== 'özellik yok')
    .join(', ') || 'Belirgin patolojik bulgu yok';
}

function formatLabs(labs) {
  const labels = {
    leukocyte: 'Lökosit',
    crp: 'CRP',
    d_dimer: 'D-dimer',
    creatinine: 'Kreatinin',
    lipase: 'Lipaz',
    lactate: 'Laktat',
    hemoglobin: 'Hemoglobin',
    bilirubin: 'Bilirubin',
    beta_hcg: 'Beta-hCG',
    troponin: 'Troponin',
    bnp: 'BNP',
    glucose: 'Glukoz',
    sodium: 'Sodyum',
    inr: 'INR',
    urinalysis: 'İdrar',
  };
  return Object.entries(labs).map(([key, value]) => `${labels[key] || key}: ${value}`).join(', ');
}

function adjustAiForSafety(ai, template, special) {
  const next = [...ai];
  if (special.pregnancy_status.startsWith('Var') && next[0].startsWith('BT Abdomen')) {
    next[0] = template.category === 'gyn' || template.category === 'ob' ? 'US Pelvik (TV)' : 'US Abdomen';
    next[1] = 'Kontrastsız (US)';
    next[3] = 'MR Abdomen kontrastsız';
    next[4] = 'Gebelikte radyasyon içermeyen modalite önceliklidir; US yetersizse kontrastsız MR düşünülür.';
  }
  if ((special.renal_function === 'Bozuk' || special.contrast_allergy === 'Var') && next[1] === 'IV kontrastlı') {
    next[3] = next[3].includes('V/Q') || next[3].includes('US') ? next[3] : `${next[3]} veya kontrastsız alternatif`;
    next[4] = `${next[4]} Kontrast riski klinik aciliyetle birlikte değerlendirilmelidir.`;
  }
  if (special.hemodynamic_status === 'İnstabil' && next[0].startsWith('MR')) {
    next[3] = next[0];
    next[0] = 'BT Beyin kontrastsız';
    next[4] = `${next[4]} İnstabil hastada hızlı erişilebilir modalite önceliklidir.`;
  }
  return next;
}

function generateAiRationale(template, age, gender, vitals, labs, complaint, special, ai) {
  const pulse = parseInt(vitals.pulse);
  const temp = parseFloat(vitals.temperature);
  const bpSys = parseInt(vitals.blood_pressure);
  const hb = labs.hemoglobin ? parseFloat(labs.hemoglobin) : null;
  const wbc = labs.leukocyte ? parseInt(labs.leukocyte) : null;
  const cr = labs.creatinine ? parseFloat(labs.creatinine) : null;
  const crp = labs.crp ? parseInt(labs.crp) : null;
  const laktat = labs.lactate ? parseFloat(labs.lactate) : null;

  // Klinik bulgu profili
  const findings = [];
  if (temp > 38) findings.push(`ateş (${temp.toFixed(1)}°C)`);
  if (pulse > 100) findings.push(`taşikardi (${pulse}/dk)`);
  if (bpSys < 100) findings.push(`hipotansiyon (${bpSys} mmHg)`);
  if (wbc !== null && wbc > 11000) findings.push(`lökositoz (${wbc}/uL)`);
  if (crp !== null && crp > 50) findings.push(`CRP yüksekliği (${crp} mg/L)`);
  if (hb !== null && hb < 10) findings.push(`anemi (Hb ${hb} g/dL)`);
  if (cr !== null && cr > 1.3) findings.push(`kreatinin yüksekliği (${cr} mg/dL)`);
  if (laktat !== null && laktat > 2) findings.push(`laktat yüksekliği (${laktat} mmol/L)`);

  const bulguMetni = findings.length > 0
    ? `Hastada ${findings.join(', ')} saptanmıştır. `
    : '';

  const yasGrubu = age < 18 ? 'pediatrik' : age > 65 ? 'ileri yaş' : 'erişkin';
  const riskFaktorleri = [];
  if (special.renal_function === 'Bozuk') riskFaktorleri.push('renal fonksiyon bozukluğu');
  if (special.contrast_allergy === 'Var') riskFaktorleri.push('kontrast alerjisi');
  if (special.hemodynamic_status === 'İnstabil') riskFaktorleri.push('hemodinamik instabilite');
  if (special.pregnancy_status.startsWith('Var')) riskFaktorleri.push('gebelik');
  const riskMetni = riskFaktorleri.length > 0
    ? `Özel durum: ${riskFaktorleri.join(', ')}. `
    : '';

  // ACR uygunluk skoru simülasyonu
  const skor = pick([7, 8, 9, 9, 9, 10, 10]);
  const acrMetni = `ACR Appropriateness Criteria değerlendirmesinde ${skor}/10 uygunluk skoru ile ${ai[0]} ${ai[1].toLowerCase()} olarak önerilmektedir. `;

  // Alternatif gerekçesi
  const alternatif = ai[3] ? `Alternatif olarak ${ai[3]} düşünülebilir. ` : '';

  const yasVurgu = age > 70 ? 'İleri yaş hastada atipik prezentasyon olabileceği göz önünde bulundurulmalıdır. ' : '';

  return `${age} yaşında ${lower(gender)} hasta ${lower(complaint)} yakınmasıyla değerlendirilmiştir. ${bulguMetni}${riskMetni}${acrMetni}${alternatif}${yasVurgu}Klinik korelasyon önerilir.`;
}

function computeAiConfidence(template, age, vitals, labs) {
  const temp = parseFloat(vitals.temperature);
  const pulse = parseInt(vitals.pulse);
  const wbc = labs.leukocyte ? parseInt(labs.leukocyte) : null;
  const crp = labs.crp ? parseInt(labs.crp) : null;

  // Enfeksiyon topiclerinde WBC+CRP+ates varsa yuksek guven
  if (template.category === 'abdomen' || template.category === 'thorax' || template.category === 'sepsis') {
    if (temp > 37.5 && wbc !== null && wbc > 11000) return 'Yüksek';
    if (temp > 38 || (wbc !== null && wbc > 15000)) return 'Yüksek';
    if (temp > 37 || (crp !== null && crp > 50)) return 'Orta';
  }
  // Travma
  if (template.trauma) {
    if (age > 65 || pulse > 100) return 'Yüksek';
    return 'Orta';
  }
  // Vaskuler
  if (template.category === 'abdomen_vascular' || template.ai[0].includes('BTA')) {
    if (pulse > 100 || temp > 37.5) return 'Yüksek';
    return 'Orta';
  }
  return pick(['Yüksek', 'Yüksek', 'Yüksek', 'Orta']);
}

const usedComplaints = new Set();
const usedSignatures = new Set();

function makeCase(index) {
  let caseItem;
  let attempts = 0;
  do {
    const template = weightedTemplate();
    const gender = pick(template.genders);
    const age = makeAge(template);
    const pregnancy = makePregnancy(template, gender, age);
    const duration = makeDuration(template);
    const onset = pick(template.onset);
    const symptoms = makeSymptoms(template);
    const complaint = makeChiefComplaint(template, duration, onset, symptoms, usedComplaints);
    const special = makeSpecialConditions(template, age, gender, pregnancy);
    const vitals = makeVitals(template, age, special);
    const physicalExam = makePhysicalExam(template, age);
    const historyList = pickSome(histories, 1, 3);
    const labs = makeLabs(template, special, gender, pregnancy, age, historyList);

    // ─── Vital-lab fizyolojik bağlantı ────────────────────────────────────
    const pulseVal = parseInt(vitals.pulse);
    const bpSysVal = parseInt(vitals.blood_pressure);
    const tempVal = parseFloat(vitals.temperature);
    const spo2Val = parseInt(vitals.spo2);
    let adjPulse = pulseVal, adjSys = bpSysVal;

    const hb = labs.hemoglobin ? parseFloat(labs.hemoglobin) : null;
    const wbc = labs.leukocyte ? parseInt(labs.leukocyte) : null;
    const cr = labs.creatinine ? parseFloat(labs.creatinine) : null;
    const laktat = labs.lactate ? parseFloat(labs.lactate) : null;

    // Anemi → taşikardi (Hb < 9 ise nabız artar)
    if (hb !== null && hb < 9 && adjPulse < 90) adjPulse = Math.min(adjPulse + 15 + Math.floor(random() * 15), 140);

    // Anemi + hipotansiyon → ciddi taşikardi
    if (hb !== null && hb < 8 && adjSys < 100) adjPulse = Math.min(adjPulse + 10 + Math.floor(random() * 10), 150);

    // Enfeksiyon → ateş (WBC > 12k ve ateş yoksa)
    if (wbc !== null && wbc > 12000 && tempVal < 37.5) vitals.temperature = `${(37.5 + random() * 1.2).toFixed(1)} C`;

    // Dehidratasyon/AKI → hipotansiyon + taşikardi
    if (cr !== null && cr > 1.5 && adjSys > 95) adjSys = Math.max(adjSys - 10 - Math.floor(random() * 15), 75);
    if (cr !== null && cr > 1.5 && adjPulse < 100) adjPulse = Math.min(adjPulse + 10 + Math.floor(random() * 10), 130);

    // Sepsis → laktat + hipotansiyon + taşikardi
    if (laktat !== null && laktat > 3) {
      if (adjSys > 90) adjSys = Math.max(90 - Math.floor(random() * 15), 65);
      if (adjPulse < 100) adjPulse = Math.min(adjPulse + 15 + Math.floor(random() * 15), 150);
    }

    // Hipoksi → taşikardi
    if (spo2Val !== null && spo2Val < 90 && adjPulse < 100) adjPulse = Math.min(adjPulse + 10 + Math.floor(random() * 10), 140);

    // Sistol düştüyse diastolü de orantılı düşür (nabız basıncı <10 mmHg olmasın)
    const origDia = parseInt(vitals.blood_pressure.split('/')[1]);
    let adjDia = origDia;
    const pulsePressure = adjSys - adjDia;
    if (pulsePressure < 10) adjDia = Math.max(adjSys - 15, Math.round(adjSys * 0.55));
    if (adjDia >= adjSys) adjDia = Math.round(adjSys * 0.55);
    vitals.pulse = `${adjPulse}/dk`;
    vitals.blood_pressure = `${Math.round(adjSys)}/${Math.round(adjDia)} mmHg`;

    const ai = adjustAiForSafety(template.ai, template, special);
    const presentationTime = pick(presentationTimes);
    const traumaMechanism = template.trauma ? pick(template.trauma) : 'Yok';
    const summaryStart = duration === 'hemen' ? 'travmadan hemen sonra'
      : duration === 'aynı gün' ? 'bugün'
        : duration === 'bugün sabah' ? 'bugün sabah'
          : `${duration} önce`;
    const summaryTemplates = [
      () => `${age} yaşında ${lower(gender)} hasta ${pick(contexts)}. ${summaryStart} başlayan ${pick(severityWords)} ${lower(pick(template.complaintBases))} şikayeti mevcut. Yakınması ${pick(courses)}. ${pick(ordinaryDetails)}.`,
      () => `${age} yaş ${lower(gender)} hasta ${lower(presentationTime)} ${pick(contexts)}; ${summaryStart} ${lower(onset)} ${pick(severityWords)} ${lower(pick(template.complaintBases))} tarifliyor, ${pick(courses)}; ${pick(ordinaryDetails)}.`,
      () => `${age} yaşında ${lower(gender)} hasta, ${lower(presentationTime)} acil servise başvurdu. ${summaryStart} fark ettiği ${pick(severityWords)} yakınması ${pick(courses)}. ${pick(ordinaryDetails)}.`,
      () => `${lower(gender)} hasta, ${age} yaşında. ${lower(presentationTime)} acil servise ${pick(contexts)}. ${summaryStart} başlayan ${lower(pick(template.complaintBases))} şikayeti ${pick(courses)}. ${pick(ordinaryDetails)}.`,
      () => `${age} yaş ${lower(gender)} hasta, ${summaryStart} başlayan ${lower(pick(template.complaintBases))} yakınmasıyla ${lower(presentationTime)} acile başvurdu. Şikayeti ${pick(courses)}. ${pick(ordinaryDetails)}.`,
    ];
    const caseSummary = pick(summaryTemplates)();
    const labText = formatLabs(labs);
    const examText = formatExam(physicalExam);
    const signature = [
      template.topic,
      complaint,
      symptoms.join('|'),
      pregnancy,
      special.renal_function,
      special.contrast_allergy,
      special.hemodynamic_status,
      vitals.blood_pressure,
      vitals.pulse,
      vitals.temperature,
      vitals.spo2,
      examText,
      labText,
      ai[0],
    ].join(' || ');

    caseItem = {
      case_id: caseId(index),
      patient_age: age,
      patient_gender: gender,
      complaint,
      symptoms,
      urgency_level: template.urgency,
      demographics: {
        age,
        gender,
        age_group: ageGroup(age),
      },
      clinical_presentation: {
        chief_complaint: complaint,
        duration,
        onset,
        duration_onset: `${duration}, ${lower(onset)}`,
        additional_symptoms: symptoms,
        additional_symptoms_text: symptoms.join(', '),
        trauma_mechanism: traumaMechanism,
      },
      special_conditions: special,
      contraindications: { ...special },
      vitals,
      physical_exam: physicalExam,
      optional_context: {
        bmi: `${18 + Math.floor(random() * 17)}.${Math.floor(random() * 10)}`,
        triage_level: template.urgency === 'Kritik' ? pick(['ESI-1', 'ESI-2']) : template.urgency === 'Yüksek' ? pick(['ESI-2', 'ESI-3']) : pick(['ESI-3', 'ESI-4']),
        history: historyList,
        medications: medicationsForHistory(historyList, age),
        labs,
        claustrophobia: chance(0.035) ? 'Var' : 'Yok',
        presentation_time: presentationTime,
      },
      ai_suggestion: {
        imaging_choice: ai[0],
        primary_modality: ai[0],
        contrast_requirement: ai[1],
        contrast: ai[1],
        urgency: ai[2],
        triage: ai[2],
        alternative_modality: ai[3],
        rationale: generateAiRationale(template, age, gender, vitals, labs, complaint, special, ai),
        confidence: computeAiConfidence(template, age, vitals, labs),
      },
      display_fields: {
        age_gender: `${age} / ${gender}`,
        chief_complaint: complaint,
        duration_onset: `${duration}, ${lower(onset)}`,
        additional_symptoms: symptoms.join(', '),
        pregnancy: formatPregnancy(pregnancy, age, gender),
        renal_function: special.renal_function,
        contrast_allergy: special.contrast_allergy,
        metal_implant: special.metal_implant,
        hemodynamic_status: special.hemodynamic_status,
        blood_pressure_pulse: `${vitals.blood_pressure} / ${vitals.pulse}`,
        temperature_spo2: `${vitals.temperature} / ${vitals.spo2}`,
        gcs: vitals.gcs,
        physical_exam: examText,
        lab: labText,
        primary_recommendation: ai[0],
        contrast: ai[1],
        urgency: ai[2],
        alternative: ai[3],
        rationale: ai[4],
      },
      case_summary: caseSummary,
      clinical_signature: signature,
      source_topic: template.topic,
      scenario_variant: `${template.topic} / ${onset} / ${duration}`,
      phase: `Faz ${template.phase}`,
      status: 'bekliyor',
      doctor_a: doctorEmpty(),
      doctor_b: doctorEmpty(),
      consensus: null,
      final_decision: null,
      decision_set_entries: [],
      priority_consensus: false,
      history: [],
    };

    attempts += 1;
    if (!usedSignatures.has(signature)) {
      usedSignatures.add(signature);
      break;
    }
  } while (attempts < 20);

  return caseItem;
}

function backupIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(BACKUP_DIR, `${path.basename(filePath, '.json')}-${stamp}.json`);
  fs.copyFileSync(filePath, target);
  return target;
}

const cases = Array.from({ length: CASE_COUNT }, (_, index) => makeCase(index));
const sourceBackup = backupIfExists(OUT_SOURCE);
const serverBackup = backupIfExists(OUT_SERVER);

fs.mkdirSync(path.dirname(OUT_SOURCE), { recursive: true });
fs.mkdirSync(path.dirname(OUT_SERVER), { recursive: true });
fs.writeFileSync(OUT_SOURCE, `${JSON.stringify(cases, null, 2)}\n`, 'utf8');
fs.writeFileSync(OUT_SERVER, `${JSON.stringify(cases, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  generated: cases.length,
  source: OUT_SOURCE,
  server: OUT_SERVER,
  backups: {
    source: sourceBackup,
    server: serverBackup,
  },
}, null, 2));
