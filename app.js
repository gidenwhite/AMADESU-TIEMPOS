// App AMADESU RALLYS: instalación, avisos (notificaciones) y estadísticas de visitas.
// Se carga en las páginas públicas (index.html e info.html).
import { supabase } from './supabase_config.js';

const VAPID_PUBLICA = 'BNfdgY8XAeBA8JkVOTGYDzZoMNQo3yV6fzbuyZ9UK2Oti7CRWS8Fx4vSOx8ym-ATYqV3C5Y4GfG8A9imKomIz8k';
const DIAS_SIN_INSISTIR = 3;

const db = () => supabase.schema('rally');
const almacen = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } },
};
const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12));

// Identificador ANÓNIMO del dispositivo (no se pide ni se guarda nombre, mail ni teléfono).
let visitante = almacen.get('amd_visitante');
if (!visitante) { visitante = nuevoId(); almacen.set('amd_visitante', visitante); }
let sesion;
try { sesion = sessionStorage.getItem('amd_sesion') || nuevoId(); sessionStorage.setItem('amd_sesion', sesion); } catch (e) { sesion = nuevoId(); }

const ua = navigator.userAgent;
const esIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const esAndroid = /Android/i.test(ua);
// Navegadores internos de WhatsApp/Facebook/Instagram/etc.: no permiten instalar.
const esNavegadorInterno = /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|; wv\)/i.test(ua);
const esSamsung = /SamsungBrowser/.test(ua);
const esPcCompatible = !esIOS && !esAndroid && /Chrome\/|Edg\//.test(ua) && !/OPR\//.test(ua);
const esInstalada = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const esRobot = navigator.webdriver || /bot|crawler|spider|lighthouse|headless/i.test(ua);

function sistemaOperativo() {
  if (esIOS) return 'iPhone/iPad';
  if (esAndroid) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS X/i.test(ua)) return 'Mac';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Otro';
}
function navegador() {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/FxiOS|Firefox\//.test(ua)) return 'Firefox';
  if (/CriOS|Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Otro';
}
function tipoDispositivo() {
  if (/iPad|Tablet/i.test(ua) || (esAndroid && !/Mobile/i.test(ua)) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'Tablet';
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return 'Celular';
  return 'PC';
}

const params = new URLSearchParams(location.search);
const pagina = /info\.html$/.test(location.pathname) ? 'info' : 'inicio';
const rallyDeLaPagina = params.get('id') || params.get('rally') || null;
const esUuid = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || '');

async function registrar(evento, extra = {}) {
  if (esRobot) return;
  try {
    let referencia = null;
    try { if (document.referrer) { const h = new URL(document.referrer).hostname; if (h !== location.hostname) referencia = h; } } catch (e) { }
    await db().from('app_visitas').insert({
      visitante, sesion, evento, pagina,
      instalada: esInstalada(),
      dispositivo: tipoDispositivo(), sistema: sistemaOperativo(), navegador: navegador(),
      zona_horaria: (Intl.DateTimeFormat().resolvedOptions().timeZone || '').slice(0, 60),
      idioma: (navigator.language || '').slice(0, 20),
      referencia: params.get('fuente') === 'app' ? 'app' : referencia,
      ...extra,
    });
  } catch (e) { /* las estadísticas nunca deben romper la página */ }
}

// Las páginas avisan qué ventana se abrió (Tiempos, Pilotos, Estadísticas).
window.appRegistrarVista = (seccion, rallyId) => registrar('vista', { seccion, rally_id: esUuid(rallyId) ? rallyId : null });

// ------------------------------------------------------------------
// Interfaz: botones en la barra, aviso inferior de instalación, hoja de diálogo
// ------------------------------------------------------------------
const ICONO = {
  instalar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"></path><polyline points="7 10 12 15 17 10"></polyline><path d="M5 21h14"></path></svg>',
  campana: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>',
  compartir: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>',
  mas: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><rect x="3" y="3" width="18" height="18" rx="3"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>',
};

let eventoInstalar = null;
const puedeInstalar = () => !esInstalada() && !!(eventoInstalar || esIOS || esAndroid || esPcCompatible);

function contenedorAcciones() {
  let c = document.getElementById('app-acciones');
  if (!c) {
    const barra = document.querySelector('.topbar');
    if (!barra) return null;
    c = document.createElement('div');
    c.id = 'app-acciones';
    barra.appendChild(c);
  }
  c.classList.add('app-acciones');
  return c;
}

function pintarBotones() {
  const c = contenedorAcciones();
  if (!c) return;
  c.innerHTML = '';
  if (puedeInstalar()) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'app-btn app-btn-instalar';
    b.innerHTML = `${ICONO.instalar}<span>Instalar app</span>`;
    b.onclick = instalar;
    c.appendChild(b);
  }
  // En los equipos donde ya entró un operador o admin: acceso directo a la
  // Planilla, que funciona aunque no haya internet (el panel no).
  let staff = null;
  try { staff = JSON.parse(almacen.get('pl_usuario') || 'null'); } catch (e) { }
  if (staff) {
    const a = document.createElement('a');
    a.className = 'app-btn'; a.href = 'planilla.html' + (staff.rally_id ? '?rally=' + encodeURIComponent(staff.rally_id) : '');
    a.title = 'Planilla de Tiempos (funciona sin internet)';
    a.style.textDecoration = 'none';
    a.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="3" x2="9" y2="21"></line></svg><span class="app-btn-txt">Planilla</span>';
    c.appendChild(a);
  }
  if (soportaAvisos() || (esIOS && !esInstalada())) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'app-btn app-btn-avisos'; b.id = 'app-btn-avisos';
    b.setAttribute('aria-label', 'Avisos');
    b.innerHTML = `${ICONO.campana}<span class="app-btn-txt">Avisos</span><i class="app-dot"></i>`;
    b.onclick = abrirAvisos;
    c.appendChild(b);
    actualizarCampana();
  }
}

