// Planilla de Inscripción: hoja tipo Excel para inscribir pilotos (modo rally).
// Cada fila se guarda con planilla_inscripcion_guardar (files/67_planilla_inscripcion.sql):
// las inscripciones son las mismas que las del panel y la página pública.
// Sin internet, las filas quedan guardadas en el equipo y se suben solas
// cuando vuelve la conexión (igual que la Planilla de Tiempos).
// El encabezado (títulos y logos) es el mismo de la Planilla de Tiempos;
// las firmas y opciones de esta planilla se guardan aparte (planilla_formato).
import { supabase } from './supabase_config.js';

const db = () => supabase.schema('rally');
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tactil = window.matchMedia('(pointer: coarse)').matches;
const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const ORDEN_CLASES = ['RC2', 'PROTO', 'RC2N', 'RC4', 'R2B', 'R1B', 'PROMOCIONAL'];
const PAISES = ['Argentina', 'Bolivia', 'Brasil', 'Canadá', 'Chile', 'China', 'Colombia', 'Costa Rica', 'Cuba', 'Ecuador', 'El Salvador', 'España', 'Estados Unidos', 'Francia', 'Guatemala', 'Honduras', 'Italia', 'Japón', 'México', 'Nicaragua', 'Panamá', 'Paraguay', 'Perú', 'Puerto Rico', 'Reino Unido', 'República Dominicana', 'Uruguay', 'Venezuela'];
const CAMPOS = ['num', 'cat', 'pil', 'nav', 'pais', 'ciu'];
const DEF_INSC = { titulo_lista: 'LISTA DE INSCRITOS', mostrar_ciudad: true, papel: 'carta', firmas: [{ nombre: 'Sr. Luis Fuentes', cargo: 'DIRECTOR DE PRUEBA' }] };

const estado = {
  rally: null, clases: [], ambitos: [], filas: [],
  cfgTiempos: {}, defecto: null, cfgInsc: null, defInsc: null,
  personas: [], ciudades: [], orden: 'clase',
  activa: null, editando: false, guardando: new Map(), sinConexion: false,
};

// ------------------------------------------------------------------
// Sin internet: cada fila se guarda primero en este equipo y se sube después
// ------------------------------------------------------------------
const CLAVE_PEND = 'insc_pendientes_v1';
const leerPend = () => { try { return JSON.parse(localStorage.getItem(CLAVE_PEND) || '{}'); } catch (e) { return {}; } };
function escribirPend(p) {
  try { localStorage.setItem(CLAVE_PEND, JSON.stringify(p)); }
  catch (e) { toast('La memoria de este equipo está llena: conectate a internet para subir los cambios.', true); }
}
const clavePend = id => `${estado.rally.id}|${id}`;
function anotar(id, op, error) {
  const p = leerPend();
  const f = estado.filas.find(x => x.id === id);
  p[clavePend(id)] = { rally: estado.rally.id, id, op, fila: f ? { ...f } : null, ts: Date.now(), error: error || null };
  escribirPend(p);
  return p[clavePend(id)].ts;
}
function quitarPend(id, ts) {
  const p = leerPend(), c = clavePend(id);
  if (p[c] && (ts == null || p[c].ts <= ts)) { delete p[c]; escribirPend(p); }
}
const pendientes = () => estado.rally ? Object.values(leerPend()).filter(x => x.rally === estado.rally.id) : [];
const pendDe = id => leerPend()[clavePend(id)];
const enLinea = () => navigator.onLine && !estado.sinConexion;
const esErrorDeRed = e => !enLinea() || e instanceof TypeError || /fetch|network|Load failed|conex/i.test(String(e && (e.message || e)));

function guardarCopiaLocal() {
  if (!estado.rally) return;
  try {
    localStorage.setItem('insc_copia_' + estado.rally.id, JSON.stringify({
      rally: estado.rally, clases: estado.clases, ambitos: estado.ambitos, filas: estado.filas,
      cfgTiempos: estado.cfgTiempos, defecto: estado.defecto, cfgInsc: estado.cfgInsc, defInsc: estado.defInsc, ciudades: estado.ciudades, ts: Date.now(),
    }));
  } catch (e) { }
}
const leerCopia = id => { try { return JSON.parse(localStorage.getItem('insc_copia_' + id) || 'null'); } catch (e) { return null; } };

async function hayInternet() {
  if (!navigator.onLine) return false;
  try {
    await fetch('https://wnkqjsjdwgjnpzognvhb.supabase.co/auth/v1/health', { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(5000) });
    return true;
  } catch (e) { return false; }
}

async function todo(consulta) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta().range(desde, desde + 999);
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < 1000) return filas;
  }
}

// ------------------------------------------------------------------
// Avisos
// ------------------------------------------------------------------
let timerToast;
function toast(texto, mal = false) {
  const t = $('pl-toast');
  t.textContent = texto; t.classList.toggle('mal', mal); t.classList.add('visible');
  clearTimeout(timerToast); timerToast = setTimeout(() => t.classList.remove('visible'), 3600);
}
function estadoBarra() {
  const lista = pendientes();
  const errores = lista.filter(x => x.error).length;
  const enEquipo = lista.filter(x => !x.error && (x.op === 'borrar' || completa(x.fila))).length;
  const subiendo = [...estado.guardando.values()].filter(v => v === 'guardando').length;
  const offline = !enLinea();
  $('pl-estado').innerHTML = [
    offline ? `<span class="sin-red">📴 Sin conexión${enEquipo ? ` · <b>${enEquipo} fila${enEquipo > 1 ? 's' : ''} guardada${enEquipo > 1 ? 's' : ''} en este equipo</b> — se suben solas cuando vuelva internet` : ' · podés seguir cargando, todo se guarda en este equipo'}</span>` : '',
    !offline && enEquipo && !subiendo ? `<span class="sin-red">⏳ ${enEquipo} fila${enEquipo > 1 ? 's' : ''} por subir… <button type="button" class="pl-btn" id="pl-sync" style="padding:3px 10px;">Subir ahora</button></span>` : '',
    subiendo ? `<span>⏳ Guardando ${subiendo}…</span>` : '',
    errores ? `<span class="mal">⚠ ${errores} fila${errores > 1 ? 's' : ''} con problema (en rojo): tocá el aviso de la fila para ver qué pasa</span>` : '',
    !offline && !subiendo && !errores && !enEquipo && estado.ultimoGuardado ? `<span class="ok">✓ Sincronizado · ${estado.ultimoGuardado}</span>` : '',
    estado.copiaDe ? `<span>Mostrando lo guardado en este equipo (${estado.copiaDe})</span>` : '',
    `<span>${estado.filas.filter(completa).length} inscritos</span>`,
  ].join('');
  $('pl-sync')?.addEventListener('click', () => sincronizar());
}

// ------------------------------------------------------------------
// Filas
// ------------------------------------------------------------------
const nombreCompleto = p => p ? `${p.nombre || ''} ${p.apellido || ''}`.replace(/\s+/g, ' ').trim() : '';
const completa = f => !!(f && f.numero && f.cat && String(f.piloto || '').trim());
const claseDe = f => estado.clases.find(c => c.id === f.cat);
const codigoClase = f => { const c = claseDe(f); return c ? String(c.codigo || c.nombre).toUpperCase() : ''; };
const nombreClase = f => { const c = claseDe(f); let n = c ? String(c.nombre || c.codigo).trim().toUpperCase() : ''; if (n === 'PROMO') n = 'PROMOCIONAL'; return n; };
function posClase(f) {
  const c = claseDe(f);
  const i = ORDEN_CLASES.indexOf(nombreClase(f));
  return [i === -1 ? ORDEN_CLASES.length : i, c?.orden ?? 999, nombreClase(f)];
}
const cmpClase = (a, b) => { const x = posClase(a), y = posClase(b); return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]); };

// Nombre escrito -> nombre y apellido (solo para personas nuevas; las que ya
// existen se reconocen por el nombre completo).
function partir(t) {
  const w = String(t || '').trim().split(/\s+/).filter(Boolean);
  if (w.length <= 1) return [w[0] || '', ''];
  if (w.length === 2) return [w[0], w[1]];
  if (w.length === 3) return [w[0], w.slice(1).join(' ')];
  return [w.slice(0, 2).join(' '), w.slice(2).join(' ')];
}

function desdeServidor(i) {
  return {
    id: i.id, numero: i.numero, cat: i.categoria_id,
    piloto: nombreCompleto(i.piloto), pN: i.piloto?.nombre || '', pA: i.piloto?.apellido || '',
    nav: nombreCompleto(i.navegante), nN: i.navegante?.nombre || '', nA: i.navegante?.apellido || '',
    pais: i.piloto?.pais && i.piloto.pais !== 'N/A' ? i.piloto.pais : '',
    ciudad: i.asociacion?.nombre || '',
    amb: (i.ambitos || []).map(a => a.ambito_campeonato_id),
    creado: i.created_at ? Date.parse(i.created_at) : Date.now(), enServidor: true,
  };
}

// Lo que está en el equipo sin subir gana sobre lo que vino del servidor.
function aplicarPendientes() {
  for (const x of pendientes()) {
    const i = estado.filas.findIndex(f => f.id === x.id);
    if (x.op === 'borrar') { if (i >= 0) estado.filas.splice(i, 1); continue; }
    if (!x.fila) continue;
    if (i >= 0) estado.filas[i] = { ...estado.filas[i], ...x.fila };
    else estado.filas.push({ ...x.fila });
  }
}

// Orden de la hoja: válidas agrupadas por clase; las incompletas al final.
function ordenadas() {
  const validas = estado.filas.filter(completa);
  const porClase = [...validas].sort((a, b) => cmpClase(a, b) || a.creado - b.creado);
  const psto = new Map(), nro = new Map();
  let anterior = null, n = 0;
  porClase.forEach((f, i) => {
    const cl = nombreClase(f);
    n = cl === anterior ? n + 1 : 1; anterior = cl;
    psto.set(f.id, i + 1); nro.set(f.id, n);
  });
  const lista = estado.orden === 'carga' ? [...validas].sort((a, b) => a.creado - b.creado) : porClase;
  const borradores = estado.filas.filter(f => !completa(f)).sort((a, b) => a.creado - b.creado);
  return { lista, borradores, psto, nro, porClase };
}

// ------------------------------------------------------------------
// Carga
// ------------------------------------------------------------------
async function iniciar() {
  if (!(await hayInternet())) estado.sinConexion = true;
  let session = null;
  try { session = (await Promise.race([supabase.auth.getSession(), new Promise(r => setTimeout(() => r({ data: {} }), 6000))])).data.session; } catch (e) { }
  if (!session && !(localStorage.getItem('pl_usuario') && estado.sinConexion)) { location.href = 'admin_login.html'; return; }
  let usuario = null;
  try {
    if (!session || estado.sinConexion) throw new Error('sin sesión');
    const r = await db().from('usuarios').select('rol_id, rally_id').eq('id', session.user.id).maybeSingle();
    if (r.error) throw r.error;
    usuario = r.data;
    try { localStorage.setItem('pl_usuario', JSON.stringify(usuario || {})); } catch (e) { }
  } catch (e) {
    try { usuario = JSON.parse(localStorage.getItem('pl_usuario') || 'null'); } catch (e2) { }
  }
  if (usuario && Number(usuario.rol_id) === 3) {
    $('pl-marco').innerHTML = '<div class="pl-vacio">La Planilla de Inscripción es solo para administradores.</div>';
    $('pl-volver').href = 'operador_dashboard.html';
    return;
  }
  try { estado.orden = localStorage.getItem('insc_orden') || 'clase'; if (localStorage.getItem('insc_sin_ayuda')) $('pl-ayuda').remove(); } catch (e) { }
  document.querySelectorAll('.pl-orden button').forEach(b => b.classList.toggle('activo', b.dataset.orden === estado.orden));

  const rallyId = new URLSearchParams(location.search).get('rally');
  const { data: rallies } = estado.sinConexion ? { data: ralliesGuardados() } : await db().from('rallies').select('id, nombre, fecha_inicio, tipo_evento').is('deleted_at', null).or('tipo_evento.is.null,tipo_evento.neq.circuito').order('fecha_inicio', { ascending: false }).then(r => r, () => ({ data: [] }));
  const sel = $('pl-rally');
  sel.innerHTML = '<option value="">Elegí el rally…</option>' + (rallies || []).map(r => `<option value="${r.id}">${esc(r.nombre)}</option>`).join('');
  sel.hidden = false;
  sel.onchange = () => { if (sel.value) { history.replaceState(null, '', '?rally=' + sel.value); cargarRally(sel.value); } };
  if (rallyId) sel.value = rallyId;
  cargarPersonas();
  if (!rallyId) { $('pl-marco').innerHTML = '<div class="pl-vacio">Elegí un rally arriba para abrir su planilla de inscripción.</div>'; $('pl-sub').textContent = ''; return; }
  await cargarRally(rallyId);
}

