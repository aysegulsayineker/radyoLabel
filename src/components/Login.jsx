import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, AlertCircle, LogIn } from 'lucide-react';

export default function Login({ onLogin, apiUrl }) {
  const [doktorlar, setDoktorlar] = useState([]);
  const [secilenDoktorId, setSecilenDoktorId] = useState('');
  const [sifre, setSifre] = useState('');
  const [gosterSifre, setGosterSifre] = useState(false);
  const [hata, setHata] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(false);

  useEffect(() => {
    fetch(`${apiUrl}/doctors`)
      .then((response) => {
        if (!response.ok) throw new Error('Doktorlar yuklenemedi');
        return response.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setDoktorlar(data);
        }
      })
      .catch((err) => {
        console.warn('Doktor listesi sunucudan yuklenemedi, varsayilanlar kullaniliyor:', err);
        setDoktorlar([
          { id: 'doktor-01', ad: 'Dr. Serdar Solak' },
          { id: 'doktor-02', ad: 'Dr. Ayşe Kaya' },
        ]);
      });
  }, [apiUrl]);

  async function handleSubmit(event) {
    event.preventDefault();
    setHata(null);
    setYukleniyor(true);

    if (!secilenDoktorId) {
      setHata('Lütfen bir doktor seçiniz.');
      setYukleniyor(false);
      return;
    }

    if (!sifre.trim()) {
      setHata('Şifre boş bırakılamaz.');
      setYukleniyor(false);
      return;
    }

    const sifreGiris = sifre.trim();
    setSifre('');

    try {
      const response = await fetch(`${apiUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doktor_id: secilenDoktorId, sifre: sifreGiris }),
      });
      const data = await response.json();

      if (!response.ok) {
        setHata(data.error || 'Giriş başarısız oldu.');
        setYukleniyor(false);
        return;
      }

      sessionStorage.setItem('radyoloji-token', data.token);
      sessionStorage.setItem('radyoloji-doktor-id', data.doktor_id);
      sessionStorage.setItem('radyoloji-doktor-adi', data.doktor_adi);
      onLogin({ token: data.token, doktor_id: data.doktor_id, doktor_adi: data.doktor_adi });
    } catch {
      setHata('Sunucuya bağlanılamadı.');
      setYukleniyor(false);
    }
  }

  return (
    <div className="login-sayfa">
      <div className="login-kart">
        <div className="login-baslik">
          <Eye size={42} strokeWidth={1.8} />
          <h1>Acil Görüntüleme</h1>
          <p>Radyoloji Karar Destek Sistemi</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            Doktor Değerlendirici
            <select
              value={secilenDoktorId}
              onChange={(event) => setSecilenDoktorId(event.target.value)}
              className="login-select"
              disabled={yukleniyor}
              autoFocus
            >
              <option value="">Doktor Seçiniz</option>
              {doktorlar.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.ad}
                </option>
              ))}
            </select>
          </label>

          <label>
            Şifre
            <div className="sifre-kapsayici">
              <input
                type={gosterSifre ? 'text' : 'password'}
                value={sifre}
                onChange={(event) => setSifre(event.target.value)}
                placeholder="Şifrenizi giriniz"
              />
              <button
                type="button"
                className="sifre-goster-buton"
                onClick={() => setGosterSifre(!gosterSifre)}
                title={gosterSifre ? 'Şifreyi gizle' : 'Şifreyi göster'}
              >
                {gosterSifre ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          {hata && (
            <div className="login-hata">
              <AlertCircle size={16} />
              <span>{hata}</span>
            </div>
          )}

          <button
            type="submit"
            className="login-buton"
            disabled={yukleniyor}
          >
            {yukleniyor ? (
              <span className="login-donus" />
            ) : (
              <>
                <LogIn size={18} />
                <span>Giriş Yap</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