function hoja(html) {
  cerrarHoja();
  const o = document.createElement('div');
  o.className = 'app-hoja-fondo'; o.id = 'app-hoja';
  o.innerHTML = `<div class="app-hoja" role="dialog" aria-modal="true"><button type="button" class="app-hoja-x" aria-label="Cerrar">✕</button>${html}</div>`;
  o.addEventListener('click', e => { if (e.target === o || e.target.closest('.app-hoja-x') || e.target.closest('[data-cerrar]')) cerrarHoja(); });
  document.body.appendChild(o);
  requestAnimationFrame(() => o.classList.add('visible'));
  return o;
}
function cerrarHoja() { document.getElementById('app-hoja')?.remove(); }

function avisoCorto(texto) {
  const t = document.createElement('div');
  t.className = 'app-toast'; t.textContent = texto;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('visible'));
  setTimeout(() => { t.classList.remove('visible'); setTimeout(() => t.remove(), 300); }, 3200);
}

// ---------- Instalación ----------
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  eventoInstalar = e;
  pintarBotones();
  programarInvitacion();
});

window.addEventListener('appinstalled', () => {
  eventoInstalar = null;
  registrar('instalacion');
  almacen.set('amd_instalacion_registrada', '1');
  document.getElementById('app-invitacion')?.remove();
  pintarBotones();
  avisoCorto('¡Listo! La app quedó instalada en tu celular.');
});