function ralliesGuardados() {
  const lista = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith('insc_copia_')) continue;
    try { const c = JSON.parse(localStorage.getItem(k)); if (c && c.rally) lista.push(c.rally); } catch (e) { }
  }
  return lista;
}

async function cargarRally(rallyId) {
  $('pl-marco').innerHTML = '<div class="pl-cargando">Cargando planilla…</div>';
  try {
    if (estado.sinConexion) throw new TypeError('sin conexión');
    const { data: rally, error } = await db().from('rallies').select('id, nombre, fecha_inicio, fecha_fin, ciudad, tipo_evento, imagen_url').eq('id', rallyId).maybeSingle();
    if (error || !rally) throw error || new Error('No se encontró el rally.');
    if (rally.tipo_evento === 'circuito') {
      $('pl-marco').innerHTML = '<div class="pl-vacio">La Planilla de Inscripción es para el modo <b>rally</b>. Los circuitos se inscriben desde Inscripciones en el panel.</div>';
      return;
    }
    estado.rally = rally;
    const [cats, ambs, cfgT, cfgI, defI, ciudades] = await Promise.all([
      supabase.rpc('obtener_categorias_rally', { p_rally_id: rallyId }),
      supabase.rpc('obtener_ambitos_campeonato_rally', { p_rally_id: rallyId }),
      db().from('planillas').select('config').eq('rally_id', rallyId).maybeSingle(),
      db().from('planilla_formato').select('config').eq('clave', 'inscripcion:' + rallyId).maybeSingle(),
      db().from('planilla_formato').select('config').eq('clave', 'inscripcion').maybeSingle(),
      db().from('asociaciones').select('nombre').is('deleted_at', null).limit(500),
    ]);
    if (cats.error) throw cats.error;
    const catIds = (cats.data || []).map(c => c.categoria_id);
    const ambIds = (ambs.data || []).map(a => a.ambito_campeonato_id);
    const [clases, ambitos] = await Promise.all([
      catIds.length ? db().from('categorias').select('id, codigo, nombre, orden').in('id', catIds) : { data: [] },
      ambIds.length ? db().from('ambitos_campeonato').select('id, codigo, nombre, orden').in('id', ambIds) : { data: [] },
    ]);
    estado.clases = (clases.data || []).sort((a, b) => cmpClase({ cat: a.id }, { cat: b.id }));
    estado.ambitos = (ambitos.data || []).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    estado.cfgTiempos = cfgT.data?.config || {};
    estado.cfgInsc = cfgI.data?.config && Object.keys(cfgI.data.config).length ? cfgI.data.config : null;
    estado.defInsc = defI.data?.config && Object.keys(defI.data.config).length ? defI.data.config : null;
    estado.ciudades = [...new Set((ciudades.data || []).map(c => String(c.nombre || '').toUpperCase()).filter(Boolean))];
    estado.defecto = await cargarDefecto();
    await traerInscritos();
    estado.sinConexion = false; estado.copiaDe = null;
    $('pl-sub').textContent = rally.nombre;
    document.title = `Inscripción — ${rally.nombre}`;
    guardarCopiaLocal();
    dibujar();
    sincronizar();
    clearInterval(estado.timer);
    estado.timer = setInterval(async () => {
      if (document.hidden) return;
      if (pendientes().some(x => !x.error)) await sincronizar();
      if (!navigator.onLine || estado.editando) return;
      try { await traerInscritos(); estado.sinConexion = false; guardarCopiaLocal(); if (!estado.editando) dibujar(); }
      catch (e) { if (esErrorDeRed(e)) { estado.sinConexion = true; estadoBarra(); } }
    }, 30000);
  } catch (e) {
    const copia = leerCopia(rallyId);
    if (!copia) {
      $('pl-marco').innerHTML = `<div class="pl-vacio">${esErrorDeRed(e) ? '📴 Sin conexión y este equipo todavía no tiene guardada esta planilla. Abrila una vez con internet y después va a funcionar sin conexión.<br><br><a href="sin_internet.html" style="color:#ffb547;font-weight:700;">Ver las planillas guardadas en este equipo</a>' : 'No se pudo cargar la planilla: ' + esc(e.message || e)}</div>`;
      return;
    }
    Object.assign(estado, { rally: copia.rally, clases: copia.clases, ambitos: copia.ambitos, filas: copia.filas, cfgTiempos: copia.cfgTiempos, defecto: copia.defecto, cfgInsc: copia.cfgInsc, defInsc: copia.defInsc, ciudades: copia.ciudades || [] });
    estado.copiaDe = new Date(copia.ts).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    estado.sinConexion = true;
    aplicarPendientes();
    $('pl-sub').textContent = estado.rally.nombre;
    dibujar();
    clearInterval(estado.timer);
    estado.timer = setInterval(async () => {
      if (!(await hayInternet()) || !estado.sinConexion) return;
      clearInterval(estado.timer); estado.sinConexion = false; estado.copiaDe = null; cargarRally(rallyId);
    }, 8000);
  }
}

async function traerInscritos() {
  const filas = await todo(() => db().from('inscripciones')
    .select('id, numero, categoria_id, created_at, piloto:pilotos(nombre, apellido, pais), navegante:navegantes(nombre, apellido), asociacion:asociaciones(nombre), ambitos:inscripcion_ambitos_campeonato(ambito_campeonato_id)')
    .eq('rally_id', estado.rally.id).is('deleted_at', null).order('created_at'));
  // La fila que se está escribiendo no se pisa.
  const enEdicion = estado.editando && estado.activa ? estado.filas.find(f => f.id === estado.activa.id) : null;
  estado.filas = filas.map(desdeServidor);
  aplicarPendientes();
  if (enEdicion && !estado.filas.some(f => f.id === enEdicion.id)) estado.filas.push(enEdicion);
}

async function cargarDefecto() {
  try {
    const { data, error } = await db().from('planilla_formato').select('config').eq('clave', 'defecto').maybeSingle();
    if (!error && data?.config && Object.keys(data.config).length) return data.config;
  } catch (e) { }
  try { const r = await fetch('planilla_formato/defecto.json', { cache: 'no-cache' }); if (r.ok) return await r.json(); } catch (e) { }
  return null;
}

// Personas ya registradas (para las sugerencias). Se guardan en el equipo
// para que las sugerencias también funcionen sin internet.
async function cargarPersonas() {
  try { estado.personas = JSON.parse(localStorage.getItem('insc_personas_v1') || '[]'); } catch (e) { }
  if (estado.sinConexion) return;
  try {
    const leer = t => todo(() => db().from(t).select('nombre, apellido, pais').is('deleted_at', null));
    const [pil, nav] = await Promise.all([leer('pilotos'), leer('navegantes')]);
    const mapa = new Map();
    const sumar = (f, rol) => {
      const n = nombreCompleto(f); if (!n) return;
      const k = normal(n);
      const p = mapa.get(k) || { n: f.nombre || '', a: f.apellido || '', pais: '', roles: [] };
      if (!p.roles.includes(rol)) p.roles.push(rol);
      if (!p.pais && f.pais && f.pais !== 'N/A') p.pais = f.pais;
      mapa.set(k, p);
    };
    pil.forEach(f => sumar(f, 'P')); nav.forEach(f => sumar(f, 'N'));
    estado.personas = [...mapa.values()];
    try { localStorage.setItem('insc_personas_v1', JSON.stringify(estado.personas)); } catch (e) { }
  } catch (e) { }
}

// ------------------------------------------------------------------
// Formato: títulos y logos de la Planilla de Tiempos; firmas propias
// ------------------------------------------------------------------
const LOGOS_FIJOS = { fia: 'planilla_formato/fia.png', amadesu: 'planilla_formato/amadesu.jpg', febad: 'planilla_formato/febad.jpg' };
function urlImagen(url) {
  const u = String(url || '').trim();
  const id = (u.match(/\/d\/([a-zA-Z0-9_-]{15,})/) || u.match(/[?&]id=([a-zA-Z0-9_-]{15,})/) || [])[1] || (/^[a-zA-Z0-9_-]{25,}$/.test(u) ? u : null);
  return id ? `https://lh3.googleusercontent.com/d/${id}=w800` : u;
}
function cfg() {
  const t = estado.cfgTiempos && Object.keys(estado.cfgTiempos).length ? estado.cfgTiempos : (() => {
    const d = estado.defecto || {};
    const titulos = [...(d.titulos || [])]; while (titulos.length < 4) titulos.push('');
    titulos[3] = estado.rally.nombre.toUpperCase();
    return { ...d, titulos };
  })();
  const i = { ...DEF_INSC, ...(estado.defInsc || {}), ...(estado.cfgInsc || {}) };
  return {
    titulos: (t.titulos && t.titulos.length ? t.titulos : ['', '', '', estado.rally.nombre.toUpperCase()]).concat(['', '', '', '']).slice(0, 4),
    logoEvento: estado.rally.imagen_url || '',
    logosExtra: (t.logos_extra || []).filter(Boolean),
    tituloLista: i.titulo_lista || DEF_INSC.titulo_lista,
    fecha: i.fecha || '',
    hora: i.hora || '',
    mostrarCiudad: i.mostrar_ciudad !== false,
    papel: i.papel === 'oficio' ? 'oficio' : 'carta',
    firmas: (i.firmas && i.firmas.length ? i.firmas : DEF_INSC.firmas).slice(0, 3),
  };
}
const fechaHoy = () => { const s = new Date().toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/ de (\d{4})$/, ' $1'); return s; };
const textoFecha = c => `Fecha Publicación: ${c.fecha || fechaHoy()}`;
const textoHora = c => c.hora || new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false });

// Cajas de logos en píxeles (igual en pantalla y en el Excel).
function disenoCabecera(c) {
  const ev = c.logoEvento ? [{ url: c.logoEvento, x: 0, y: 0, w: 250, h: 140 }] : [];
  const n = c.logosExtra.length;
  const cols = n <= 2 ? 1 : n <= 4 ? 2 : 3;
  const filas = Math.max(1, Math.ceil(n / cols));
  const ZW = n <= 2 ? 110 : 200, ZH = 110;
  const extras = c.logosExtra.map((u, i) => ({ url: urlImagen(u), x: (i % cols) * (ZW / cols), y: Math.floor(i / cols) * (ZH / filas), w: ZW / cols, h: ZH / filas }));
  const fijos = [
    { url: LOGOS_FIJOS.fia, x: 0, y: 0, w: 118, h: 66 },
    { url: LOGOS_FIJOS.amadesu, x: 124, y: 0, w: 118, h: 66 },
    { url: LOGOS_FIJOS.febad, x: 0, y: 72, w: 242, h: 66 },
  ];
  return { ev, extras, fijos, anchoExtras: ZW, altoExtras: ZH };
}
function zonaLogos(cajas, W, H) {
  if (!cajas.length) return '';
  return `<div class="pl-zona" style="width:${Math.round(W)}px; aspect-ratio:${W} / ${H};">${cajas.map(i => `<img src="${esc(i.url)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'" style="left:${(i.x / W * 100).toFixed(2)}%; top:${(i.y / H * 100).toFixed(2)}%; width:${(i.w / W * 100).toFixed(2)}%; height:${(i.h / H * 100).toFixed(2)}%;">`).join('')}</div>`;
}

