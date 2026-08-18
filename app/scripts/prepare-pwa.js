// Roda DEPOIS de `npx expo export --platform web` — o export puro não
// gera nada de PWA (esse projeto não usa Expo Router, então não tem a
// geração automática de manifest/meta tags). Sem isso, "Adicionar à
// Tela de Início" no Safari abre só um atalho de navegador comum, sem
// ícone próprio nem tela cheia.
'use strict';

const fs = require('fs');
const path = require('path');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const ICON_ORIGEM = path.join(__dirname, '..', 'assets', 'icon.png');
const ICON_DESTINO = path.join(DIST_DIR, 'icon.png');
const INDEX_HTML = path.join(DIST_DIR, 'index.html');
const MANIFEST_PATH = path.join(DIST_DIR, 'manifest.json');

if (!fs.existsSync(DIST_DIR)) {
  console.error('dist/ não existe — rode "npx expo export --platform web" antes.');
  process.exit(1);
}

fs.copyFileSync(ICON_ORIGEM, ICON_DESTINO);

const manifest = {
  name: 'Farmácias Conviva',
  short_name: 'Conviva',
  start_url: '.',
  display: 'standalone',
  background_color: '#003068',
  theme_color: '#003068',
  icons: [{ src: '/icon.png', sizes: '1024x1024', type: 'image/png' }],
};
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

const tagsPwa = `
  <meta name="theme-color" content="#003068"/>
  <meta name="apple-mobile-web-app-capable" content="yes"/>
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
  <meta name="apple-mobile-web-app-title" content="Conviva"/>
  <link rel="apple-touch-icon" href="/icon.png"/>
  <link rel="manifest" href="/manifest.json"/>
</head>`;

let html = fs.readFileSync(INDEX_HTML, 'utf8');
if (!html.includes('apple-mobile-web-app-capable')) {
  html = html.replace('</head>', tagsPwa);
  fs.writeFileSync(INDEX_HTML, html);
}

console.log('PWA preparado: dist/manifest.json, dist/icon.png, meta tags injetadas em dist/index.html.');
