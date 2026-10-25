// Service worker de la app AMADESU RALLYS.
// - Hace la página instalable y la abre rápido.
// - Las páginas y scripts propios van "red primero": siempre se ve la última
//   versión publicada; la copia guardada solo se usa si no hay conexión.
// - Los datos en vivo (tiempos, boletines...) NUNCA se guardan: van directo.
// - Recibe y muestra las notificaciones push.
const VERSION = 'amadesu-v12';
const BASICOS = ['./', './info.html', './sin_internet.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/favicon-32.png',
  './app.js', './app.css', './offline.js',
  // Planilla de Tiempos: se abre y se carga sin internet (los datos van en cola)
  './planilla.html', './planilla.js', './planilla.css', './supabase_config.js',
  // Planilla de Inscripción: igual, se abre y se carga sin internet
  './inscripcion.html', './inscripcion.js', './inscripcion.css',
  './planilla_formato/defecto.json', './planilla_formato/fia.png', './planilla_formato/febad.jpg', './planilla_formato/amadesu.jpg',
  'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js'];
// Sin estas, el equipo todavía no puede abrir la planilla sin internet.
const IMPRESCINDIBLES = ['./', './sin_internet.html', './planilla.html', './planilla.js', './inscripcion.html', './inscripcion.js', './supabase_config.js'];

// El hosting (Cloudflare) cambia "planilla.html" por "/planilla" e "index.html"
// por "/" con una redirección. Las páginas se guardan siempre con un solo
// nombre (sin ".html" y sin "?..."), así se encuentran con cualquiera de las dos formas.
function clave(u) {
  const url = new URL(u, self.registration.scope);
  if (url.origin !== self.location.origin) return url.href;
  const ultimo = url.pathname.split('/').pop();
  if (ultimo && ultimo.includes('.') && !ultimo.endsWith('.html')) return url.href;
  return url.origin + url.pathname.replace(/\.html$/, '').replace(/\/index$/, '/');
}
// Una respuesta que vino de una redirección no se puede mostrar como página:
// se guarda una copia limpia.
async function limpia(resp) {
  if (!resp.redirected) return resp;
  return new Response(await resp.blob(), { status: resp.status, statusText: resp.statusText, headers: resp.headers });
}
async function guardar(cache, u, resp) {
  if (resp.ok) await cache.put(clave(u), await limpia(resp));
}
async function buscar(cache, u) {
  return (await cache.match(clave(u), { ignoreSearch: true })) || (await cache.match(u));
}

self.addEventListener('install', (event) => {
  // Uno por uno: si falta un archivo en el servidor, los demás igual se guardan.
  event.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(BASICOS.map(async u => guardar(c, u, await fetch(u, { cache: 'no-cache' }))))));
  self.skipWaiting();
});

// La página avisa qué usó al cargarse (scripts, librerías...) y se guarda todo,
// así sin internet abre a la primera. Responde si el equipo ya quedó listo.
self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.tipo !== 'guardar-recursos') return;
  const puerto = event.ports && event.ports[0];
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.allSettled((d.urls || []).map(async (u) => {
      const url = new URL(u);
      if (/\.supabase\.co$/.test(url.hostname) || /(admin_|operador_)/.test(url.pathname)) return;
      if (url.origin !== self.location.origin && await cache.match(u)) return;
      await guardar(cache, u, await fetch(u, { cache: 'no-cache' }));
    }));
    let listo = true;
    for (const u of IMPRESCINDIBLES) if (!(await buscar(cache, u))) listo = false;
    const claves = await cache.keys();
    if (!claves.some(r => r.url.includes('@supabase/supabase-js'))) listo = false;
    if (puerto) puerto.postMessage({ listo, version: VERSION });
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(claves.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function pantallaSinInternet() {
  const cache = await caches.open(VERSION);
  return (await buscar(cache, './sin_internet.html')) || (await buscar(cache, './')) || Response.error();
}

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
    event.respondWith(fetch(req).catch(pantallaSinInternet));
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
      if (resp.ok) guardar(cache, req.url, resp.clone()).catch(() => { });
      return resp;
    } catch (e) {
      const guardado = await buscar(cache, req.url);
      if (guardado) return guardado;
      if (req.mode === 'navigate') return pantallaSinInternet();
      throw e;
    }
  })());
});

// ---------- Notificaciones push ----------
// Cada aviso trae su clave (tag): el celular anota "recibido" al llegar y
// "abierto" al tocarlo, para que el panel muestre a cuántos les llegó.
// La clave pública del sitio es la misma de supabase_config.js (no es secreta).
const SUPA_URL = 'https://wnkqjsjdwgjnpzognvhb.supabase.co';
const SUPA_CLAVE = 'sb_publishable_BURgei8arWiZwYz3tC-Zbw_g_cnJIm5';
function anotarAviso(clave, evento) {
  if (!clave) return Promise.resolve();
  return fetch(`${SUPA_URL}/rest/v1/rpc/app_aviso_evento`, {
    method: 'POST',
    headers: { apikey: SUPA_CLAVE, Authorization: `Bearer ${SUPA_CLAVE}`, 'Content-Type': 'application/json', 'Content-Profile': 'rally' },
    body: JSON.stringify({ p_clave: clave, p_evento: evento }),
  }).catch(() => { });
}

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { cuerpo: event.data && event.data.text() }; }
  const titulo = d.titulo || 'AMADESU RALLYS';
  event.waitUntil(Promise.all([
    self.registration.showNotification(titulo, {
      body: d.cuerpo || '',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: d.tag || undefined,
      renotify: !!d.tag,
      data: { url: d.url || './index.html', clave: d.tag || null },
    }),
    anotarAviso(d.tag, 'recibido'),
    // Las páginas abiertas actualizan su panel de Novedades al momento.
    self.clients.matchAll({ type: 'window' }).then(ws => ws.forEach(w => w.postMessage({ tipo: 'novedad' }))),
  ]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data && event.notification.data.url || './index.html', self.registration.scope).href;
  event.waitUntil((async () => {
    await anotarAviso(event.notification.data && event.notification.data.clave, 'abierto');
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