// ------------------------------------------------------------------
// Dibujo de la hoja
// ------------------------------------------------------------------
function marcaFila(f) {
  const p = pendDe(f.id), g = estado.guardando.get(f.id);
  if (p?.error) return 'error';
  if (g === 'guardando') return 'guardando';
  if (!completa(f)) return 'borrador';
  if (p) return 'espera';
  return '';
}

function celdas(f, psto, nro) {
  const c = cfg();
  const marca = marcaFila(f);
  const p = pendDe(f.id);
  let pstoTxt = psto ?? '';
  if (marca === 'error') pstoTxt = '⚠ ver';
  else if (marca === 'borrador') pstoTxt = !f.numero ? 'falta Nº' : !f.cat ? 'falta clase' : 'falta piloto';
  return `<tr data-id="${f.id}" data-num="${esc(f.numero || '')}" class="${marca}" ${p?.error ? `title="${esc(p.error)}"` : ''}>
    <td class="c-psto" ${marca === 'error' ? 'data-ver-error="1"' : ''}>${esc(pstoTxt)}</td><td class="c-nro">${nro ?? ''}</td>
    <td class="ed" tabindex="-1" data-c="num">${esc(f.numero || '')}</td>
    <td class="ed" tabindex="-1" data-c="cat">${esc(codigoClase(f))}</td>
    <td class="ed" tabindex="-1" data-c="pil">${esc(f.piloto || '')}</td>
    <td class="ed" tabindex="-1" data-c="nav">${esc(f.nav || '')}</td>
    <td class="ed" tabindex="-1" data-c="pais">${esc(f.pais || '')}</td>
    ${c.mostrarCiudad ? `<td class="ed" tabindex="-1" data-c="ciu">${esc(f.ciudad || '')}</td>` : ''}
    ${estado.ambitos.map(a => `<td class="amb ${(f.amb || []).includes(a.id) ? 'si' : ''}" tabindex="-1" data-a="${a.id}"><span class="caja"></span></td>`).join('')}
    <td class="c-quitar"><button type="button" data-quitar="${f.id}" title="Borrar esta fila">🗑</button></td>
  </tr>`;
}

function dibujar() {
  if (!estado.rally) return;
  const scroll = { x: $('pl-marco').scrollLeft, y: $('pl-marco').scrollTop };
  const c = cfg();
  const o = ordenadas();
  const nCols = 7 + (c.mostrarCiudad ? 1 : 0) + estado.ambitos.length + 1;
  const validas = o.porClase;
  let cab = `<tr><th>Psto.</th><th>Nº</th><th>Nº DE COCHE</th><th>CLASE</th><th class="pil">PILOTO</th><th class="pil">NAVEGANTE</th><th>PAÍS</th>${c.mostrarCiudad ? '<th>CIUDAD</th>' : ''}`;
  cab += estado.ambitos.map(a => {
    const todos = validas.length && validas.every(f => (f.amb || []).includes(a.id));
    return `<th class="amb-th" data-amb-todos="${a.id}" title="Tocá para ${todos ? 'desmarcar' : 'marcar'} ${esc(a.nombre)} a todos">${esc(a.codigo)}<small>${todos ? '☑ todos' : '☐ marcar todos'}</small></th>`;
  }).join('');
  cab += '<th class="c-quitar"></th></tr>';

  let cuerpo = '', anterior = null;
  for (const f of o.lista) {
    const cl = nombreClase(f);
    if (estado.orden === 'clase' && anterior !== null && cl !== anterior) cuerpo += `<tr class="sep"><td colspan="${nCols}"></td></tr>`;
    anterior = cl;
    cuerpo += celdas(f, o.psto.get(f.id), o.nro.get(f.id));
  }
  if (o.borradores.length) {
    if (cuerpo) cuerpo += `<tr class="sep"><td colspan="${nCols}"></td></tr>`;
    cuerpo += o.borradores.map(f => celdas(f)).join('');
  }
  cuerpo += `<tr data-id="nueva" class="nueva"><td class="c-psto">＋</td><td class="c-nro"></td>
    ${['num', 'cat', 'pil', 'nav', 'pais'].concat(c.mostrarCiudad ? ['ciu'] : []).map(k => `<td class="ed" tabindex="-1" data-c="${k}"></td>`).join('')}
    ${estado.ambitos.map(a => `<td class="amb" data-a="${a.id}"></td>`).join('')}<td class="c-quitar"></td></tr>`;

  const dz = disenoCabecera(c);
  $('pl-marco').innerHTML = `
    <div class="pl-hoja in-hoja">
      <div class="pl-cab">
        <div class="pl-cab-logos pl-cab-izq">${zonaLogos(dz.ev, 250, 140)}${zonaLogos(dz.extras, dz.anchoExtras, dz.altoExtras)}</div>
        <div class="pl-cab-titulos">${c.titulos.filter(Boolean).map(t => `<div>${esc(t)}</div>`).join('')}</div>
        <div class="pl-cab-logos der">${zonaLogos(dz.fijos, 242, 138)}</div>
      </div>
      <div class="pl-cab-info in-info">
        <span>${esc(textoFecha(c))}</span>
        <span class="in-lista">${esc(c.tituloLista)}</span>
        <span class="der"><i>Hora de publicación:</i> ${esc(textoHora(c))}</span>
      </div>
      ${estado.clases.length ? '' : '<div class="pl-vacio" style="padding:14px;">⚠ Este rally no tiene clases habilitadas: configuralas en "Editar Rally" del panel.</div>'}
      <table class="pl-tabla in-tabla"><thead>${cab}</thead><tbody>${cuerpo}</tbody></table>
      <div class="pl-firmas">${c.firmas.map(fi => `<div class="pl-firma">${fi.img ? `<img src="${esc(urlImagen(fi.img))}" alt="">` : '<div style="height:60px"></div>'}<div class="linea">${esc(fi.nombre || ' ')}</div><b>${esc(fi.cargo || '')}</b></div>`).join('')}</div>
    </div>`;
  $('pl-marco').scrollLeft = scroll.x; $('pl-marco').scrollTop = scroll.y;
  if (estado.activa) { const td = celdaDe(estado.activa); if (td) seleccionar(td, !estado.editando, false); }
  estadoBarra();
}

// ------------------------------------------------------------------
// Edición tipo Excel
// ------------------------------------------------------------------
const idCelda = td => ({ id: td.closest('tr').dataset.id, campo: td.dataset.c || 'amb:' + td.dataset.a });
const celdaDe = a => {
  const tr = document.querySelector(`.in-tabla tr[data-id="${CSS.escape(a.id)}"]`);
  if (!tr) return null;
  return a.campo.startsWith('amb:') ? tr.querySelector(`td.amb[data-a="${CSS.escape(a.campo.slice(4))}"]`) : tr.querySelector(`td.ed[data-c="${a.campo}"]`);
};
const navegables = tr => [...tr.querySelectorAll('td.ed, td.amb')].filter(td => tr.dataset.id !== 'nueva' || td.classList.contains('ed'));

function marcarCruz(td) {
  document.querySelectorAll('.in-tabla .fila-activa').forEach(x => x.classList.remove('fila-activa'));
  document.querySelectorAll('.in-tabla .col-activa').forEach(x => x.classList.remove('col-activa'));
  if (!td) return;
  const tr = td.closest('tr'), idx = td.cellIndex;
  tr.classList.add('fila-activa');
  document.querySelectorAll('.in-tabla tbody tr[data-id]').forEach(f => f.cells[idx]?.classList.add('col-activa'));
  document.querySelector('.in-tabla thead tr')?.cells[idx]?.classList.add('col-activa');
}
function seleccionar(td, enfocar = true, desplazar = true) {
  document.querySelectorAll('.in-tabla td.activa').forEach(x => x.classList.remove('activa'));
  if (!td) { estado.activa = null; marcarCruz(null); return; }
  td.classList.add('activa');
  marcarCruz(td);
  estado.activa = idCelda(td);
  if (enfocar) td.focus({ preventScroll: true });
  if (desplazar) td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function mover(dx, dy) {
  const td = estado.activa && celdaDe(estado.activa);
  if (!td) return;
  const filas = [...document.querySelectorAll('.in-tabla tbody tr[data-id]')];
  const fila = td.closest('tr');
  let fi = filas.indexOf(fila), col = navegables(fila).indexOf(td);
  if (dx) {
    col += dx;
    if (col >= navegables(fila).length) { fi = Math.min(filas.length - 1, fi + 1); col = 0; }
    if (col < 0) { fi = Math.max(0, fi - 1); col = navegables(filas[fi]).length - 1; }
  }
  if (dy) fi = Math.max(0, Math.min(filas.length - 1, fi + dy));
  const destino = navegables(filas[fi])[Math.min(col, navegables(filas[fi]).length - 1)];
  if (destino) seleccionar(destino);
}

// --- Sugerencias -----------------------------------------------------
const sug = { abierta: false, opciones: [], activa: -1, td: null, campo: null };
function opcionesPara(campo, texto) {
  const t = normal(texto);
  const partes = t.split(' ').filter(Boolean);
  const coincide = s => partes.every(p => normal(s).split(' ').some(w => w.startsWith(p)) || normal(s).includes(p));
  if (campo === 'pil' || campo === 'nav') {
    if (t.replace(/ /g, '').length < 2) return { titulo: '', lista: [] };
    const rol = campo === 'pil' ? 'P' : 'N';
    const lista = estado.personas.filter(p => coincide(`${p.n} ${p.a}`))
      .sort((a, b) => (b.roles.includes(rol) - a.roles.includes(rol)) || normal(`${a.n} ${a.a}`).localeCompare(normal(`${b.n} ${b.a}`)))
      .slice(0, 8)
      .map(p => ({ label: `${p.n} ${p.a}`.trim(), sub: [p.roles.length > 1 ? 'Piloto y navegante' : p.roles[0] === 'P' ? 'Piloto' : 'Navegante', p.pais].filter(Boolean).join(' · '), valor: p }));
    return { titulo: 'Ya registrados — elegí para rellenar', lista };
  }
  if (campo === 'cat') {
    const lista = estado.clases.filter(c => !t || coincide(c.codigo) || coincide(c.nombre)).map(c => ({ label: c.codigo, sub: c.nombre !== c.codigo ? c.nombre : '', valor: c }));
    return { titulo: 'Clases de este rally', lista };
  }
  if (campo === 'pais') return { titulo: 'País', lista: PAISES.filter(p => !t || coincide(p)).slice(0, 10).map(p => ({ label: p, valor: p.toUpperCase() })) };
  if (campo === 'ciu') {
    if (!t) return { titulo: '', lista: [] };
    return { titulo: 'Ciudades / asociaciones', lista: estado.ciudades.filter(c => coincide(c)).slice(0, 8).map(c => ({ label: c, valor: c })) };
  }
  return { titulo: '', lista: [] };
}
function pintarSug(td, campo, texto) {
  const caja = $('in-sug');
  sug.td = td; sug.campo = campo;
  const { titulo, lista } = opcionesPara(campo, texto);
  // Si lo escrito ya es exactamente la única opción, no hace falta mostrarla.
  if (!lista.length || (lista.length === 1 && normal(lista[0].label) === normal(texto) && campo !== 'cat')) { cerrarSug(); return; }
  sug.abierta = true; sug.opciones = lista; sug.activa = campo === 'cat' || campo === 'pais' ? 0 : -1;
  caja.innerHTML = (titulo ? `<div class="t">${esc(titulo)}</div>` : '') + lista.map((o, i) => `<div class="op ${i === sug.activa ? 'activa' : ''}" data-i="${i}"><b>${esc(o.label)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</div>`).join('');
  const r = td.getBoundingClientRect();
  caja.style.left = Math.max(8, Math.min(r.left, innerWidth - 260)) + 'px';
  caja.style.minWidth = Math.max(240, r.width) + 'px';
  const abajo = innerHeight - r.bottom;
  if (abajo < 220 && r.top > abajo) { caja.style.top = ''; caja.style.bottom = (innerHeight - r.top + 2) + 'px'; }
  else { caja.style.bottom = ''; caja.style.top = (r.bottom + 2) + 'px'; }
  caja.hidden = false;
}
function cerrarSug() { sug.abierta = false; sug.opciones = []; sug.activa = -1; $('in-sug').hidden = true; }
function marcarSug() { $('in-sug').querySelectorAll('.op').forEach((el, i) => el.classList.toggle('activa', i === sug.activa)); }

function empezarEdicion(td, inicial) {
  if (estado.editando || !td.classList.contains('ed')) return;
  seleccionar(td);
  const a = idCelda(td);
  estado.editando = true;
  const valor = inicial ?? td.textContent.trim();
  td.dataset.antes = td.textContent;
  const numerico = a.campo === 'num';
  td.innerHTML = `<input type="text" autocomplete="off" spellcheck="false" ${numerico && tactil ? 'inputmode="numeric"' : ''} value="${esc(valor)}">`;
  const inp = td.querySelector('input');
  inp.focus();
  if (inicial == null) inp.select(); else inp.setSelectionRange(inp.value.length, inp.value.length);
  let elegido = null;
  const mostrar = () => pintarSug(td, a.campo, inp.value);
  if (a.campo === 'cat' || a.campo === 'pais' || inicial != null) mostrar();
  inp.addEventListener('input', () => { elegido = null; mostrar(); });
  const terminar = (dx, dy) => confirmar(td, inp.value, elegido).then(ok => { if (ok) { cerrarSug(); mover(dx, dy); } });
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (sug.abierta && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      sug.activa = Math.max(0, Math.min(sug.opciones.length - 1, sug.activa + (e.key === 'ArrowDown' ? 1 : -1)));
      marcarSug(); return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (sug.abierta && sug.activa >= 0) { const o = sug.opciones[sug.activa]; elegido = o; inp.value = o.label; }
      terminar(e.key === 'Tab' ? (e.shiftKey ? -1 : 1) : 0, e.key === 'Enter' ? 1 : 0);
    } else if (e.key === 'Escape') { e.preventDefault(); cerrarSug(); cancelar(td); }
    else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !tactil) { e.preventDefault(); terminar(0, e.key === 'ArrowDown' ? 1 : -1); }
  });
  // mousedown (no click): se elige antes de que la celda pierda el foco.
  $('in-sug').onmousedown = e => {
    const op = e.target.closest('.op'); if (!op) return;
    e.preventDefault();
    const o = sug.opciones[+op.dataset.i]; elegido = o; inp.value = o.label;
    terminar(1, 0);
  };
  inp.addEventListener('blur', () => setTimeout(() => { if (td.isConnected && td.querySelector('input') === inp) { confirmar(td, inp.value, elegido); cerrarSug(); } }, 150));
}
function cancelar(td) {
  td.textContent = td.dataset.antes || '';
  estado.editando = false;
  seleccionar(td);
}

