# Gelişmiş, hafif Node.js tabanlı Docker görüntüsü
FROM node:20-alpine

# bcrypt vb. native modüllerin derlenebilmesi için gerekli araçları yükle
RUN apk add --no-cache python3 make g++ 

WORKDIR /app

# Bağımlılık dosyalarını kopyala ve yükle
COPY package*.json ./
RUN npm ci

# Tüm kaynak kodları kopyala
COPY . .

# React uygulamasının production build'ini al
RUN npm run build

# Port tanımlaması
EXPOSE 4000

# API ve statik sunucuyu başlat
CMD ["node", "server.js"]
