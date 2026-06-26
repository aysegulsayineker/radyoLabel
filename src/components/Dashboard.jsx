import React from 'react';

const Dashboard = ({ vakalar, rol, onSelect }) => {
  const reviewerKey = rol === 'A' ? 'doctor_a' : 'doctor_b';
  const filtrelenmis = vakalar.filter((vaka) => !vaka[reviewerKey]?.submitted_at);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
      {filtrelenmis.map((vaka) => (
        <div key={vaka.case_id} className="bg-white p-5 rounded-xl shadow-md border-l-4 border-blue-600">
          <h3 className="font-bold text-lg">{vaka.case_id}</h3>
          <p className="text-gray-500 text-sm mb-4 truncate">{vaka.complaint}</p>
          <button onClick={() => onSelect(vaka)} className="w-full bg-blue-50 text-blue-700 py-2 rounded-lg font-semibold">Görüntüle</button>
        </div>
      ))}
    </div>
  );
};

export default Dashboard;