// Valida lo escrito, actualiza la fila y la guarda (o la deja en el equipo).
async function confirmar(td, texto, elegido) {
  if (!td.querySelector('input')) return true;
  const a = idCelda(td);
  const v = String(texto || '').replace(/\s+/g, ' ').trim();
  let f = a.id === 'nueva' ? null : estado.filas.find(x => x.id === a.id);
  const cambio = {};
  const error = msg => { toast(msg, true); td.querySelector('input')?.focus(); return false; };
  if (a.campo === 'num') {
    if (v && !/^\d{1,4}$/.test(v)) return error('El Nº de coche es un número. Ej: 271');
    cambio.numero = v ? parseInt(v, 10) : null;
    if (cambio.numero && estado.filas.some(x => x.id !== a.id && completa(x) && x.numero === cambio.numero)) return error(`El Nº ${cambio.numero} ya está en la planilla.`);
  } else if (a.campo === 'cat') {
    let c = elegido?.valor;
    if (!c && v) c = estado.clases.find(x => normal(x.codigo) === normal(v) || normal(x.nombre) === normal(v)) || (() => { const l = estado.clases.filter(x => normal(x.codigo).startsWith(normal(v))); return l.length === 1 ? l[0] : null; })();
    if (v && !c) return error('Esa clase no está habilitada en este rally: elegí una de la lista.');
    cambio.cat = c ? c.id : null;
  } else if (a.campo === 'pil' || a.campo === 'nav') {
    const p = elegido?.valor;
    const nombre = p ? `${p.n} ${p.a}`.trim() : v;
    const [n, ap] = p ? [p.n, p.a] : partir(v);
    if (a.campo === 'pil') {
      if (!nombre && f && f.enServidor) return error('El piloto no puede quedar vacío. Para quitar la fila usá 🗑.');
      if (nombre && estado.filas.some(x => x.id !== a.id && completa(x) && normal(x.piloto) === normal(nombre))) return error(`${nombre} ya está inscrito en esta planilla.`);
      Object.assign(cambio, { piloto: nombre, pN: n, pA: ap });
    } else Object.assign(cambio, { nav: nombre, nN: n, nA: ap });
    if (p?.pais && !(f?.pais)) cambio.pais = p.pais;
  } else if (a.campo === 'pais') {
    const p = elegido?.valor || (v ? (PAISES.find(x => normal(x) === normal(v)) || PAISES.filter(x => normal(x).startsWith(normal(v)))[0]) : '');
    if (v && !p) return error('Elegí un país de la lista.');
    cambio.pais = p ? String(p).toUpperCase() : '';
  } else if (a.campo === 'ciu') cambio.ciudad = v.toUpperCase();

  estado.editando = false;
  cerrarSug();
  if (!f) {
    // Primera celda de la fila nueva: nace la fila (con los campeonatos de la última cargada).
    const vacio = Object.values(cambio).every(x => x == null || x === '');
    if (vacio) { td.textContent = ''; return true; }
    const ultima = [...estado.filas].sort((x, y) => y.creado - x.creado)[0];
    f = { id: nuevoId(), numero: null, cat: null, piloto: '', nav: '', pais: '', ciudad: '', amb: ultima ? [...(ultima.amb || [])] : estado.ambitos.map(x => x.id), creado: Date.now(), enServidor: false };
    estado.filas.push(f);
    estado.activa = { id: f.id, campo: a.campo };
  }
  const antes = JSON.stringify(f);
  Object.assign(f, cambio);
  if (JSON.stringify(f) === antes) { dibujar(); return true; }
  anotar(f.id, 'guardar');
  guardarCopiaLocal();
  dibujar();
  guardar(f.id);
  return true;
}

function alternarAmbito(id, ambId) {
  const f = estado.filas.find(x => x.id === id);
  if (!f) return;
  f.amb = (f.amb || []).includes(ambId) ? f.amb.filter(x => x !== ambId) : [...(f.amb || []), ambId];
  anotar(f.id, 'guardar'); guardarCopiaLocal(); dibujar(); guardar(f.id);
}
function marcarTodos(ambId) {
  const a = estado.ambitos.find(x => x.id === ambId);
  const validas = estado.filas.filter(completa);
  if (!validas.length) return toast('Todavía no hay inscritos para marcar.', true);
  const todos = validas.every(f => (f.amb || []).includes(ambId));
  if (!confirm(`¿${todos ? 'Quitar' : 'Marcar'} ${a.nombre} (${a.codigo}) ${todos ? 'a' : 'para'} los ${validas.length} inscritos?`)) return;
  const cambiadas = validas.filter(f => (f.amb || []).includes(ambId) === todos);
  for (const f of cambiadas) { f.amb = todos ? f.amb.filter(x => x !== ambId) : [...(f.amb || []), ambId]; anotar(f.id, 'guardar'); }
  guardarCopiaLocal(); dibujar();
  cambiadas.forEach(f => guardar(f.id));
  toast(`${a.codigo}: ${todos ? 'quitado' : 'marcado'} en ${cambiadas.length} fila(s).`);
}

async function quitarFila(id) {
  const f = estado.filas.find(x => x.id === id);
  if (!f) return;
  if (completa(f) && !confirm(`¿Borrar la inscripción del Nº ${f.numero} (${f.piloto})?`)) return;
  estado.filas = estado.filas.filter(x => x.id !== id);
  if (!f.enServidor && !estado.guardando.has(id)) quitarPend(id);
  else { anotar(id, 'borrar'); guardar(id); }
  if (estado.activa?.id === id) estado.activa = null;
  guardarCopiaLocal(); dibujar();
}

// ------------------------------------------------------------------
// Guardar en el servidor (una cola por fila, para no pisarse)
// ------------------------------------------------------------------
const cadenas = new Map();
function guardar(id) {
  const p = (cadenas.get(id) || Promise.resolve()).then(() => guardarAhora(id)).catch(() => false);
  cadenas.set(id, p);
  return p;
}
async function guardarAhora(id) {
  const x = pendDe(id);
  if (!x) return true;
  if (x.error) return false;
  if (x.op === 'guardar' && !completa(x.fila)) return false; // todavía incompleta: queda en el equipo
  if (!enLinea()) { estadoBarra(); return false; }
  estado.guardando.set(id, 'guardando'); pintarFila(id);
  try {
    if (x.op === 'borrar') {
      const { error } = await supabase.rpc('planilla_inscripcion_borrar', { p_id: id });
      if (error) throw error;
    } else {
      const f = x.fila;
      const [pN, pA] = f.pN != null && f.pA != null && `${f.pN} ${f.pA}`.trim() === f.piloto ? [f.pN, f.pA] : partir(f.piloto);
      const [nN, nA] = f.nav ? (f.nN != null && f.nA != null && `${f.nN} ${f.nA}`.trim() === f.nav ? [f.nN, f.nA] : partir(f.nav)) : ['', ''];
      const { data, error } = await supabase.rpc('planilla_inscripcion_guardar', {
        p_id: id, p_rally_id: estado.rally.id, p_categoria_id: f.cat, p_numero: f.numero,
        p_piloto: f.piloto, p_piloto_nombre: pN, p_piloto_apellido: pA,
        p_navegante: f.nav || '', p_nav_nombre: nN, p_nav_apellido: nA,
        p_pais: f.pais || '', p_asociacion: f.ciudad || '', p_ambito_ids: (f.amb || []).filter(a => estado.ambitos.some(z => z.id === a)),
      });
      if (error) throw error;
      const actual = estado.filas.find(z => z.id === id);
      if (actual && data) {
        actual.enServidor = true;
        // Si no se cambió mientras subía, queda con el nombre tal como está en el sistema.
        if (actual.piloto === f.piloto && data.piloto) { actual.piloto = nombreCompleto(data.piloto); actual.pN = data.piloto.nombre; actual.pA = data.piloto.apellido; }
        if (actual.nav === f.nav && data.navegante) { actual.nav = nombreCompleto(data.navegante); actual.nN = data.navegante.nombre; actual.nA = data.navegante.apellido; }
        if (data.creado) actual.creado = Date.parse(data.creado);
      }
      sumarPersona(f);
    }
    estado.guardando.delete(id);
    quitarPend(id, x.ts);
    estado.ultimoGuardado = new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    guardarCopiaLocal();
    if (!estado.editando) dibujar(); else pintarFila(id);
    document.querySelector(`.in-tabla tr[data-id="${CSS.escape(id)}"]`)?.classList.add('ok');
    // Si mientras subía se volvió a cambiar, se sube lo nuevo.
    if (pendDe(id)) guardar(id);
    return true;
  } catch (e) {
    estado.guardando.delete(id);
    if (esErrorDeRed(e)) estado.sinConexion = true;
    else if (x.op === 'borrar') {
      // No se pudo borrar (por ejemplo, ya tiene tiempos): la fila vuelve a aparecer.
      quitarPend(id);
      toast('No se borró: ' + (e.message || e), true);
      recargarDelServidor();
      return false;
    } else { anotar(id, x.op, e.message || String(e)); toast('No se pudo guardar el Nº ' + (x.fila?.numero ?? '') + ': ' + (e.message || e), true); }
    if (!estado.editando) dibujar(); else pintarFila(id);
    return false;
  }
}
function pintarFila(id) {
  const tr = document.querySelector(`.in-tabla tr[data-id="${CSS.escape(id)}"]`);
  const f = estado.filas.find(x => x.id === id);
  if (!tr || !f) return;
  tr.classList.remove('borrador', 'espera', 'guardando', 'error', 'ok');
  const m = marcaFila(f); if (m) tr.classList.add(m);
  estadoBarra();
}
function sumarPersona(f) {
  const agregar = (nombre, n, a, rol) => {
    if (!nombre) return;
    const p = estado.personas.find(x => normal(`${x.n} ${x.a}`) === normal(nombre));
    if (p) { if (!p.roles.includes(rol)) p.roles.push(rol); return; }
    estado.personas.push({ n, a, pais: f.pais || '', roles: [rol] });
  };
  agregar(f.piloto, f.pN || partir(f.piloto)[0], f.pA ?? partir(f.piloto)[1], 'P');
  agregar(f.nav, f.nN || partir(f.nav)[0], f.nA ?? partir(f.nav)[1], 'N');
  if (f.ciudad && !estado.ciudades.includes(f.ciudad)) estado.ciudades.push(f.ciudad);
  try { localStorage.setItem('insc_personas_v1', JSON.stringify(estado.personas)); } catch (e) { }
}