async function instalar() {
  document.getElementById('app-invitacion')?.remove();
  if (eventoInstalar) {
    eventoInstalar.prompt();
    const { outcome } = await eventoInstalar.userChoice;
    if (outcome !== 'accepted') almacen.set('amd_invitacion_cerrada', String(Date.now()));
    eventoInstalar = null;
    pintarBotones();
    return;
  }
  // El celular no ofreció el botón automático: se muestran los pasos para ese navegador.
  const MENU = '<b style="font-size:20px; line-height:0; vertical-align:-2px;">⋮</b>';
  const pasos = (titulo, lista, nota = 'Así recibís los avisos de largadas, boletines y resultados.') => hoja(`
      <img src="icons/icon-192.png" alt="" class="app-hoja-icono">
      <h3>${titulo}</h3>
      <ol class="app-pasos">${lista.map((p, i) => `<li><b>${i + 1}</b><span>${p}</span></li>`).join('')}</ol>
      <p class="app-hoja-nota">${nota}</p>
      <button type="button" class="app-btn-grande" data-cerrar>Entendido</button>`);

  if (esNavegadorInterno) {
    pasos('Abrí la página en tu navegador', [
      `Tocá el menú ${MENU} o <b>···</b> (arriba a la derecha).`,
      `Elegí <b>“Abrir en ${esIOS ? 'Safari' : 'Chrome'}”</b> (o “Abrir en el navegador”).`,
      'Ahí te aparece el botón <b>Instalar la app</b>.',
    ], 'Desde WhatsApp, Facebook o Instagram el celular no deja instalar apps.');
  } else if (esIOS) {
    pasos('Instalá AMADESU en tu iPhone', [
      `Tocá el botón <b>Compartir</b> ${ICONO.compartir} (en Safari: abajo en el centro; en Chrome: arriba a la derecha).`,
      `Elegí <b>“Agregar a pantalla de inicio”</b> ${ICONO.mas}. Si no lo ves, deslizá la lista hacia arriba.`,
      'Tocá <b>Agregar</b>. ¡Listo, ya está en tu pantalla!',
    ]);
  } else if (esAndroid && esSamsung) {
    pasos('Instalá AMADESU en tu Samsung', [
      'Tocá el menú <b>☰</b> (abajo a la derecha).',
      'Elegí <b>“Agregar página a”</b> → <b>“Pantalla de inicio”</b>.',
      'Tocá <b>Agregar</b>. ¡Listo!',
    ]);
  } else if (esAndroid) {
    pasos('Instalá AMADESU en tu celular', [
      `Tocá el menú ${MENU} de Chrome (arriba a la derecha).`,
      'Elegí <b>“Instalar aplicación”</b> (o <b>“Agregar a la pantalla principal”</b>).',
      'Tocá <b>Instalar</b>. ¡Listo, ya está entre tus apps!',
    ]);
  } else {
    pasos('Instalá AMADESU en tu computadora', [
      'Buscá el ícono de <b>instalar</b> ⊕ a la derecha de la barra de direcciones y tocalo.',
      `Si no aparece: menú ${MENU} → <b>“Transmitir, guardar y compartir”</b> → <b>“Instalar página como app”</b> (en Edge: <b>···</b> → Aplicaciones → Instalar este sitio).`,
      'Confirmá con <b>Instalar</b>.',
    ], 'Queda como un programa más, con su ícono en el escritorio.');
  }
}

function programarInvitacion() {
  if (esInstalada() || document.getElementById('app-invitacion')) return;
  const cerrada = parseInt(almacen.get('amd_invitacion_cerrada') || '0', 10);
  if (cerrada && Date.now() - cerrada < DIAS_SIN_INSISTIR * 86400000) return;
  setTimeout(function mostrar() {
    if (!puedeInstalar() || document.getElementById('app-invitacion')) return;
    // No interrumpe si está mirando Tiempos/Pilotos/Stats: espera a que cierre.
    if (document.querySelector('.modal-overlay.active, .lightbox-overlay.active, .app-hoja-fondo')) { setTimeout(mostrar, 8000); return; }
    const d = document.createElement('div');
    d.className = 'app-invitacion-fondo'; d.id = 'app-invitacion';
    d.innerHTML = `
      <div class="app-invitacion" role="dialog" aria-modal="true" aria-labelledby="app-inv-titulo">
        <div class="app-invitacion-cabeza">
          <img src="icons/icon-192.png" alt="" class="app-invitacion-icono">
          <div>
            <div class="app-invitacion-marca">APP OFICIAL · GRATIS</div>
            <h3 id="app-inv-titulo">Llevá AMADESU en tu celular</h3>
          </div>
        </div>
        <ul class="app-beneficios">
          <li><span>⏱️</span><div><b>Tiempos en vivo a un toque</b><small>Se abre al instante, a pantalla completa.</small></div></li>
          <li><span>🔔</span><div><b>Avisos de cada largada</b><small>Etapas, PE, mangas, boletines y resultados.</small></div></li>
          <li><span>📲</span><div><b>Liviana y sin tiendas</b><small>No ocupa espacio ni pide cuenta. Se instala en 2 segundos.</small></div></li>
        </ul>
        <button type="button" class="app-btn-grande app-btn-instalar-grande" data-accion="instalar">${ICONO.instalar}<span>Instalar la app gratis</span></button>
        <button type="button" class="app-btn-link" data-accion="cerrar">Seguir en el navegador</button>
      </div>`;
    const cerrar = () => {
      almacen.set('amd_invitacion_cerrada', String(Date.now()));
      d.classList.remove('visible');
      setTimeout(() => d.remove(), 300);
    };
    d.addEventListener('click', e => {
      const a = e.target.closest('[data-accion]')?.dataset.accion;
      if (a === 'instalar') instalar();
      if (a === 'cerrar' || e.target === d) cerrar();
    });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape' && document.getElementById('app-invitacion')) { cerrar(); document.removeEventListener('keydown', esc); } });
    document.body.appendChild(d);
    requestAnimationFrame(() => d.classList.add('visible'));
  }, 2500);
}

