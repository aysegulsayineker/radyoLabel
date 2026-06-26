import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { RefreshCw, Search, Trash2, ArrowLeft, CheckSquare, Square, Info } from 'lucide-react';
import './TrackingDashboard.css';

export default function TrackingDashboard({ onBack, apiUrl }) {
  const [cases, setCases] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStage, setFilterStage] = useState('all');
  const [filterFlow, setFilterFlow] = useState('all');
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const casesPerPage = 50;

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`${apiUrl}/public/cases`)
      .then((response) => {
        if (!response.ok) throw new Error('Vakalar yüklenemedi.');
        return response.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setCases(data);
        }
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [apiUrl]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const caseInfos = useMemo(() => {
    return cases.map((vaka) => {
      const caseIndex = parseInt(vaka.case_id.replace('CASE-', '')) - 100001;
      const initialAssignee = caseIndex < 1000 ? 'A' : 'B';
      const initialAssigneeName = initialAssignee === 'A' ? 'Dr. Serdar Solak' : 'Dr. Ayşe Kaya';

      const docA = vaka.doctor_a || {};
      const docB = vaka.doctor_b || {};

      const aSubmitted = Boolean(docA.submitted_at);
      const bSubmitted = Boolean(docB.submitted_at);

      let stage = '';
      let stageKey = '';
      let flowHolder = '';
      let flowKey = '';
      let lastTime = '';

      if (aSubmitted && bSubmitted) {
        stage = 'Akış Bitti';
        stageKey = 'tamamlanan';
        flowHolder = 'Akış Tamamlandı';
        flowKey = 'completed';
        const timeA = new Date(docA.submitted_at).getTime();
        const timeB = new Date(docB.submitted_at).getTime();
        lastTime = new Date(Math.max(timeA, timeB)).toLocaleString('tr-TR');
      } else if (aSubmitted && !bSubmitted) {
        stage = 'Uzman Onayında (B\'de)';
        stageKey = 'diger_havuz';
        flowHolder = 'Dr. Ayşe Kaya';
        flowKey = 'B';
        lastTime = new Date(docA.submitted_at).toLocaleString('tr-TR');
      } else if (!aSubmitted && bSubmitted) {
        stage = 'Uzman Onayında (A\'da)';
        stageKey = 'diger_havuz';
        flowHolder = 'Dr. Serdar Solak';
        flowKey = 'A';
        lastTime = new Date(docB.submitted_at).toLocaleString('tr-TR');
      } else {
        stage = 'İlk Havuzunda';
        stageKey = 'islerim';
        flowHolder = initialAssigneeName;
        flowKey = initialAssignee;
        lastTime = '-';
      }

      const lastDecision = docA.imaging_choice || docB.imaging_choice || '-';

      return {
        ...vaka,
        stage,
        stageKey,
        flowHolder,
        flowKey,
        lastTime,
        lastDecision
      };
    });
  }, [cases]);

  const filteredCases = useMemo(() => {
    return caseInfos.filter((c) => {
      const matchesSearch =
        c.case_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.complaint.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStage = filterStage === 'all' || c.stageKey === filterStage;
      const matchesFlow = filterFlow === 'all' || c.flowKey === filterFlow;

      return matchesSearch && matchesStage && matchesFlow;
    });
  }, [caseInfos, searchQuery, filterStage, filterFlow]);

  const pagedCases = useMemo(() => {
    const start = currentPage * casesPerPage;
    return filteredCases.slice(start, start + casesPerPage);
  }, [filteredCases, currentPage]);

  const pageCount = Math.max(1, Math.ceil(filteredCases.length / casesPerPage));

  useEffect(() => {
    setCurrentPage(0);
  }, [searchQuery, filterStage, filterFlow]);

  const handleSelectCase = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllOnPage = () => {
    const allSelectedOnPage = pagedCases.every((c) => selectedIds.has(c.case_id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      pagedCases.forEach((c) => {
        if (allSelectedOnPage) {
          next.delete(c.case_id);
        } else {
          next.add(c.case_id);
        }
      });
      return next;
    });
  };

  const resetRequest = (payload) => {
    setLoading(true);
    fetch(`${apiUrl}/public/reset-cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Sıfırlama işlemi başarısız.');
        setSelectedIds(new Set());
        loadData();
      })
      .catch((err) => {
        alert(err.message);
        setLoading(false);
      });
  };

  const handleResetSelected = () => {
    if (selectedIds.size === 0) return;
    if (window.confirm(`Seçilen ${selectedIds.size} vakayı sıfırlamak (akışı başa almak) istediğinize emin misiniz?`)) {
      resetRequest({ case_ids: Array.from(selectedIds) });
    }
  };

  const handleResetSingle = (id) => {
    if (window.confirm(`${id} vakasını sıfırlamak (akışı başa almak) istediğinize emin misiniz?`)) {
      resetRequest({ case_ids: [id] });
    }
  };

  const handleResetAll = () => {
    if (window.confirm('DİKKAT: Tüm 2000 vakayı sıfırlamak ve akışları tamamen en başa almak istediğinize emin misiniz?')) {
      resetRequest({ reset_all: true });
    }
  };

  const allSelectedOnPage = pagedCases.length > 0 && pagedCases.every((c) => selectedIds.has(c.case_id));

  return (
    <div className="takip-dashboard">
      <header className="takip-header">
        <div className="takip-header-left">
          <button type="button" className="takip-back-btn" onClick={onBack}>
            <ArrowLeft size={16} />
            <span>Sisteme Dön</span>
          </button>
          <div>
            <h1>Radyoloji Konsensus Sistemi</h1>
            <p className="takip-subtitle">Vaka Akış Takip Paneli</p>
          </div>
        </div>
        <div className="takip-header-actions">
          <button type="button" className="takip-refresh-btn" onClick={loadData} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            <span>Yenile</span>
          </button>
          <button type="button" className="takip-reset-all-btn" onClick={handleResetAll} disabled={loading}>
            <Trash2 size={15} />
            <span>Tüm Vakaları Sıfırla</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="takip-error-banner">
          <Info size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="takip-filters">
        <div className="search-wrap">
          <Search size={16} />
          <input
            type="text"
            placeholder="Vaka ID veya Şikayet ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>
            Aşama
            <select value={filterStage} onChange={(e) => setFilterStage(e.target.value)}>
              <option value="all">Tümü</option>
              <option value="islerim">İlk Değerlendirme Havuzunda</option>
              <option value="diger_havuz">Uzman Onayında</option>
              <option value="tamamlanan">Akışı Bitenler</option>
            </select>
          </label>

          <label>
            Akış Sahibi
            <select value={filterFlow} onChange={(e) => setFilterFlow(e.target.value)}>
              <option value="all">Tümü</option>
              <option value="A">Dr. Serdar Solak'ta</option>
              <option value="B">Dr. Ayşe Kaya'da</option>
              <option value="completed">Akış Tamamlandı</option>
            </select>
          </label>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="takip-batch-actions">
          <CheckSquare size={16} />
          <span>{selectedIds.size} vaka seçildi.</span>
          <button type="button" className="batch-reset-btn" onClick={handleResetSelected}>
            Seçilenleri Sıfırla
          </button>
        </div>
      )}

      <div className="takip-table-container">
        <table className="takip-table">
          <thead>
            <tr>
              <th width="40">
                <button type="button" className="checkbox-btn" onClick={handleSelectAllOnPage}>
                  {allSelectedOnPage ? <CheckSquare size={18} /> : <Square size={18} />}
                </button>
              </th>
              <th width="120">Vaka ID</th>
              <th>Şikayet</th>
              <th width="150">Aşama</th>
              <th width="180">Akış Sahibi</th>
              <th width="160">Son Karar Detayı</th>
              <th width="180">Son Güncelleme</th>
              <th width="100">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" className="table-loading">
                  <span className="spinner" />
                  <span>Vakalar Yükleniyor...</span>
                </td>
              </tr>
            ) : pagedCases.length === 0 ? (
              <tr>
                <td colSpan="8" className="table-empty">
                  Aranan kriterlere uygun vaka bulunamadı.
                </td>
              </tr>
            ) : (
              pagedCases.map((c) => {
                const isSelected = selectedIds.has(c.case_id);
                return (
                  <tr key={c.case_id} className={isSelected ? 'selected' : ''}>
                    <td>
                      <button type="button" className="checkbox-btn" onClick={() => handleSelectCase(c.case_id)}>
                        {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                      </button>
                    </td>
                    <td><strong>{c.case_id}</strong></td>
                    <td className="complaint-cell" title={c.complaint}>
                      {c.complaint}
                    </td>
                    <td>
                      <span className={`stage-badge stage-${c.stageKey}`}>
                        {c.stage}
                      </span>
                    </td>
                    <td>
                      <span className="flow-holder-text">{c.flowHolder}</span>
                    </td>
                    <td>
                      <span className="decision-text">{c.lastDecision}</span>
                    </td>
                    <td>
                      <span className="time-text">{c.lastTime}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="row-reset-btn"
                        onClick={() => handleResetSingle(c.case_id)}
                        title="Vakayı Sıfırla (Akışı Başa Al)"
                      >
                        Sıfırla
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="takip-pager">
        <div className="takip-pager-info">
          Toplam <strong>{filteredCases.length}</strong> vakadan {filteredCases.length > 0 ? currentPage * casesPerPage + 1 : 0} - {Math.min((currentPage + 1) * casesPerPage, filteredCases.length)} arası gösteriliyor.
        </div>
        <div className="takip-pager-controls">
          <button type="button" onClick={() => setCurrentPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0}>
            Geri
          </button>
          <span>{currentPage + 1} / {pageCount}</span>
          <button type="button" onClick={() => setCurrentPage((p) => Math.min(pageCount - 1, p + 1))} disabled={currentPage >= pageCount - 1}>
            İleri
          </button>
        </div>
      </div>
    </div>
  );
}
