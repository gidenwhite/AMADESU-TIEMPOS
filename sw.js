// Service worker de la app AMADESU RALLYS.
// - Hace la página instalable y la abre rápido.
// - Las páginas y scripts propios van "red primero": siempre se ve la última
//   versión publicada; la copia guardada solo se usa si no hay conexión.
// - Los datos en vivo (tiempos, boletines...) NUNCA se guardan: van directo.
// - Recibe y muestra las notificaciones push.
const VERSION = 'amadesu-v6';
const BASICOS = ['./', './index.html', './info.html', './sin_internet.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/favicon-32.png',
  // Planilla de Tiempos: se abre y se carga sin internet (los datos van en cola)
  './planilla.html', './planilla.js', './planilla.css', './supabase_config.js',
  './planilla_formato/defecto.json', './planilla_formato/fia.png', './planilla_formato/febad.jpg', './planilla_formato/amadesu.jpg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(BASICOS)).catch(() => { }));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(claves.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Datos en vivo y autenticación: nunca desde la copia guardada.
  if (/\.supabase\.co$/.test(url.hostname)) return;

  const mismoSitio = url.origin === self.location.origin;
  // Librerías y fuentes de CDN: no cambian (versión fija) -> copia guardada primero.
  const esLibreria = /(^|\.)(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname);
  if (!mismoSitio && !esLibreria) return;

  // Los paneles de admin/operador siempre van directo a la red (nunca se guardan).
  // Si no hay internet, en vez del error del navegador se muestra la pantalla
  // propia con las planillas guardadas en este equipo.
  if (mismoSitio && /(admin_|operador_)/.test(url.pathname)) {
    if (req.mode !== 'navigate') return;
    event.respondWith(fetch(req).catch(async () =>
      (await caches.match('./sin_internet.html')) || Response.error()));
    return;
  }

  if (esLibreria) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const guardado = await cache.match(req);
      if (guardado) return guardado;
      const resp = await fetch(req);
      if (resp.ok || resp.type === 'opaque') cache.put(req, resp.clone());
      return resp;
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const resp = await fetch(req);
      if (resp.ok) cache.put(req, resp.clone());
      return resp;
    } catch (e) {
      const guardado = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (guardado) return guardado;
      if (req.mode === 'navigate') return (await cache.match('./sin_internet.html')) || (await cache.match('./index.html')) || Response.error();
      throw e;
    }
  })());
});

// ---------- Notificaciones push ----------
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { cuerpo: event.data && event.data.text() }; }
  const titulo = d.titulo || 'AMADESU RALLYS';
  event.waitUntil(self.registration.showNotification(titulo, {
    body: d.cuerpo || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || './index.html' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data && event.notification.data.url || './index.html', self.registration.scope).href;
  event.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of ventanas) {
      if (new URL(w.url).origin === self.location.origin && 'navigate' in w) {
        await w.focus();
        return w.navigate(destino);
      }
    }
    return self.clients.openWindow(destino);
  })());
});