// ---------- Avisos (notificaciones push) ----------
function soportaAvisos() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }

function claveBinaria(base64) {
  const relleno = '='.repeat((4 - base64.length % 4) % 4);
  const b = atob((base64 + relleno).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...b].map(c => c.charCodeAt(0)));
}

function swListo() {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('sin service worker')), 6000)),
  ]);
}

async function suscripcionActual() {
  if (!soportaAvisos()) return null;
  try { return (await swListo()).pushManager.getSubscription(); } catch (e) { return null; }
}

async function guardarSuscripcion(sub) {
  const j = sub.toJSON();
  const { error } = await db().rpc('app_registrar_push', {
    p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth,
    p_visitante: visitante, p_sistema: `${sistemaOperativo()} · ${navegador()}${esInstalada() ? ' · app' : ''}`,
  });
  if (error) throw error;
}

// Suscribe este celular (el permiso ya tiene que estar dado). Cada paso
// avisa su propio error, así se sabe exactamente dónde falló.
async function suscribir() {
  let reg;
  try { reg = await swListo(); } catch (e) { throw new Error('La app no terminó de cargar. Cerrala, abrila de nuevo y volvé a intentar.'); }
  let sub;
  try {
    sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveBinaria(VAPID_PUBLICA) });
  } catch (e) { throw new Error('El celular no permitió crear la suscripción (' + (e.message || e.name) + ').'); }
  try { await guardarSuscripcion(sub); } catch (e) { throw new Error('No se pudo guardar en el servidor (' + (e.message || 'sin conexión') + ').'); }
  return sub;
}

async function activarAvisos() {
  try {
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') { actualizarCampana(); abrirAvisos(); return; }
    await suscribir();
    registrar('avisos_activados');
    cerrarHoja();
    avisoCorto('🔔 Avisos activados. Te vamos a avisar de cada novedad.');
  } catch (e) {
    cerrarHoja();
    hoja(`<h3>No se pudieron activar los avisos</h3><p>${(e.message || 'Error desconocido').replace(/</g, '&lt;')}</p>
      <button type="button" class="app-btn-grande" id="app-reintentar">Intentar de nuevo</button>`);
    document.getElementById('app-reintentar').onclick = activarAvisos;
  }
  actualizarCampana();
}