let sincronizando = false;
async function sincronizar() {
  if (sincronizando || !estado.rally || !enLinea()) { estadoBarra(); return; }
  const lista = pendientes().filter(x => !x.error && (x.op === 'borrar' || completa(x.fila)));
  if (!lista.length) { estadoBarra(); return; }
  sincronizando = true;
  let subidas = 0;
  for (const x of lista) {
    if (await guardar(x.id) === true) subidas++;
    if (!enLinea()) break;
  }
  sincronizando = false;
  if (subidas) toast(`✓ Sincronizado: ${subidas} fila${subidas > 1 ? 's' : ''} subida${subidas > 1 ? 's' : ''}.`);
  estadoBarra();
}
// Al volver internet se suben las filas y, si se estaba viendo la copia del equipo, se recarga del servidor.
window.addEventListener('online', async () => {
  estado.sinConexion = false;
  await sincronizar();
  if (estado.copiaDe && estado.rally && !estado.editando) { clearInterval(estado.timer); cargarRally(estado.rally.id); }
});
window.addEventListener('offline', () => { estado.sinConexion = true; estadoBarra(); });

function verError(id) {
  const x = pendDe(id);
  if (!x?.error) return;
  const d = dialogo(`<h3>No se pudo guardar</h3><p>${esc(x.error)}</p>
    <p>Corregí la fila (por ejemplo el Nº o el nombre) y se vuelve a intentar sola, o reintentá así como está.</p>
    <div class="acciones"><button type="button" class="pl-btn" data-cerrar>Cerrar</button>
    ${x.op === 'borrar' ? '<button type="button" class="pl-btn" id="in-err-anular">No borrarla</button>' : '<button type="button" class="pl-btn" id="in-err-descartar">Descartar estos cambios</button>'}
    <button type="button" class="pl-btn primario" id="in-err-reintentar">Reintentar</button></div>`);
  d.querySelector('#in-err-reintentar').onclick = () => { d.remove(); const p = leerPend(); p[clavePend(id)].error = null; escribirPend(p); guardar(id).then(() => dibujar()); };
  d.querySelector('#in-err-descartar')?.addEventListener('click', async () => { d.remove(); quitarPend(id); await recargarDelServidor(); });
  d.querySelector('#in-err-anular')?.addEventListener('click', async () => { d.remove(); quitarPend(id); await recargarDelServidor(); });
}
async function recargarDelServidor() {
  try { await traerInscritos(); guardarCopiaLocal(); } catch (e) { aplicarPendientes(); }
  dibujar();
}

// ------------------------------------------------------------------
// Encabezado, firmas y opciones
// ------------------------------------------------------------------
function dialogo(html) {
  const f = document.createElement('div');
  f.className = 'pl-dialogo-fondo';
  f.innerHTML = `<div class="pl-dialogo" role="dialog" aria-modal="true">${html}</div>`;
  f.addEventListener('click', e => { if (e.target === f || e.target.closest('[data-cerrar]')) f.remove(); });
  document.body.appendChild(f);
  return f;
}
async function subirImagen(archivo) {
  const ext = (archivo.name?.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const ruta = `planillas/${estado.rally.id}/${nuevoId()}.${ext}`;
  const { error } = await supabase.storage.from('logo-sitio').upload(ruta, archivo, { upsert: false, contentType: archivo.type || 'image/png' });
  if (error) throw error;
  return supabase.storage.from('logo-sitio').getPublicUrl(ruta).data.publicUrl;
}
function abrirConfig() {
  if (!enLinea()) return toast('Para cambiar el encabezado y las firmas hace falta internet.', true);
  const c = cfg();
  const propio = !!estado.cfgInsc;
  const b = JSON.parse(JSON.stringify({ titulo_lista: c.tituloLista, fecha: c.fecha, hora: c.hora, mostrar_ciudad: c.mostrarCiudad, papel: c.papel, firmas: c.firmas }));
  const d = dialogo(`
    <h3>Encabezado y firmas</h3>
    <p>Los <b>títulos y logos</b> son los mismos de la Planilla de Tiempos (se cambian en su ⚙). Acá van las opciones de la lista de inscritos.</p>
    <div class="pl-formato-ok" style="margin-top:0;"><span>${propio ? 'Este rally tiene un <b>formato propio</b>.' : 'Este rally usa el <b>formato por defecto</b>.'}</span></div>
    <label>Título de la lista</label><input type="text" id="in-c-titulo" value="${esc(b.titulo_lista)}">
    <div class="fila"><div><label>Fecha de publicación</label><input type="text" id="in-c-fecha" placeholder="Vacío = la fecha del día (${esc(fechaHoy())})" value="${esc(b.fecha)}"></div>
    <div><label>Hora de publicación</label><input type="text" id="in-c-hora" placeholder="Vacío = la hora al descargar" value="${esc(b.hora)}"></div></div>
    <label class="chk"><input type="checkbox" id="in-c-ciudad" ${b.mostrar_ciudad ? 'checked' : ''}> Mostrar la columna <b>CIUDAD</b></label>
    <label>Hoja para imprimir (vertical)</label>
    <select id="in-c-papel"><option value="carta" ${b.papel === 'carta' ? 'selected' : ''}>Carta (21,6 × 27,9 cm)</option><option value="oficio" ${b.papel === 'oficio' ? 'selected' : ''}>Oficio (21,6 × 33 cm)</option></select>
    <div id="in-c-firmas"></div>
    <button type="button" class="pl-btn" id="in-c-mas" style="margin-top:10px;">+ Agregar firma</button>
    <div class="acciones">
      <button type="button" class="pl-btn" data-cerrar>Cancelar</button>
      ${propio ? '<button type="button" class="pl-btn" id="in-c-volver">Volver al formato por defecto</button>' : ''}
      <button type="button" class="pl-btn" id="in-c-defecto" title="Lo usan todos los rallies que no tengan formato propio">Guardar como formato por defecto</button>
      <button type="button" class="pl-btn primario" id="in-c-guardar">Guardar solo para este rally</button>
    </div>`);
  const juntar = () => {
    d.querySelectorAll('[data-firma]').forEach(i => { b.firmas[+i.dataset.firma][i.dataset.k] = i.value.trim(); });
    b.titulo_lista = d.querySelector('#in-c-titulo').value.trim() || DEF_INSC.titulo_lista;
    b.fecha = d.querySelector('#in-c-fecha').value.trim();
    b.hora = d.querySelector('#in-c-hora').value.trim();
    b.mostrar_ciudad = d.querySelector('#in-c-ciudad').checked;
    b.papel = d.querySelector('#in-c-papel').value;
    return b;
  };
  const pintarFirmas = () => {
    d.querySelector('#in-c-firmas').innerHTML = b.firmas.map((fi, i) => `<div class="grupo"><b>Firma ${i + 1}${b.firmas.length > 1 ? ` <button type="button" class="pl-btn" data-quitar-firma="${i}" style="float:right;padding:3px 9px;">Quitar</button>` : ''}</b>
      <div class="fila"><div><label>Nombre</label><input type="text" data-firma="${i}" data-k="nombre" value="${esc(fi.nombre || '')}" placeholder="Sr. ..."></div>
      <div><label>Cargo</label><input type="text" data-firma="${i}" data-k="cargo" value="${esc(fi.cargo || '')}" placeholder="DIRECTOR DE PRUEBA"></div></div>
      <label>Imagen de la firma (opcional)</label><div class="pl-img-prev">${fi.img ? `<span><img src="${esc(urlImagen(fi.img))}" alt=""><button type="button" data-sin-img="${i}">✕</button></span>` : ''}</div><input type="file" accept="image/*" data-firma-img="${i}"></div>`).join('');
    d.querySelector('#in-c-mas').hidden = b.firmas.length >= 3;
    d.querySelectorAll('[data-firma-img]').forEach(inp => inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      juntar(); inp.disabled = true;
      try { b.firmas[+inp.dataset.firmaImg].img = await subirImagen(f); pintarFirmas(); } catch (e) { toast('No se pudo subir la imagen: ' + e.message, true); inp.disabled = false; }
    });
  };
  pintarFirmas();
  d.querySelector('#in-c-mas').onclick = () => { juntar(); b.firmas.push({ nombre: '', cargo: '' }); pintarFirmas(); };
  d.addEventListener('click', e => {
    const q = e.target.closest('[data-quitar-firma]'); if (q) { juntar(); b.firmas.splice(+q.dataset.quitarFirma, 1); pintarFirmas(); }
    const s = e.target.closest('[data-sin-img]'); if (s) { juntar(); b.firmas[+s.dataset.sinImg].img = ''; pintarFirmas(); }
  });
  const guardarFormato = async (clave, config) => {
    const { error } = await db().from('planilla_formato').upsert({ clave, config, updated_at: new Date().toISOString() });
    if (error) { toast('No se pudo guardar: ' + error.message, true); return false; }
    return true;
  };
  d.querySelector('#in-c-guardar').onclick = async () => {
    const config = juntar();
    if (!(await guardarFormato('inscripcion:' + estado.rally.id, config))) return;
    estado.cfgInsc = config; guardarCopiaLocal(); d.remove(); dibujar(); toast('Guardado solo para este rally.');
  };
  d.querySelector('#in-c-defecto').onclick = async () => {
    if (!confirm('¿Usar estas opciones y firmas como formato por defecto de TODOS los rallies que no tengan formato propio?')) return;
    const config = juntar();
    if (!(await guardarFormato('inscripcion', config))) return;
    if (estado.cfgInsc) await guardarFormato('inscripcion:' + estado.rally.id, {});
    estado.defInsc = config; estado.cfgInsc = null; guardarCopiaLocal(); d.remove(); dibujar(); toast('Formato por defecto guardado.');
  };
  d.querySelector('#in-c-volver')?.addEventListener('click', async () => {
    if (!(await guardarFormato('inscripcion:' + estado.rally.id, {}))) return;
    estado.cfgInsc = null; guardarCopiaLocal(); d.remove(); dibujar(); toast('Este rally vuelve a usar el formato por defecto.');
  });
}

// ------------------------------------------------------------------
// Excel con el formato de la lista de inscritos oficial (inscripcion.xlsx)
// ------------------------------------------------------------------
const EMU = 9525;
async function imagenParaExcel(wb, url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const blob = await r.blob();
    const ext = /png/.test(blob.type) ? 'png' : /gif/.test(blob.type) ? 'gif' : 'jpeg';
    const buffer = await blob.arrayBuffer();
    const dim = await new Promise(res => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ w: 300, h: 150 }); im.src = URL.createObjectURL(blob); });
    return { id: wb.addImage({ buffer, extension: ext }), ...dim };
  } catch (e) { return null; }
}

