import React from 'react';

const HastaDetayModal = ({ vaka, onClose, onKaydet, rol }) => {
  const [karar, setKarar] = React.useState(vaka.doctor_a?.imaging_choice || '');
  const [sebep, setSebep] = React.useState(vaka.doctor_a?.reasoning || '');

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-8 rounded-2xl w-full max-w-lg shadow-2xl">
        <h2 className="text-2xl font-bold mb-4">{vaka.case_id} Detayları</h2>
        <div className="mb-4 bg-gray-50 p-4 rounded-lg text-sm">
          <p><strong>Şikayet:</strong> {vaka.complaint}</p>
          <p><strong>Belirtiler:</strong> {vaka.symptoms.join(', ')}</p>
        </div>
        
        <div className="space-y-4">
          <input 
            value={karar} onChange={(e) => setKarar(e.target.value)}
            placeholder="Yönlendirme (örn: BT, MR)" className="w-full border p-3 rounded-lg"
          />
          <textarea 
            value={sebep} onChange={(e) => setSebep(e.target.value)}
            placeholder="Gerekçe..." className="w-full border p-3 rounded-lg h-24"
          />
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 bg-gray-200 py-2 rounded-lg">İptal</button>
            <button onClick={() => onKaydet(vaka.case_id, karar, sebep)} className="flex-1 bg-blue-600 text-white py-2 rounded-lg">Kaydet ve Gönder</button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default HastaDetayModal;