async function desactivarAvisos() {
  try {
    const sub = await suscripcionActual();
    if (sub) {
      await db().rpc('app_quitar_push', { p_endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
    avisoCorto('Avisos desactivados.');
  } catch (e) { }
  cerrarHoja();
  actualizarCampana();
}

const QUE_AVISAMOS = `
  <ul class="app-lista">
    <li>🏁 Nuevas carreras y circuitos</li>
    <li>🟢 Largada de cada Etapa, PE, Shakedown, Clasificación y Manga</li>
    <li>📄 Boletines, comunicados y reglamento</li>
    <li>🏆 Fin de la carrera y resultados</li>
  </ul>`;

async function abrirAvisos() {
  if (!soportaAvisos()) {
    if (esIOS && !esInstalada()) {
      hoja(`<h3>🔔 Avisos en iPhone</h3>
        <p>En iPhone los avisos llegan <b>solo con la app instalada</b>. Instalala y después activalos desde la campanita.</p>
        ${QUE_AVISAMOS}
        <button type="button" class="app-btn-grande" id="app-ir-instalar">Cómo instalar la app</button>`);
      document.getElementById('app-ir-instalar').onclick = instalar;
    } else {
      hoja(`<h3>🔔 Avisos</h3><p>Este navegador no permite avisos. Probá con Chrome en Android, o instalando la app.</p>
        <button type="button" class="app-btn-grande" data-cerrar>Entendido</button>`);
    }
    return;
  }
  if (Notification.permission === 'denied') {
    hoja(`<h3>🔕 Avisos bloqueados</h3>
      <p>Los avisos están bloqueados para esta página. Para activarlos:</p>
      <ol class="app-pasos">
        <li><b>1</b><span>Tocá el candado 🔒 al lado de la dirección (o abrí los ajustes de la app).</span></li>
        <li><b>2</b><span>Entrá a <b>Permisos → Notificaciones</b> y elegí <b>Permitir</b>.</span></li>
        <li><b>3</b><span>Volvé y tocá la campanita otra vez.</span></li>
      </ol>
      <button type="button" class="app-btn-grande" data-cerrar>Entendido</button>`);
    return;
  }
  const sub = await suscripcionActual();
  if (sub) {
    hoja(`<h3>🔔 Avisos activados</h3><p>Te avisamos de:</p>${QUE_AVISAMOS}
      <button type="button" class="app-btn-grande secundario" id="app-desactivar">Desactivar avisos</button>`);
    document.getElementById('app-desactivar').onclick = desactivarAvisos;
  } else {
    hoja(`<h3>🔔 ¿Te avisamos?</h3><p>Recibí una notificación en el celular cuando haya novedades:</p>${QUE_AVISAMOS}
      <button type="button" class="app-btn-grande" id="app-activar">Activar avisos</button>
      <button type="button" class="app-btn-link" data-cerrar>Ahora no</button>`);
    document.getElementById('app-activar').onclick = activarAvisos;
  }
}

async function actualizarCampana() {
  const b = document.getElementById('app-btn-avisos');
  if (!b) return;
  let activo = false;
  try { activo = !!(await suscripcionActual()); } catch (e) { }
  b.classList.toggle('activo', activo);
  b.title = activo ? 'Avisos activados' : 'Activar avisos';
}

// ------------------------------------------------------------------
// Arranque
// ------------------------------------------------------------------
async function iniciar() {
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./sw.js'); } catch (e) { }
  }
  pintarBotones();
  if (esIOS || esAndroid) programarInvitacion();

  registrar('visita', { rally_id: esUuid(rallyDeLaPagina) ? rallyDeLaPagina : null });
  if (esInstalada() && !almacen.get('amd_instalacion_registrada')) {
    almacen.set('amd_instalacion_registrada', '1');
    registrar('instalacion');
  }

  // Si ya tenía avisos activos, se reconfirma en el servidor (por si cambió la suscripción).
  try {
    const sub = await suscripcionActual();
    if (sub && Notification.permission === 'granted') guardarSuscripcion(sub).catch(() => { });
  } catch (e) { }

  pedirAvisosAlEntrar();
}

// Pedir los avisos apenas se entra:
//  - en la app instalada: cada vez que se abre, hasta que los active;
//  - en el navegador: cada 3 días, sin pisar la tarjeta de "Instalar".
async function pedirAvisosAlEntrar() {
  if (!soportaAvisos()) return;
  let sub = null;
  try { sub = await suscripcionActual(); } catch (e) { }
  if (sub) return;

  // Ya dio el permiso pero no quedó suscrito (reinstaló, borró datos...): se arregla solo.
  if (Notification.permission === 'granted') { try { await suscribir(); actualizarCampana(); } catch (e) { } return; }

  const ocupado = () => document.querySelector('#app-invitacion, #app-hoja, .modal-overlay.active, .lightbox-overlay.active');
  if (esInstalada()) {
    let mostrada = false;
    try { mostrada = sessionStorage.getItem('amd_avisos_pedidos') === '1'; sessionStorage.setItem('amd_avisos_pedidos', '1'); } catch (e) { }
    if (mostrada) return;
    setTimeout(function intentar() { if (ocupado()) return setTimeout(intentar, 5000); abrirAvisos(); }, 1200);
    return;
  }
  if (Notification.permission !== 'default') return;
  const ultima = parseInt(almacen.get('amd_oferta_avisos') || '0', 10);
  if (ultima && Date.now() - ultima < DIAS_SIN_INSISTIR * 86400000) return;
  setTimeout(function intentar() {
    if (ocupado()) return setTimeout(intentar, 8000);
    almacen.set('amd_oferta_avisos', String(Date.now()));
    abrirAvisos();
  }, 7000);
}

window.addEventListener('pageshow', () => actualizarCampana());
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
else iniciar();