async function descargarExcel() {
  if (!window.ExcelJS) return toast('Todavía está cargando el generador de Excel, probá en un segundo.', true);
  if (!estado.rally) return;
  const btn = $('pl-excel'); btn.disabled = true; btn.textContent = 'Generando…';
  try {
    const c = cfg();
    const o = ordenadas();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'AMADESU RALLYS';
    const ws = wb.addWorksheet('INSCRITOS', {
      views: [{ state: 'frozen', ySplit: 8, showGridLines: false }],
      pageSetup: { orientation: 'portrait', paperSize: c.papel === 'oficio' ? 14 : 1, fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, margins: { left: 0.43, right: 0.43, top: 0.59, bottom: 0.59, header: 0.3, footer: 0.3 } },
      headerFooter: { oddFooter: '&L&8AMADESU RALLYS — Lista de inscritos&R&8Página &P de &N' },
    });
    const F = (name, size, extra = {}) => ({ name, size, ...extra });
    const borde = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    const centro = { horizontal: 'center', vertical: 'middle', wrapText: true };
    const anchos = [5.7, 6.3, 12.3, 17.3, 76.1, 11.3, 13.7];
    ws.columns = anchos.map(w => ({ width: w }));
    const N = 7;

    // Encabezado (filas 1 a 7), como el original
    [23.1, 23.1, 19.5, 22.95, 6, 22.2, 26.4, 30].forEach((h, i) => { ws.getRow(i + 1).height = h; });
    // Los títulos con texto van seguidos desde la fila 1 (sin huecos), como el original.
    c.titulos.filter(Boolean).concat(['', '', '', '']).slice(0, 4).forEach((t, i) => {
      ws.mergeCells(i + 1, 1, i + 1, N);
      const cel = ws.getCell(i + 1, 1);
      cel.value = t || null; cel.font = F('Cambria', 16, { bold: true }); cel.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    ws.getCell('A6').value = textoFecha(c); ws.getCell('A6').font = F('Cambria', 11);
    const lista = ws.getCell('E6');
    lista.value = c.tituloLista; lista.font = F('Cambria', 16, { bold: true });
    lista.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF99' } }; lista.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.mergeCells('B7:D7');
    ws.getCell('B7').value = 'Hora de publicación: '; ws.getCell('B7').font = F('Cambria', 11); ws.getCell('B7').alignment = { horizontal: 'right', vertical: 'middle' };
    const hora = ws.getCell('E7');
    const hh = textoHora(c).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (hh) { hora.value = ((+hh[1] * 60 + +hh[2]) * 60 + (+hh[3] || 0)) / 86400; hora.numFmt = 'h:mm'; } else hora.value = textoHora(c);
    hora.font = F('Cambria', 12, { italic: true }); hora.alignment = { horizontal: 'left', vertical: 'middle' };

    const titulos = [['Psto.', 11], ['Nº', 11], ['Nº DE COCHE', 12], ['CLASE', 11], ['PILOTO / NAVEGANTE', 14], [c.mostrarCiudad ? 'CIUDAD' : '', 12], ['', 11]];
    titulos.forEach(([t, s], i) => {
      const cel = ws.getCell(8, i + 1);
      cel.value = t || null; cel.font = F('Cambria', s, { bold: true, color: { argb: 'FFFFFFFF' } });
      cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } }; cel.border = borde; cel.alignment = centro;
    });

    // Filas: por clase, con una fila gris entre clases
    let r = 9, anterior = null;
    const gris = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    const blanco = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    for (const f of o.porClase) {
      const cl = nombreClase(f);
      if (anterior !== null && cl !== anterior) {
        ws.getRow(r).height = 21.6;
        for (let k = 1; k <= N; k++) { const cel = ws.getCell(r, k); cel.fill = gris; cel.border = borde; }
        r++;
      }
      anterior = cl;
      ws.getRow(r).height = 21.9;
      const piloto = String(f.piloto || '').toUpperCase(), nav = String(f.nav || '').toUpperCase();
      const valores = [
        [o.psto.get(f.id), F('Cambria', 11, { bold: true })],
        [o.nro.get(f.id), F('Cambria', 11, { bold: true })],
        [Number(f.numero) || f.numero, F('Calibri', 18)],
        [cl, F('Calibri', 14)],
        [nav ? `${piloto} // ${nav}` : piloto, F('Calibri', 14)],
        [c.mostrarCiudad ? (f.ciudad || null) : null, F('Cambria', 12, { bold: true })],
        [null, F('Cambria', 12, { bold: true })],
      ];
      valores.forEach(([v, font], k) => {
        const cel = ws.getCell(r, k + 1);
        cel.value = v ?? null; cel.font = font; cel.fill = blanco; cel.border = borde; cel.alignment = centro;
      });
      r++;
    }

    // Firmas: 5 filas abajo del último inscrito (una en E; varias, repartidas)
    const filaFirma = r + 4;
    const lugares = c.firmas.length === 1 ? [[5, 5]] : c.firmas.length === 2 ? [[1, 4], [6, 7]] : [[1, 4], [5, 5], [6, 7]];
    c.firmas.forEach((fi, k) => {
      const [c1, c2] = lugares[k];
      if (c2 > c1) { ws.mergeCells(filaFirma, c1, filaFirma, c2); ws.mergeCells(filaFirma + 1, c1, filaFirma + 1, c2); }
      const n = ws.getCell(filaFirma, c1), cg = ws.getCell(filaFirma + 1, c1);
      n.value = fi.nombre || null; n.font = F('Cambria', 12); n.alignment = { horizontal: 'center' };
      cg.value = fi.cargo || null; cg.font = F('Calibri', 11, { bold: true }); cg.alignment = { horizontal: 'center', vertical: 'top' };
    });
    ws.getRow(filaFirma).height = 20.1;

    // Logos: evento a la izquierda (A1→D5), fijos a la derecha (E→G), extras al medio
    const anchosPx = anchos.map(w => Math.round(w * 7 + 5));
    const altosPx = [23.1, 23.1, 19.5, 22.95, 6, 22.2, 26.4].map(h => Math.round(h * 96 / 72));
    const celdaX = px => { let col = 0; while (col < anchosPx.length - 1 && px >= anchosPx[col]) { px -= anchosPx[col]; col++; } return { col, off: px }; };
    const celdaY = px => { let row = 0; while (row < altosPx.length - 1 && px >= altosPx[row]) { px -= altosPx[row]; row++; } return { row, off: px }; };
    const totalAncho = anchosPx.reduce((a, b2) => a + b2, 0);
    const dz = disenoCabecera(c);
    const fallaron = [];
    const ponerEnCaja = async (caja, x0, y0) => {
      const im = await imagenParaExcel(wb, caja.url);
      if (!im) { fallaron.push(caja.url); return; }
      const margen = 3, escala = Math.min((caja.w - 2 * margen) / im.w, (caja.h - 2 * margen) / im.h);
      const w = Math.max(4, Math.round(im.w * escala)), h = Math.max(4, Math.round(im.h * escala));
      const x1 = x0 + caja.x + (caja.w - w) / 2, y1 = y0 + caja.y + (caja.h - h) / 2;
      const a = celdaX(x1), b2 = celdaY(y1), c2 = celdaX(x1 + w), d2 = celdaY(y1 + h);
      ws.addImage(im.id, {
        tl: { nativeCol: a.col, nativeColOff: Math.round(a.off * EMU), nativeRow: b2.row, nativeRowOff: Math.round(b2.off * EMU) },
        br: { nativeCol: c2.col, nativeColOff: Math.round(c2.off * EMU), nativeRow: d2.row, nativeRowOff: Math.round(d2.off * EMU) },
        editAs: 'oneCell',
      });
    };
    for (const caja of dz.ev) await ponerEnCaja(caja, 0, 4);
    for (const caja of dz.extras) await ponerEnCaja(caja, totalAncho - 250 - dz.anchoExtras - 6, 14);
    for (const caja of dz.fijos) await ponerEnCaja(caja, totalAncho - 246, 4);
    for (const [k, fi] of c.firmas.entries()) {
      if (!fi.img) continue;
      const im = await imagenParaExcel(wb, urlImagen(fi.img));
      if (!im) { fallaron.push(fi.img); continue; }
      const alto = 80, ancho = Math.round(im.w * (alto / im.h));
      const [c1, c2] = lugares[k];
      const xCentro = anchosPx.slice(0, c1 - 1).reduce((a, b2) => a + b2, 0) + anchosPx.slice(c1 - 1, c2).reduce((a, b2) => a + b2, 0) / 2;
      const p = celdaX(Math.max(0, xCentro - ancho / 2));
      ws.addImage(im.id, { tl: { nativeCol: p.col, nativeColOff: Math.round(p.off * EMU), nativeRow: filaFirma - 4, nativeRowOff: 0 }, ext: { width: ancho, height: alto }, editAs: 'oneCell' });
    }
    if (fallaron.length) setTimeout(() => toast(`${fallaron.length} logo(s) no se pudieron poner en el Excel: revisá que el enlace de Drive sea público.`, true), 1500);

    ws.pageSetup.printArea = `A1:G${filaFirma + 2}`;
    ws.pageSetup.printTitlesRow = '8:8';
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `INSCRITOS - ${estado.rally.nombre.replace(/[\\/:*?"<>|]/g, '')}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    const borradores = o.borradores.length;
    toast(borradores ? `Excel descargado. ${borradores} fila(s) incompleta(s) no salen en el Excel.` : 'Excel descargado.', !!borradores);
  } catch (e) {
    toast('No se pudo generar el Excel: ' + (e.message || e), true);
  } finally {
    btn.disabled = false; btn.textContent = '⬇ Descargar Excel';
  }
}

// ------------------------------------------------------------------
// Muchos de una vez: pegar desde Excel, plantilla para llenar y subir Excel
// ------------------------------------------------------------------
// Orden de las columnas de la hoja (para pegar "por posición", como en Excel).
const columnasOrden = () => ['num', 'cat', 'pil', 'nav', 'pais'].concat(cfg().mostrarCiudad ? ['ciu'] : []).concat(estado.ambitos.map(a => 'amb:' + a.id));
const sinEspacios = s => normal(s).replace(/\s/g, '');
function claseDesdeTexto(t) {
  const n = sinEspacios(t);
  if (!n) return null;
  const exacta = estado.clases.find(c => sinEspacios(c.codigo) === n || sinEspacios(c.nombre) === n);
  if (exacta) return exacta;
  // "PROMO" -> PROMOCIONAL, "BUGUIE" -> BUGUIES (solo si hay una sola que empieza así)
  const l = estado.clases.filter(c => sinEspacios(c.codigo).startsWith(n) || sinEspacios(c.nombre).startsWith(n));
  return l.length === 1 ? l[0] : null;
}
function paisDesdeTexto(t) {
  const n = normal(t);
  if (!n) return '';
  const p = PAISES.find(x => normal(x) === n) || (PAISES.filter(x => normal(x).startsWith(n)).length === 1 ? PAISES.find(x => normal(x).startsWith(n)) : null);
  return p ? p.toUpperCase() : '';
}
const marcado = (t, a) => { const n = normal(t); return !!n && (/^(x|si|s|1|ok|true|yes|✓|✔|☑)$/.test(n) || n === normal(a.codigo) || n === normal(a.nombre)); };
// "LUIS SANDOVAL" -> "Luis Sandoval" (solo si viene todo en mayúsculas)
const capitalizar = s => s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : s;
function persona(t) {
  const v = String(t || '').replace(/\s+/g, ' ').trim();
  if (!v) return { nombre: '', n: '', a: '' };
  const p = estado.personas.find(x => normal(`${x.n} ${x.a}`) === normal(v));
  if (p) return { nombre: `${p.n} ${p.a}`.trim(), n: p.n, a: p.a, pais: p.pais };
  const nombre = capitalizar(v);
  const [n, a] = partir(nombre);
  return { nombre, n, a };
}
const textoCelda = v => {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v instanceof Date) return '';
    if (v.richText) return v.richText.map(x => x.text).join('');
    if (v.result != null) return String(v.result);
    if (v.text != null) return String(v.text);
    return '';
  }
  return String(v);
};

// Fila de títulos -> qué columna es cada cosa. Sirve para la plantilla y
// para la lista de inscritos oficial ("PILOTO / NAVEGANTE" en una celda).
function mapaTitulos(fila) {
  const m = { amb: {} };
  const limpio = t => normal(t).replace(/[.:º°#]/g, '').trim();
  fila.forEach((t, i) => {
    const h = limpio(t);
    if (!h) return;
    if (h.includes('piloto') && h.includes('naveg')) m.pn = i;
    else if (h.includes('piloto')) m.pil = i;
    else if (h.includes('naveg') || h.includes('copiloto')) m.nav = i;
    else if (h.includes('coche') || h.includes('auto') || h.includes('vehic') || h === 'dorsal') m.num = i;
    else if (h.includes('clase') || h.includes('categ')) m.cat = i;
    else if (h.includes('pais')) m.pais = i;
    else if (h.includes('ciudad') || h.includes('asoc')) m.ciu = i;
    else { const a = estado.ambitos.find(x => h === normal(x.codigo) || h === normal(x.nombre)); if (a) m.amb[i] = a.id; }
  });
  if (m.num == null) fila.forEach((t, i) => { if (m.num == null && ['n', 'nro', 'numero', 'no'].includes(limpio(t))) m.num = i; });
  const reconocidas = ['pil', 'pn', 'num', 'cat'].filter(k => m[k] != null).length;
  return (m.pil != null || m.pn != null) && reconocidas >= 2 ? m : null;
}
function crudaPorTitulos(vals, m) {
  const r = { campos: new Set() };
  const put = (k, i) => { if (i != null) { r[k] = vals[i] ?? ''; r.campos.add(k); } };
  put('num', m.num); put('cat', m.cat); put('pil', m.pil); put('nav', m.nav); put('pais', m.pais); put('ciu', m.ciu);
  if (m.pn != null) {
    const [p, n] = String(vals[m.pn] ?? '').split('//');
    r.pil = p || ''; r.nav = n || ''; r.campos.add('pil'); r.campos.add('nav');
  }
  const ambs = Object.entries(m.amb);
  if (ambs.length) { r.amb = {}; ambs.forEach(([i, id]) => { r.amb[id] = marcado(vals[i], estado.ambitos.find(a => a.id === id)); }); }
  return r;
}
function crudaPorPosicion(vals, inicio) {
  const orden = columnasOrden();
  const r = { campos: new Set() };
  let k = inicio;
  for (const v of vals) {
    const campo = orden[k];
    if (!campo) break;
    if (campo === 'pil' && String(v).includes('//')) {
      const [p, n] = String(v).split('//');
      r.pil = p; r.nav = n; r.campos.add('pil'); r.campos.add('nav'); k += 2; continue;
    }
    // Lo que cae en "País" pero no es un país (ej. SUCRE) es la ciudad, como en la lista oficial.
    if (campo === 'pais' && String(v).trim() && !paisDesdeTexto(v) && orden[k + 1] === 'ciu') { r.ciu = v; r.campos.add('ciu'); k += 2; continue; }
    if (campo.startsWith('amb:')) { const a = estado.ambitos.find(x => x.id === campo.slice(4)); (r.amb ||= {})[a.id] = marcado(v, a); }
    else { r[campo] = v; r.campos.add(campo); }
    k++;
  }
  return r;
}

// Datos crudos -> fila lista para la hoja (con lo que falte anotado).
function convertir(r) {
  const out = { campos: r.campos, problemas: [] };
  if (r.campos.has('num')) {
    const n = parseInt(String(r.num).replace(/[^\d.]/g, ''), 10);
    out.numero = Number.isFinite(n) && n > 0 ? n : null;
  }
  if (r.campos.has('cat')) {
    const c = claseDesdeTexto(r.cat);
    out.cat = c ? c.id : null;
    if (String(r.cat || '').trim() && !c) out.problemas.push(`la clase "${String(r.cat).trim()}" no está habilitada en este rally`);
  }
  if (r.campos.has('pil')) { const p = persona(r.pil); out.piloto = p.nombre; out.pN = p.n; out.pA = p.a; out.paisPersona = p.pais; }
  if (r.campos.has('nav')) { const p = persona(r.nav); out.nav = p.nombre; out.nN = p.n; out.nA = p.a; }
  if (r.campos.has('pais')) {
    out.pais = paisDesdeTexto(r.pais);
    if (String(r.pais || '').trim() && !out.pais) out.problemas.push(`país "${String(r.pais).trim()}" no reconocido (quedó vacío)`);
  }
  if (r.campos.has('ciu')) out.ciudad = String(r.ciu || '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (r.amb) out.amb = r.amb;
  return out;
}
// Filas de separación, títulos repetidos y firmas no son inscritos.
const esVacia = r => !r.numero && !r.piloto && !r.cat;

// Arma el plan: qué filas se crean, cuáles se actualizan y cuáles no se pueden usar.
function planificar(convertidas, destinos = []) {
  const plan = [];
  const usados = new Set();
  convertidas.forEach((r, i) => {
    // Separadores y firmas (un nombre suelto sin Nº ni clase) no son inscritos;
    // pero sí vale pegar solo nombres encima de filas que ya existen.
    const traeNumOClase = r.campos.has('num') || r.campos.has('cat');
    if (esVacia(r) || (traeNumOClase && !r.numero && !r.cat && !destinos[i])) return;
    let destino = destinos[i] ? estado.filas.find(f => f.id === destinos[i]) : null;
    if (!destino && r.numero) destino = estado.filas.find(f => f.numero === r.numero);
    const etiqueta = `Nº ${r.numero ?? '?'}${r.piloto ? ' · ' + r.piloto : ''}`;
    if (r.numero && usados.has(r.numero)) { plan.push({ r, etiqueta, saltar: 'el Nº está repetido en lo que pegaste/subiste' }); return; }
    if (r.numero) usados.add(r.numero);
    const piloto = r.piloto ?? destino?.piloto;
    const otro = piloto && estado.filas.find(f => f !== destino && completa(f) && normal(f.piloto) === normal(piloto));
    if (otro) { plan.push({ r, etiqueta, saltar: `${piloto} ya está inscrito con el Nº ${otro.numero}` }); return; }
    const faltan = [];
    if (!(r.numero ?? destino?.numero)) faltan.push('Nº de coche');
    if (!(r.cat ?? destino?.cat)) faltan.push('clase');
    if (!piloto) faltan.push('piloto');
    plan.push({ r, etiqueta, destino, faltan, problemas: r.problemas });
  });
  return plan;
}

function aplicarPlan(plan) {
  const ultima = [...estado.filas].sort((x, y) => y.creado - x.creado)[0];
  const ambDefecto = ultima ? [...(ultima.amb || [])] : estado.ambitos.map(x => x.id);
  let t = Date.now(), nuevas = 0, cambiadas = 0;
  for (const p of plan) {
    if (p.saltar) continue;
    const r = p.r;
    let f = p.destino;
    if (!f) { f = { id: nuevoId(), numero: null, cat: null, piloto: '', nav: '', pais: '', ciudad: '', amb: [...ambDefecto], creado: t++, enServidor: false }; estado.filas.push(f); nuevas++; }
    else cambiadas++;
    if (r.campos.has('num') && r.numero) f.numero = r.numero;
    if (r.campos.has('cat') && r.cat) f.cat = r.cat;
    if (r.campos.has('pil') && r.piloto) Object.assign(f, { piloto: r.piloto, pN: r.pN, pA: r.pA });
    if (r.campos.has('nav')) Object.assign(f, { nav: r.nav, nN: r.nN, nA: r.nA });
    if (r.campos.has('pais') && r.pais) f.pais = r.pais;
    else if (!f.pais && r.paisPersona) f.pais = r.paisPersona;
    if (r.campos.has('ciu')) f.ciudad = r.ciudad;
    if (r.amb) {
      const s = new Set(f.amb || []);
      Object.entries(r.amb).forEach(([id, si]) => si ? s.add(id) : s.delete(id));
      f.amb = [...s];
    }
    anotar(f.id, 'guardar');
  }
  guardarCopiaLocal();
  estado.activa = null;
  dibujar();
  sincronizar();
  return { nuevas, cambiadas };
}

// Resumen antes de importar: así se ve qué va a pasar con cada fila.
function confirmarImportacion(plan, origen) {
  const usar = plan.filter(p => !p.saltar);
  const nuevas = usar.filter(p => !p.destino).length, actualiza = usar.length - nuevas;
  const incompletas = usar.filter(p => p.faltan.length);
  const avisos = usar.filter(p => p.problemas.length);
  const saltadas = plan.filter(p => p.saltar);
  if (!plan.length) { toast('No se encontraron inscritos en lo que ' + (origen === 'pegar' ? 'pegaste.' : 'subiste.'), true); return; }
  const li = (lista, txt) => lista.length ? `<ul class="pl-lista-penal">${lista.slice(0, 40).map(p => `<li><span><b>${esc(p.etiqueta)}</b> · ${esc(txt(p))}</span></li>`).join('')}${lista.length > 40 ? `<li>… y ${lista.length - 40} más</li>` : ''}</ul>` : '';
  const d = dialogo(`
    <h3>${origen === 'pegar' ? 'Pegar desde Excel' : 'Subir Excel'}</h3>
    <p>Se encontraron <b>${plan.length}</b> fila${plan.length > 1 ? 's' : ''} de inscritos.</p>
    <div class="pl-formato-ok" style="margin-top:0; display:block;">
      ${nuevas ? `✓ <b>${nuevas}</b> ${nuevas > 1 ? 'inscripciones nuevas' : 'inscripción nueva'}<br>` : ''}
      ${actualiza ? `✓ <b>${actualiza}</b> ya estaba${actualiza > 1 ? 'n' : ''} (mismo Nº): se actualiza${actualiza > 1 ? 'n' : ''} con lo nuevo<br>` : ''}
      ${!usar.length ? 'Ninguna fila se puede usar.' : ''}
    </div>
    ${incompletas.length ? `<div class="grupo"><b>⚠ ${incompletas.length} quedan incompletas (se agregan abajo para que las completes)</b>${li(incompletas, p => 'falta ' + p.faltan.join(', ') + (p.problemas.length ? ' — ' + p.problemas.join('; ') : ''))}</div>` : ''}
    ${avisos.filter(p => !p.faltan.length).length ? `<div class="grupo"><b>Avisos</b>${li(avisos.filter(p => !p.faltan.length), p => p.problemas.join('; '))}</div>` : ''}
    ${saltadas.length ? `<div class="grupo"><b>✕ ${saltadas.length} no se importan</b>${li(saltadas, p => p.saltar)}</div>` : ''}
    <div class="acciones"><button type="button" class="pl-btn" data-cerrar>Cancelar</button>
    ${usar.length ? `<button type="button" class="pl-btn primario" id="in-imp-ok">Importar ${usar.length} fila${usar.length > 1 ? 's' : ''}</button>` : ''}</div>`);
  d.querySelector('#in-imp-ok')?.addEventListener('click', () => {
    d.remove();
    const { nuevas: n, cambiadas: c } = aplicarPlan(plan);
    toast(`Listo: ${n} nueva${n === 1 ? '' : 's'}${c ? `, ${c} actualizada${c === 1 ? '' : 's'}` : ''}.${enLinea() ? ' Subiendo…' : ' Quedan en este equipo hasta que vuelva internet.'}`);
  });
}

// Ctrl+V con filas copiadas de Excel (texto separado por tabulaciones).
function pegar(texto, td) {
  if (!estado.rally) return;
  if (!estado.clases.length) return toast('Este rally no tiene clases habilitadas todavía.', true);
  const filas = String(texto).replace(/\r/g, '').split('\n').map(l => l.split('\t').map(v => v.trim()));
  while (filas.length && filas[filas.length - 1].every(v => !v)) filas.pop();
  if (!filas.length) return;
  // Si se copió con la fila de títulos, las columnas se reconocen por nombre.
  const iTit = filas.slice(0, 15).findIndex(f => mapaTitulos(f));
  let crudas, destinos = [];
  if (iTit >= 0) {
    const m = mapaTitulos(filas[iTit]);
    crudas = filas.slice(iTit + 1).map(v => crudaPorTitulos(v, m));
  } else {
    const a = td ? idCelda(td) : { id: 'nueva', campo: 'num' };
    const inicio = Math.max(0, columnasOrden().indexOf(a.campo));
    crudas = filas.map(v => crudaPorPosicion(v, inicio));
    // Pegado encima de filas existentes: se reemplazan hacia abajo, como en Excel.
    if (a.id !== 'nueva') {
      const visibles = [...document.querySelectorAll('.in-tabla tbody tr[data-id]')].map(tr => tr.dataset.id);
      const desde = visibles.indexOf(a.id);
      destinos = crudas.map((_, i) => visibles[desde + i] !== 'nueva' ? visibles[desde + i] : null);
    }
  }
  confirmarImportacion(planificar(crudas.map(convertir), destinos), 'pegar');
}

async function subirExcel(archivo) {
  if (!archivo) return;
  if (!window.ExcelJS) return toast('Todavía está cargando el lector de Excel, probá en un segundo.', true);
  if (!/\.xlsx$/i.test(archivo.name)) return toast('Subí el archivo en formato .xlsx (en Excel: Guardar como → Libro de Excel).', true);
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await archivo.arrayBuffer());
    // Se busca la hoja y la fila de títulos que tengan la columna del piloto.
    for (const ws of wb.worksheets) {
      if (ws.state && ws.state !== 'visible') continue;
      const filas = [];
      ws.eachRow({ includeEmpty: true }, (row, n) => { const v = []; row.eachCell({ includeEmpty: true }, (c, col) => { v[col - 1] = textoCelda(c.value).trim(); }); filas[n - 1] = v; });
      for (let i = 0; i < filas.length; i++) filas[i] = filas[i] || [];
      const iTit = filas.slice(0, 30).findIndex(f => mapaTitulos(f));
      if (iTit < 0) continue;
      const m = mapaTitulos(filas[iTit]);
      const crudas = filas.slice(iTit + 1).map(v => crudaPorTitulos(v, m));
      return confirmarImportacion(planificar(crudas.map(convertir)), 'subir');
    }
    toast('No encontré la columna del PILOTO en el Excel. Usá la plantilla (📄) o una lista con títulos: Nº DE COCHE, CLASE, PILOTO…', true);
  } catch (e) {
    toast('No se pudo leer el Excel: ' + (e.message || e), true);
  }
}

// Plantilla para llenar en la compu: con listas desplegables y lo que ya está cargado.
async function descargarPlantilla() {
  if (!window.ExcelJS) return toast('Todavía está cargando el generador de Excel, probá en un segundo.', true);
  if (!estado.rally) return;
  const c = cfg();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AMADESU RALLYS';
  const ws = wb.addWorksheet('INSCRIPCION', { views: [{ state: 'frozen', ySplit: 3 }] });
  const listas = wb.addWorksheet('LISTAS', { state: 'hidden' });
  const cols = [['Nº DE COCHE', 13], ['CLASE', 16], ['PILOTO', 38], ['NAVEGANTE', 38], ['PAÍS', 18]].concat(c.mostrarCiudad ? [['CIUDAD', 18]] : []).concat(estado.ambitos.map(a => [a.codigo, 10]));
  ws.columns = cols.map(([, w]) => ({ width: w }));
  ws.mergeCells(1, 1, 1, cols.length);
  ws.getCell('A1').value = `PLANILLA DE INSCRIPCIÓN — ${estado.rally.nombre.toUpperCase()}`;
  ws.getCell('A1').font = { name: 'Cambria', size: 16, bold: true }; ws.getCell('A1').alignment = { horizontal: 'center' };
  ws.mergeCells(2, 1, 2, cols.length);
  ws.getCell('A2').value = 'Un auto por fila. Clase y país: elegí de la lista. Campeonatos: poné SI (o dejá vacío). Después: ⬆ Subir Excel en la planilla del sistema.';
  ws.getCell('A2').font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF555555' } }; ws.getCell('A2').alignment = { horizontal: 'center', wrapText: true };
  ws.getRow(2).height = 28; ws.getRow(3).height = 26;
  const borde = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  cols.forEach(([t], i) => {
    const cel = ws.getCell(3, i + 1);
    cel.value = t; cel.font = { name: 'Cambria', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } }; cel.border = borde; cel.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  // Listas para los desplegables
  listas.getCell('A1').value = 'CLASES'; estado.clases.forEach((cl, i) => { listas.getCell(i + 2, 1).value = cl.codigo; });
  listas.getCell('B1').value = 'PAISES'; PAISES.forEach((p, i) => { listas.getCell(i + 2, 2).value = p.toUpperCase(); });
  const o = ordenadas();
  const iPais = 5, iCiu = c.mostrarCiudad ? 6 : null, iAmb0 = c.mostrarCiudad ? 7 : 6;
  const FILAS = Math.max(300, o.porClase.length + 100);
  for (let r = 4; r < 4 + FILAS; r++) {
    const f = o.porClase[r - 4];
    const vals = f ? [f.numero, codigoClase(f), f.piloto, f.nav || '', f.pais || ''].concat(c.mostrarCiudad ? [f.ciudad || ''] : []).concat(estado.ambitos.map(a => (f.amb || []).includes(a.id) ? 'SI' : '')) : [];
    for (let k = 1; k <= cols.length; k++) {
      const cel = ws.getCell(r, k);
      if (vals[k - 1] !== undefined && vals[k - 1] !== '') cel.value = vals[k - 1];
      cel.border = borde; cel.font = { name: 'Calibri', size: 12 }; cel.alignment = { horizontal: 'center', vertical: 'middle' };
    }
    ws.getCell(r, 2).dataValidation = { type: 'list', allowBlank: true, formulae: [`LISTAS!$A$2:$A$${estado.clases.length + 1}`], showErrorMessage: true, errorTitle: 'Clase', error: 'Elegí una clase de la lista (son las habilitadas en este rally).' };
    ws.getCell(r, iPais).dataValidation = { type: 'list', allowBlank: true, formulae: [`LISTAS!$B$2:$B$${PAISES.length + 1}`], showErrorMessage: true, errorStyle: 'warning', error: 'Elegí un país de la lista.' };
    estado.ambitos.forEach((a, j) => { ws.getCell(r, iAmb0 + j).dataValidation = { type: 'list', allowBlank: true, formulae: ['"SI"'] }; });
    if (iCiu) ws.getCell(r, iCiu).font = { name: 'Calibri', size: 12, bold: true };
  }
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `PLANTILLA INSCRIPCION - ${estado.rally.nombre.replace(/[\\/:*?"<>|]/g, '')}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(o.porClase.length ? `Plantilla descargada con los ${o.porClase.length} inscritos actuales: agregá o corregí y subila.` : 'Plantilla descargada: llenala y subila con ⬆ Subir Excel.');
}

document.addEventListener('paste', e => {
  if (document.querySelector('.pl-dialogo-fondo') || !estado.rally) return;
  if (e.target.closest && e.target.closest('.pl-barra')) return;
  const texto = e.clipboardData?.getData('text/plain') || '';
  const varias = /[\t\n]/.test(texto.trim());
  const td = estado.activa && celdaDe(estado.activa);
  if (estado.editando) {
    if (!varias) return; // un solo valor: se pega normal dentro de la celda
    e.preventDefault();
    const inp = td?.querySelector('input');
    if (inp) cancelar(td);
    cerrarSug();
    return pegar(texto, td);
  }
  if (!texto.trim()) return;
  e.preventDefault();
  if (varias || !td || !td.classList.contains('ed')) return pegar(texto, td && td.classList.contains('ed') ? td : null);
  empezarEdicion(td, texto.trim());
});

// ------------------------------------------------------------------
// Eventos
// ------------------------------------------------------------------
$('pl-marco').addEventListener('click', e => {
  const q = e.target.closest('[data-quitar]'); if (q) return quitarFila(q.dataset.quitar);
  const th = e.target.closest('[data-amb-todos]'); if (th) return marcarTodos(th.dataset.ambTodos);
  const err = e.target.closest('[data-ver-error]'); if (err) return verError(err.closest('tr').dataset.id);
  const amb = e.target.closest('td.amb');
  if (amb) { const tr = amb.closest('tr'); if (tr.dataset.id !== 'nueva') { seleccionar(amb); alternarAmbito(tr.dataset.id, amb.dataset.a); } return; }
  const td = e.target.closest('td.ed');
  if (!td || td.querySelector('input')) return;
  if (tactil) empezarEdicion(td); else seleccionar(td);
});
$('pl-marco').addEventListener('dblclick', e => { const td = e.target.closest('td.ed'); if (td && !td.querySelector('input')) empezarEdicion(td); });

document.addEventListener('keydown', e => {
  if (estado.editando || !estado.activa || document.querySelector('.pl-dialogo-fondo')) return;
  if (e.target.closest && e.target.closest('.pl-barra')) return;
  const td = celdaDe(estado.activa);
  if (!td) return;
  const flechas = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  const esAmb = td.classList.contains('amb');
  if (flechas[e.key]) { e.preventDefault(); mover(...flechas[e.key]); }
  else if (e.key === 'Tab') { e.preventDefault(); mover(e.shiftKey ? -1 : 1, 0); }
  else if (esAmb && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); alternarAmbito(estado.activa.id, td.dataset.a); }
  else if (esAmb) return;
  else if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); empezarEdicion(td); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); empezarEdicion(td, ''); confirmar(td, ''); }
  else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); empezarEdicion(td, e.key); }
});

