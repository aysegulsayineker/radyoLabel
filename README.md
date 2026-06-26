# radyoLabel - Radyoloji Konsensus Tabanlı Yapay Zeka Veri Seti Oluşturma Platformu

Bu proje, iki uzman radyoloğun (Dr. Serdar Solak ve Dr. Ayşe Kaya) vaka kararlarını konsensus süzgecinden geçirerek, yapay zeka modellerinin eğitimi için yüksek doğruluğa sahip etiketlenmiş altın standart (gold standard) veri setleri oluşturulmasını sağlayan tam kapsamlı bir web uygulamasıdır.

## Özellikler

*   **2 Aşamalı Konsensus Akışı**: Bir vaka ancak iki uzman hekim tarafından onaylandığında akışı tamamlanmış kabul edilir. Kararlarda tutarsızlık olması halinde otomatik olarak süreç başa döner.
*   **Akış Geçmişi & Tarihçe**: Her vaka için kimin, hangi tarihte, ne karar verdiğini gösteren akış günlüğü.
*   **Takip ve Yönetim Paneli (`/takip`)**: 2000 vakanın tüm aşamalarını, akış sahiplerini ve kararlarını şifresiz, tek bir ekrandan izleme, filtreleme ve sıfırlama (tekli/toplu) imkanı.
*   **Milestone Backups**: Akışı tamamlanan her 100 vakada bir, `server/data/backups/` altında otomatik dosya yedeği oluşturma.
*   **Dynamic API Setup**: Localhost'ta port 4000 üzerinden, prodüksiyonda ise dinamik port ve HTTPS protokolüne uyumlu çalışma.

## Projeyi Yerel Ortamda Çalıştırma

### 1. `baslat.bat` ile Başlatma (Windows)
Windows ortamında tek tıklamayla çalıştırmak için proje ana dizinindeki `baslat.bat` dosyasına çift tıklamanız yeterlidir. Bu dosya hem veri servisini hem de React arayüzünü başlatacaktır.

### 2. Manuel Başlatma (Terminal)
Geliştirme aşamasında her iki servisi manuel başlatmak için:

**Veri Servisi (Backend):**
```bash
npm run api
```

**React Uygulaması (Frontend):**
```bash
npm start
```
Uygulama yerelde `http://localhost:3000` adresinden açılacaktır.

## Prodüksiyon Derlemesi (Build)

Uygulamanın statik dosyalarını derlemek için:
```bash
npm run build
```
Bu komut, tüm React kodlarını `build/` klasörü altına derler. `server.js` backend sunucusu bu derlenmiş dosyaları otomatik olarak statik olarak sunar.

## Prodüksiyon Canlı Yayını (Deployment)

Bu uygulama yerel JSON dosyalarını veritabanı gibi kullandığı için, serverless platformlar (Vercel vb.) yerine kalıcı bir sunucu ortamı sunan **Render** veya **Railway** gibi bulut servislerinde tek bir Web Servisi olarak yayınlanması önerilir.

### Render Üzerinde Canlıya Alma Adımları

1.  GitHub deponuzu (`radyoLabel`) Render hesabınıza bağlayın.
2.  Yeni bir **Web Service** oluşturun.
3.  Aşağıdaki ayarları girin:
    *   **Runtime**: `Node`
    *   **Build Command**: `npm install && npm run build`
    *   **Start Command**: `node server.js`
4.  Render size otomatik olarak `https://radyolabel.onrender.com` gibi ücretsiz ve canlı bir HTTPS linki verecektir.
