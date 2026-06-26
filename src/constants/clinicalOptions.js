export const IMAGING_OPTIONS = [
  'BT Beyin kontrastsız',
  'BT Beyin kontrastlı',
  'BTA Beyin',
  'MR Beyin (DWI dahil)',
  'MRA Beyin',
  'BT Travma protokolü',
  'BT Servikal/Lomber Omurga',
  'MR Omurga',
  'BT Toraks',
  'BTA Toraks',
  'BTA Abdomen-Pelvis',
  'BTA Toraks-Abdomen',
  'V/Q Sintigrafisi',
  'BT Abdomen-Pelvis kontrastlı',
  'BT Abdomen-Pelvis kontrastsız',
  'MR Abdomen kontrastsız',
  'MR Abdomen kontrastlı',
  'US Abdomen',
  'US Abdomen (graded compression)',
  'US Pelvik (TV)',
  'US Doppler Alt Ekstremite',
  'US Doppler Skrotal',
  'FAST US',
  'X-Ray Toraks',
  'X-Ray Ekstremite',
  'X-Ray Pelvis/Kalça',
  'X-Ray Ayak Bileği',
  'X-Ray El Bileği',
  'EKO (TTE)',
  'Tetkik gerekmez',
];

export const RATIONALE_GROUPS = [
  {
    label: 'Genel değerlendirme',
    options: [
      'AI gerekçesi aynen uygundur',
      'AI önerisi klinik tablo ile uyumsuzdur',
      'Ek klinik bilgi olmadan görüntüleme kararı verilemez',
      'Görüntüleme endikasyonu zayıf, klinik takip uygundur',
      'Klinik bulgular stabil, elektif görüntüleme planlanabilir',
      'Alternatif modalite klinik açıdan daha uygundur',
    ],
  },
  {
    label: 'Nörolojik aciller',
    options: [
      'Akut nörolojik defisit nedeniyle acil beyin görüntüleme endikedir',
      'Ani başlayan şiddetli baş ağrısında SAK dışlanmalıdır',
      'İnme protokolü kapsamında hızlı beyin görüntüleme gerekir',
      'Travma ve nörolojik bulgu birlikteliğinde kafa BT endikedir',
      'Spinal kord basısı şüphesinde MR önceliklidir',
      'İlk nöbet veya status epileptikus değerlendirmesi gerekir',
    ],
  },
  {
    label: 'Kardiyotorasik aciller',
    options: [
      'Pulmoner emboli şüphesinde kontrastlı toraks BT gerekir',
      'Akut göğüs ağrısında aortik patoloji dışlanmalıdır',
      'Dispne ve hipokside kardiyopulmoner acil ayırımı gerekir',
      'Travmada hemotoraks/pnömotoraks dışlanmalıdır',
      'Kardiyak kaynaklı dispne için önce yatak başı değerlendirme uygundur',
    ],
  },
  {
    label: 'Abdominal / GİS',
    options: [
      'Akut batın şüphesinde US veya BT değerlendirmesi uygundur',
      'Sağ alt kadran ağrısında apandisit dışlanmalıdır',
      'Akut pankreatit veya mezenterik iskemi şüphesi değerlendirilmelidir',
      'Üst GİS kanamasında aktif kanama araştırılmalıdır',
      'Sepsis odağı araştırması için görüntüleme endikedir',
    ],
  },
  {
    label: 'Ürolojik',
    options: [
      'Üriner sistem taşı şüphesinde kontrastsız BT endikedir',
      'Akut skrotal ağrıda testiküler torsiyon dışlanmalıdır',
      'Hematuri ve flank ağrısında ürologik patoloji değerlendirilmelidir',
    ],
  },
  {
    label: 'Jinekolojik / obstetrik',
    options: [
      'Gebelikte radyasyonsuz modalite önceliklidir',
      'Ektopik gebelik şüphesinde transvajinal US endikedir',
      'Pelvik ağrıda over patolojisi veya torsiyon dışlanmalıdır',
      'Gebelikte BT yalnızca zorunlu hallerde düşünülmelidir',
    ],
  },
  {
    label: 'Kas-iskelet / travma',
    options: [
      'Travma protokolü endikasyonu mevcuttur',
      'Kas-iskelet yaralanmasında önce direkt grafiler uygundur',
      'Ottawa kurallarına uygun ekstremite grafisi yeterlidir',
      'Vertebra kırığı şüphesinde uygun omurga görüntülemesi gerekir',
    ],
  },
  {
    label: 'Güvenlik ve kontrast',
    options: [
      'Radyasyonsuz modalite öncelikli olmalıdır',
      'Kontrast riski nedeniyle alternatif seçilmelidir',
      'Kontrast alerjisi nedeniyle kontrastsız protokol seçilmelidir',
      'Böbrek fonksiyonu bozukluğu nedeniyle kontrastsız görüntüleme uygundur',
      'Metal implant veya pacemaker nedeniyle MR yerine BT tercih edilmelidir',
      'Hemodinamik instabilite nedeniyle yatak başı görüntüleme önceliklidir',
      'Acil patoloji dışlama amacıyla ileri görüntüleme gerekir',
    ],
  },
];

export function buildRationaleOptionList(aiRationale) {
  const flat = RATIONALE_GROUPS.flatMap((group) => group.options);
  const options = [];
  if (aiRationale && !flat.includes(aiRationale)) {
    options.push(aiRationale);
  }
  flat.forEach((option) => {
    if (!options.includes(option)) options.push(option);
  });
  return options;
}