document.querySelectorAll('.pl-orden button').forEach(b => b.onclick = () => {
  estado.orden = b.dataset.orden;
  try { localStorage.setItem('insc_orden', estado.orden); } catch (e) { }
  document.querySelectorAll('.pl-orden button').forEach(x => x.classList.toggle('activo', x === b));
  dibujar();
});
$('pl-ir').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const tr = document.querySelector(`.in-tabla tr[data-num="${CSS.escape($('pl-ir').value.trim())}"]`);
  if (!tr) return toast('No hay ningún auto con ese número.', true);
  tr.classList.add('destacada'); setTimeout(() => tr.classList.remove('destacada'), 2500);
  seleccionar(tr.querySelector('td.ed[data-c="pil"]'));
  $('pl-ir').value = '';
});
$('pl-excel').onclick = descargarExcel;
$('pl-config').onclick = abrirConfig;
$('in-plantilla').onclick = descargarPlantilla;
$('in-subir').onclick = () => { if (!estado.rally) return toast('Elegí primero el rally.', true); $('in-archivo').click(); };
$('in-archivo').onchange = e => { const f = e.target.files[0]; e.target.value = ''; subirExcel(f); };
$('pl-ayuda-x')?.addEventListener('click', () => { $('pl-ayuda').remove(); try { localStorage.setItem('insc_sin_ayuda', '1'); } catch (e) { } });
// Al desplazar la hoja, la lista de sugerencias sigue a la celda que se escribe.
window.addEventListener('scroll', () => {
  if (!sug.abierta) return;
  const inp = sug.td?.querySelector('input');
  if (inp && sug.td.isConnected) pintarSug(sug.td, sug.campo, inp.value); else cerrarSug();
}, true);
window.addEventListener('beforeunload', e => { if ([...estado.guardando.values()].includes('guardando')) { e.preventDefault(); e.returnValue = ''; } });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => { });
try { navigator.storage?.persist?.(); } catch (e) { }
iniciar();
