// Planilla de Tiempos: hoja tipo Excel para cargar Hr. Salida / Hr. Paso de cada PE.
// Guarda en rally.tiempos y rally.penalizaciones igual que el Control de Tiempos,
// así que la página pública, las estadísticas y los avisos se actualizan solos.
import { supabase } from './supabase_config.js';

const db = () => supabase.schema('rally');
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tactil = window.matchMedia('(pointer: coarse)').matches;
const ESPECIALES = { abandono: 'ABANDONO', no_presentado: 'NO LARGÓ' };
const ORDEN_CLASES = ['RC2', 'PROTO', 'RC2N', 'RC4', 'R2B', 'R1B', 'PROMOCIONAL'];

const estado = {
  esAdmin: false, rally: null, etapas: [], pes: [], inscritos: [],
  tiempos: new Map(),     // "ins|rec" -> { id, salidaMs, pasoMs, brutoMs, estado, brutoSinHoras }
  penales: new Map(),     // "ins|rec" -> [{ id, ms, motivo }]
  config: {}, orden: 'numero', clase: '', ultimoSync: null,
  activa: null, editando: null, guardando: new Map(),
};
const clave = (i, r) => `${i}|${r}`;

// ------------------------------------------------------------------
// Tiempos: conversión, lectura de lo que se tipea y formatos de pantalla
// ------------------------------------------------------------------
const pad = (n, l = 2) => String(n).padStart(l, '0');

function msDesdeISO(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return ((d.getUTCHours() * 60 + d.getUTCMinutes()) * 60 + d.getUTCSeconds()) * 1000 + d.getUTCMilliseconds();
}
function isoDesdeMs(ms) {
  const hoy = new Date().toISOString().slice(0, 10);
  return `${hoy}T${hms(ms, true)}Z`;
}
function hms(ms, conCentesimas) {
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, c = Math.floor((ms % 1000) / 10);
  return `${pad(h)}:${pad(m)}:${pad(s)}${conCentesimas ? '.' + pad(c) : ''}`;
}
// Igual que formatTimeMs del Control de Tiempos: "HH:MM:SS.cc" (formato de interval).
const intervalo = ms => hms(ms, true);
function msDesdeIntervalo(iv) {
  if (iv === null || iv === undefined || iv === '') return null;
  let s = String(iv).trim(), dias = 0;
  const d = s.match(/(-?\d+)\s+days?/i);
  if (d) { dias = parseInt(d[1], 10) * 86400000; s = s.replace(d[0], '').trim(); }
  const p = s.split(':');
  let h = 0, m = 0, seg = '0';
  if (p.length === 3) [h, m, seg] = p; else if (p.length === 2) [m, seg] = p; else seg = p[0];
  const [si, frac = ''] = String(seg).split('.');
  return dias + ((+h * 60 + +m) * 60 + (+si || 0)) * 1000 + (parseInt(frac.padEnd(3, '0').slice(0, 3), 10) || 0);
}

// Lo que se escribe en la celda -> ms del día (o un estado especial).
function leerHora(texto, esSalida) {
  const t = String(texto || '').trim().toUpperCase().replace(',', '.');
  if (!t) return { vacio: true };
  if (/^(AB|ABA|ABANDONO|ABAND)$/.test(t)) return { especial: 'abandono' };
  if (/^(NL|NP|NO ?LARG[OÓ]|NO ?LARGO|DNS)$/.test(t)) return { especial: 'no_presentado' };
  let h, m, s = 0, frac = '';
  if (t.includes(':')) {
    const p = t.split(':');
    if (p.length < 2 || p.length > 3) return { error: true };
    h = p[0]; m = p[1];
    if (p.length === 3) { const q = p[2].split('.'); s = q[0]; frac = q[1] || ''; }
  } else {
    const [dig, f = ''] = t.split('.');
    if (!/^\d+$/.test(dig)) return { error: true };
    frac = f;
    const n = dig;
    if (n.length <= 2) { h = n; m = 0; }
    else if (n.length === 3) { h = n.slice(0, 1); m = n.slice(1); }
    else if (n.length === 4) { h = n.slice(0, 2); m = n.slice(2); }
    else if (n.length === 5) { h = n.slice(0, 1); m = n.slice(1, 3); s = n.slice(3); }
    else if (n.length === 6) { h = n.slice(0, 2); m = n.slice(2, 4); s = n.slice(4); }
    else if (n.length === 7) { h = n.slice(0, 2); m = n.slice(2, 4); s = n.slice(4, 6); frac = n.slice(6); }
    else if (n.length === 8) { h = n.slice(0, 2); m = n.slice(2, 4); s = n.slice(4, 6); frac = n.slice(6); }
    else return { error: true };
  }
  h = +h; m = +m; s = +s;
  if (![h, m, s].every(Number.isFinite) || h > 23 || m > 59 || s > 59 || !/^\d{0,3}$/.test(frac)) return { error: true };
  if (esSalida && frac) frac = '';
  return { ms: ((h * 60 + m) * 60 + s) * 1000 + (parseInt(frac.padEnd(3, '0').slice(0, 3), 10) || 0) };
}

const decimas = ms => (ms % 100 === 0 ? String(Math.floor((ms % 1000) / 100)) : pad(Math.floor((ms % 1000) / 10)));
function verSalida(ms) { if (ms == null) return ''; const b = hms(ms); return b.endsWith(':00') ? b.slice(0, 5) : b; }
function verPaso(ms) { return ms == null ? '' : `${hms(ms)}.${decimas(ms)}`; }
function verDuracion(ms) {
  if (ms == null) return '';
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${h ? h + ':' + pad(m) : pad(m)}:${pad(s)}.${decimas(ms)}`;
}
function verTotal(ms) {
  if (ms == null) return '';
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${h}:${pad(m)}:${pad(s)}.${decimas(ms)}`;
}
const verPenal = ms => { if (!ms) return ''; const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };

// ------------------------------------------------------------------
// Avisos en pantalla
// ------------------------------------------------------------------
let timerToast;
function toast(texto, mal = false) {
  const t = $('pl-toast');
  t.textContent = texto; t.classList.toggle('mal', mal); t.classList.add('visible');
  clearTimeout(timerToast); timerToast = setTimeout(() => t.classList.remove('visible'), 3200);
}
function estadoBarra() {
  const pend = [...estado.guardando.values()].filter(v => v === 'guardando').length;
  const err = [...estado.guardando.values()].filter(v => v === 'error').length;
  $('pl-estado').innerHTML = [
    pend ? `<span>⏳ Guardando ${pend}…</span>` : '',
    err ? `<span class="mal">⚠ ${err} celda(s) sin guardar — tocá la celda roja para reintentar</span>` : '',
    !pend && !err && estado.ultimoGuardado ? `<span class="ok">✓ Todo guardado · ${estado.ultimoGuardado}</span>` : '',
  ].join('');
}

// ------------------------------------------------------------------
// Carga
// ------------------------------------------------------------------
async function todo(consulta) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta().range(desde, desde + 999);
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < 1000) return filas;
  }
}

async function iniciar() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { location.href = 'admin_login.html'; return; }
  const { data: usuario } = await db().from('usuarios').select('rol_id, rally_id').eq('id', session.user.id).maybeSingle();
  estado.esAdmin = !usuario || Number(usuario.rol_id) !== 3;
  $('pl-volver').href = estado.esAdmin ? 'admin_dashboard.html' : 'operador_dashboard.html';
  $('pl-config').hidden = !estado.esAdmin;

  try { estado.orden = localStorage.getItem('pl_orden') || 'numero'; if (localStorage.getItem('pl_sin_ayuda')) $('pl-ayuda').remove(); } catch (e) { }
  document.querySelectorAll('.pl-orden button').forEach(b => b.classList.toggle('activo', b.dataset.orden === estado.orden));

  let rallyId = new URLSearchParams(location.search).get('rally');
  if (!estado.esAdmin) rallyId = usuario.rally_id || localStorage.getItem('operator_rally_id') || rallyId;

  if (estado.esAdmin) {
    const { data: rallies } = await db().from('rallies').select('id, nombre, fecha_inicio, tipo_evento').is('deleted_at', null).order('fecha_inicio', { ascending: false });
    const sel = $('pl-rally');
    sel.innerHTML = '<option value="">Elegí el rally…</option>' + (rallies || []).map(r => `<option value="${r.id}">${esc(r.nombre)}${r.tipo_evento === 'circuito' ? ' (circuito)' : ''}</option>`).join('');
    sel.hidden = false;
    sel.onchange = () => { if (sel.value) { history.replaceState(null, '', '?rally=' + sel.value); cargarRally(sel.value); } };
    if (rallyId) sel.value = rallyId;
  }
  if (!rallyId) { $('pl-marco').innerHTML = '<div class="pl-vacio">Elegí un rally arriba para abrir su planilla.</div>'; $('pl-sub').textContent = ''; return; }
  await cargarRally(rallyId);
}

async function cargarRally(rallyId) {
  $('pl-marco').innerHTML = '<div class="pl-cargando">Cargando planilla…</div>';
  try {
    const { data: rally, error } = await db().from('rallies').select('id, nombre, fecha_inicio, fecha_fin, ciudad, tipo_evento').eq('id', rallyId).maybeSingle();
    if (error || !rally) throw error || new Error('No se encontró el rally.');
    estado.rally = rally;
    $('pl-sub').textContent = rally.nombre;
    document.title = `Planilla — ${rally.nombre}`;
    if (rally.tipo_evento === 'circuito') {
      $('pl-marco').innerHTML = '<div class="pl-vacio">La planilla es para el modo <b>rally</b> (etapas y PE). Los circuitos se cargan por vueltas desde Control de Tiempos.</div>';
      return;
    }
    const [etapas, inscritos, cfg] = await Promise.all([
      db().from('etapas').select('id, numero, nombre, recorridos(id, numero, nombre, distancia_km, deleted_at)').eq('rally_id', rallyId).eq('es_shakedown', false).is('deleted_at', null).order('numero'),
      todo(() => db().from('inscripciones').select('id, numero, piloto:pilotos(nombre, apellido), navegante:navegantes(nombre, apellido), categoria:categorias(nombre), asociacion:asociaciones(nombre)').eq('rally_id', rallyId).is('deleted_at', null).order('numero')),
      db().from('planillas').select('config').eq('rally_id', rallyId).maybeSingle(),
    ]);
    if (etapas.error) throw etapas.error;
    estado.etapas = (etapas.data || []).map(e => ({ ...e, recorridos: (e.recorridos || []).filter(r => !r.deleted_at).sort((a, b) => a.numero - b.numero) })).filter(e => e.recorridos.length);
    estado.pes = estado.etapas.flatMap(e => e.recorridos.map(r => ({ ...r, etapaId: e.id, km: parseFloat(r.distancia_km) || 0 })));
    estado.inscritos = inscritos;
    estado.config = cfg.data?.config || {};
    await traerTiemposYPenales(true);
    llenarFiltroClases();
    dibujar();
    clearInterval(estado.timerSync);
    estado.timerSync = setInterval(() => { if (!document.hidden) traerTiemposYPenales(false).then(() => { if (!estado.editando) dibujar(); }); }, 20000);
  } catch (e) {
    $('pl-marco').innerHTML = `<div class="pl-vacio">No se pudo cargar la planilla: ${esc(e.message || e)}</div>`;
  }
}

async function traerTiemposYPenales(completo) {
  const recIds = estado.pes.map(p => p.id);
  if (!recIds.length) return;
  const desde = completo ? null : estado.ultimoSync;
  const filas = await todo(() => {
    let q = db().from('tiempos').select('id, inscripcion_id, recorrido_id, vuelta, hora_salida, hora_llegada, tiempo_bruto, estado, updated_at')
      .in('recorrido_id', recIds).is('deleted_at', null).order('updated_at');
    if (desde) q = q.gt('updated_at', desde);
    return q;
  });
  if (completo) estado.tiempos.clear();
  for (const f of filas) {
    if ((f.vuelta || 1) !== 1) continue;
    const k = clave(f.inscripcion_id, f.recorrido_id);
    if (estado.editando === k || estado.guardando.get(k) === 'guardando') continue;
    const salidaMs = msDesdeISO(f.hora_salida), pasoMs = msDesdeISO(f.hora_llegada), brutoMs = msDesdeIntervalo(f.tiempo_bruto);
    estado.tiempos.set(k, { id: f.id, salidaMs, pasoMs, brutoMs, estado: f.estado, brutoSinHoras: !!brutoMs && pasoMs == null });
    if (!estado.ultimoSync || f.updated_at > estado.ultimoSync) estado.ultimoSync = f.updated_at;
  }
  const pen = await todo(() => db().from('penalizaciones').select('id, inscripcion_id, recorrido_id, tiempo_penalizacion, motivo, created_at')
    .in('recorrido_id', recIds).eq('tipo', 'tiempo').is('deleted_at', null).order('created_at'));
  estado.penales.clear();
  for (const p of pen) {
    const k = clave(p.inscripcion_id, p.recorrido_id);
    if (!estado.penales.has(k)) estado.penales.set(k, []);
    estado.penales.get(k).push({ id: p.id, ms: msDesdeIntervalo(p.tiempo_penalizacion) || 0, motivo: p.motivo });
  }
}

// ------------------------------------------------------------------
// Cálculo (mismas reglas que la página pública)
// ------------------------------------------------------------------
const nombreClase = ins => {
  let c = String(ins.categoria?.nombre || 'Sin Clase').trim().toUpperCase();
  if (c === 'PROMO') c = 'PROMOCIONAL';
  return c;
};
const posClase = c => { const i = ORDEN_CLASES.indexOf(c); return i === -1 ? ORDEN_CLASES.length : i; };
const ordenarClases = lista => [...lista].sort((a, b) => posClase(a) - posClase(b) || a.localeCompare(b));
const penalPE = (i, r) => (estado.penales.get(clave(i, r)) || []).reduce((a, p) => a + p.ms, 0);

function celdaPE(insId, pe) {
  const t = estado.tiempos.get(clave(insId, pe.id));
  if (!t) return { brutoMs: null };
  if (ESPECIALES[t.estado]) return { ...t, especial: t.estado, brutoMs: null };
  let brutoMs = null;
  if (t.salidaMs != null && t.pasoMs != null && t.pasoMs > t.salidaMs) brutoMs = t.pasoMs - t.salidaMs;
  else if (t.brutoSinHoras) brutoMs = t.brutoMs;
  return { ...t, brutoMs };
}

function calcular(ins) {
  const f = { ins, clase: nombreClase(ins), porPE: {}, etapas: {}, completas: 0, total: 0, km: 0, penal: 0, especial: null, conDatos: false };
  for (const pe of estado.pes) {
    const c = celdaPE(ins.id, pe);
    f.porPE[pe.id] = c;
    f.penal += penalPE(ins.id, pe.id);
    if (c.salidaMs != null || c.pasoMs != null || c.brutoMs != null || c.especial) f.conDatos = true;
    if (c.especial && !f.especial) f.especial = c.especial;
    if (c.brutoMs) { f.completas++; f.total += c.brutoMs; f.km += pe.km; }
  }
  for (const et of estado.etapas) {
    const brutos = et.recorridos.map(r => f.porPE[r.id].brutoMs);
    f.etapas[et.id] = { ms: brutos.reduce((a, b) => a + (b || 0), 0), completa: brutos.every(b => b), alguna: brutos.some(b => b) };
  }
  f.completa = f.completas === estado.pes.length && estado.pes.length > 0;
  f.general = f.completa ? f.total + f.penal : null;
  f.vel = f.total ? f.km / (f.total / 3600000) : null;
  return f;
}

// Por clase: completas por tiempo, después las incompletas (más PE primero),
// después abandono / no largó, y al final los que todavía no tienen nada.
function clasificar() {
  const grupos = {};
  for (const ins of estado.inscritos) { const f = calcular(ins); (grupos[f.clase] ||= []).push(f); }
  const rango = f => f.especial ? 2 : f.completa ? 0 : f.conDatos ? 1 : 3;
  for (const lista of Object.values(grupos)) {
    lista.sort((a, b) => rango(a) - rango(b) || (rango(a) === 0 ? a.general - b.general : rango(a) === 1 ? (b.completas - a.completas) || (a.total + a.penal - b.total - b.penal) : 0) || (a.ins.numero - b.ins.numero));
    let lider = null, previo = null;
    lista.forEach((f, i) => {
      f.psto = rango(f) <= 2 ? i + 1 : null;
      if (f.completa) {
        if (lider == null) lider = f.general;
        else { f.difPrimero = f.general - lider; f.difAnterior = f.general - previo; }
        previo = f.general;
      }
    });
  }
  return grupos;
}

// ------------------------------------------------------------------
// Dibujo de la hoja
// ------------------------------------------------------------------
function cfg() {
  const c = estado.config || {};
  const fecha = estado.rally.fecha_inicio ? new Date(estado.rally.fecha_inicio + 'T12:00:00').toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  return {
    titulos: (c.titulos && c.titulos.length ? c.titulos : ['', '', '', estado.rally.nombre.toUpperCase()]).concat(['', '', '', '']).slice(0, 4),
    fecha: c.fecha ?? (fecha ? `Fecha: ${fecha.charAt(0).toUpperCase() + fecha.slice(1)}` : ''),
    hora: c.hora_publicacion || '',
    logoIzq: c.logo_izq || '', logosDer: c.logos_der || [],
    firmas: (c.firmas && c.firmas.length ? c.firmas : [{ nombre: '', cargo: 'COMISIÓN CRONOMETRAJE' }, { nombre: '', cargo: 'DIRECTOR DE PRUEBA' }]),
  };
}

function llenarFiltroClases() {
  const clases = ordenarClases([...new Set(estado.inscritos.map(nombreClase))]);
  $('pl-clase').innerHTML = '<option value="">Todas las clases</option>' + clases.map(c => `<option>${esc(c)}</option>`).join('');
  $('pl-clase').value = clases.includes(estado.clase) ? estado.clase : '';
}

function dibujar() {
  if (!estado.rally || !estado.pes.length) {
    if (estado.rally) $('pl-marco').innerHTML = '<div class="pl-vacio">Este rally todavía no tiene etapas ni PE cargadas.</div>';
    return;
  }
  const scroll = { x: $('pl-marco').scrollLeft, y: $('pl-marco').scrollTop };
  const c = cfg();
  const grupos = clasificar();
  const kmTotal = estado.pes.reduce((a, p) => a + p.km, 0);

  let cab = `<tr>
    <th rowspan="1">Nro</th><th>Psto.</th><th class="fijo c-num">Nº COCHE</th><th>CLASE</th><th class="fijo c-pil pil">PILOTO / NAVEGANTE</th><th>ASOCIACIÓN</th>`;
  for (const et of estado.etapas) {
    for (const pe of et.recorridos) cab += `<th>Hr. Salida</th><th>Hr. Paso P${pe.numero}</th><th class="pe" title="${esc(pe.nombre)} · ${pe.km} km">PE${pe.numero}</th>`;
    cab += `<th class="etapa">${esc(et.nombre)}</th>`;
  }
  cab += `<th>penalización</th><th class="gen">GENERAL</th><th>Promedio Velocidad km/h</th><th>DIF. CON ANTERIOR</th><th>DIF. CON PRIMERO</th></tr>`;

  const totalCols = 6 + estado.etapas.reduce((a, e) => a + e.recorridos.length * 3 + 1, 0) + 5;
  let cuerpo = '', nro = 0;
  const clases = ordenarClases(Object.keys(grupos)).filter(cl => !estado.clase || cl === estado.clase);
  clases.forEach((cl, ci) => {
    let lista = grupos[cl];
    if (estado.orden === 'numero') lista = [...lista].sort((a, b) => a.ins.numero - b.ins.numero);
    for (const f of lista) {
      nro++;
      const i = f.ins;
      const piloto = i.piloto ? `${i.piloto.nombre} ${i.piloto.apellido}`.trim() : 'Sin piloto';
      const nav = i.navegante ? `${i.navegante.nombre} ${i.navegante.apellido}`.trim() : '';
      let tr = `<tr data-ins="${i.id}" data-num="${i.numero}">
        <td class="c-nro">${nro}</td><td class="c-psto">${f.psto ?? ''}</td>
        <td class="fijo c-num">${esc(i.numero)}</td><td class="c-clase">${esc(cl)}</td>
        <td class="fijo c-pil">${esc(piloto)}${nav ? `<small>${esc(nav)}</small>` : ''}</td>
        <td class="c-asoc">${esc(i.asociacion?.nombre || '')}</td>`;
      for (const et of estado.etapas) {
        for (const pe of et.recorridos) {
          const p = f.porPE[pe.id];
          const k = clave(i.id, pe.id);
          const marca = estado.guardando.get(k) || '';
          const pasoTxt = p.especial ? ESPECIALES[p.especial] : verPaso(p.pasoMs);
          tr += `<td class="ed salida ${marca}" tabindex="-1" data-r="${pe.id}" data-c="s">${verSalida(p.salidaMs)}</td>`;
          tr += `<td class="ed paso ${marca} ${p.especial ? 'especial' : ''}" tabindex="-1" data-r="${pe.id}" data-c="p">${pasoTxt}</td>`;
          tr += `<td class="c-pe">${verDuracion(p.brutoMs)}</td>`;
        }
        const e = f.etapas[et.id];
        tr += `<td class="c-etapa ${e.completa ? '' : 'parcial'}">${e.alguna ? verTotal(e.ms) : ''}</td>`;
      }
      const genTxt = f.completa ? verTotal(f.general) : f.especial ? ESPECIALES[f.especial] : f.completas ? `Faltan ${estado.pes.length - f.completas} PE` : '';
      tr += `<td class="c-penal" data-penal="${i.id}" title="Ver o agregar penalizaciones">${verPenal(f.penal)}</td>`;
      tr += `<td class="c-gen ${f.completa ? '' : f.especial ? 'especial' : 'parcial'}">${genTxt}</td>`;
      tr += `<td class="c-vel">${f.vel ? f.vel.toFixed(2) : ''}</td>`;
      tr += `<td class="c-dif">${f.difAnterior != null ? '+' + verDuracion(f.difAnterior) : ''}</td>`;
      tr += `<td class="c-dif">${f.difPrimero != null ? '+' + verDuracion(f.difPrimero) : ''}</td></tr>`;
      cuerpo += tr;
    }
    if (ci < clases.length - 1) cuerpo += `<tr class="sep"><td colspan="${totalCols}"></td></tr>`;
  });

  $('pl-marco').innerHTML = `
    <div class="pl-hoja">
      <div class="pl-cab">
        <div class="pl-cab-logos">${c.logoIzq ? `<img src="${esc(c.logoIzq)}" alt="">` : ''}</div>
        <div class="pl-cab-titulos">${c.titulos.filter(Boolean).map(t => `<div>${esc(t)}</div>`).join('')}</div>
        <div class="pl-cab-logos der">${c.logosDer.map(u => `<img src="${esc(u)}" alt="">`).join('')}</div>
      </div>
      <div class="pl-cab-info">
        ${c.fecha ? `<b>${esc(c.fecha)}</b>` : ''}
        <span><i>Hora de Publicación:</i> ${esc(c.hora || '—')}</span>
        <span>Kilometraje total: <span class="pl-km">${kmTotal.toFixed(2)}</span></span>
      </div>
      <table class="pl-tabla"><thead>${cab}</thead><tbody>${cuerpo || `<tr><td colspan="${totalCols}" style="padding:30px;">Este rally todavía no tiene pilotos inscritos.</td></tr>`}</tbody></table>
      <div class="pl-firmas">${c.firmas.map(fi => `<div class="pl-firma">${fi.img ? `<img src="${esc(fi.img)}" alt="">` : '<div style="height:60px"></div>'}<div class="linea">${esc(fi.nombre || ' ')}</div><b>${esc(fi.cargo || '')}</b></div>`).join('')}</div>
    </div>`;
  $('pl-marco').scrollLeft = scroll.x; $('pl-marco').scrollTop = scroll.y;
  if (estado.activa) {
    const td = celdaDe(estado.activa);
    if (td) td.classList.add('activa');
  }
  estadoBarra();
}

// ------------------------------------------------------------------
// Edición tipo Excel
// ------------------------------------------------------------------
const idCelda = td => ({ ins: td.closest('tr').dataset.ins, rec: td.dataset.r, campo: td.dataset.c });
const celdaDe = a => document.querySelector(`tr[data-ins="${a.ins}"] td.ed[data-r="${a.rec}"][data-c="${a.campo}"]`);

function seleccionar(td, enfocar = true) {
  document.querySelectorAll('td.ed.activa').forEach(x => x.classList.remove('activa'));
  if (!td) { estado.activa = null; return; }
  td.classList.add('activa');
  estado.activa = idCelda(td);
  if (enfocar) td.focus({ preventScroll: true });
  td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function mover(td, dx, dy) {
  if (!td || !td.isConnected) td = estado.activa && celdaDe(estado.activa);
  if (!td) return;
  const filas = [...document.querySelectorAll('.pl-tabla tbody tr[data-ins]')];
  const fila = td.closest('tr');
  const celdas = [...fila.querySelectorAll('td.ed')];
  let col = celdas.indexOf(td), fi = filas.indexOf(fila);
  if (dx) {
    col += dx;
    if (col >= celdas.length) { col = 0; fi = Math.min(filas.length - 1, fi + 1); }
    if (col < 0) { fi = Math.max(0, fi - 1); col = filas[fi].querySelectorAll('td.ed').length - 1; }
  }
  if (dy) fi = Math.max(0, Math.min(filas.length - 1, fi + dy));
  const destino = filas[fi]?.querySelectorAll('td.ed')[col];
  if (destino) seleccionar(destino);
}

function empezarEdicion(td, inicial) {
  if (estado.editando) return;
  seleccionar(td);
  const a = idCelda(td);
  estado.editando = clave(a.ins, a.rec);
  const valor = inicial ?? (td.classList.contains('especial') ? (td.textContent === 'ABANDONO' ? 'AB' : 'NL') : td.textContent.trim());
  td.dataset.antes = td.textContent;
  td.innerHTML = `<input type="text" autocomplete="off" spellcheck="false" ${tactil ? 'inputmode="decimal"' : ''} value="${esc(valor)}">`;
  const inp = td.querySelector('input');
  inp.focus();
  if (inicial == null) inp.select(); else inp.setSelectionRange(inp.value.length, inp.value.length);
  if (tactil) $('pl-teclas').hidden = false;
  inp.addEventListener('keydown', e => {
    // La tecla no sigue hacia la hoja (si no, Enter guardaría y además volvería a abrir la celda).
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); confirmar(td, inp.value).then(ok => ok && mover(td, 0, 1)); }
    else if (e.key === 'Tab') { e.preventDefault(); confirmar(td, inp.value).then(ok => ok && mover(td, e.shiftKey ? -1 : 1, 0)); }
    else if (e.key === 'Escape') { e.preventDefault(); cancelar(td); }
    else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !tactil) { e.preventDefault(); confirmar(td, inp.value).then(ok => ok && mover(td, 0, e.key === 'ArrowDown' ? 1 : -1)); }
  });
  inp.addEventListener('blur', () => setTimeout(() => { if (td.isConnected && td.querySelector('input') === inp && !estado.usandoTeclas) confirmar(td, inp.value); }, 120));
}

function cancelar(td) {
  td.textContent = td.dataset.antes || '';
  estado.editando = null;
  $('pl-teclas').hidden = true;
  seleccionar(td);
}

// Valida lo escrito, actualiza la hoja al instante y guarda en segundo plano.
async function confirmar(td, texto, especialForzado) {
  if (!td.querySelector('input') && especialForzado === undefined) return true;
  const a = idCelda(td);
  const k = clave(a.ins, a.rec);
  const r = especialForzado === 'borrar' ? { vacio: true } : especialForzado ? { especial: especialForzado } : leerHora(texto, a.campo === 's');
  if (r.error) {
    toast(a.campo === 's' ? 'Hora de salida inválida. Ej: 0801 o 08:01' : 'Hora de paso inválida. Ej: 080527 o 08:05:27.7', true);
    td.querySelector('input')?.focus();
    return false;
  }
  const t = { ...(estado.tiempos.get(k) || {}) };
  if (r.especial) { t.estado = r.especial; if (a.campo === 'p') t.pasoMs = null; }
  else if (r.vacio) {
    if (a.campo === 's') t.salidaMs = null; else { t.pasoMs = null; t.brutoSinHoras = false; }
    if (ESPECIALES[t.estado] && a.campo === 'p') t.estado = null;
  } else {
    if (a.campo === 's') t.salidaMs = r.ms; else { t.pasoMs = r.ms; t.brutoSinHoras = false; }
    if (ESPECIALES[t.estado]) t.estado = null;
  }
  if (t.salidaMs != null && t.pasoMs != null && t.pasoMs <= t.salidaMs) {
    toast('La hora de paso tiene que ser mayor que la de salida.', true);
    td.querySelector('input')?.focus();
    return false;
  }
  estado.tiempos.set(k, t);
  estado.editando = null;
  $('pl-teclas').hidden = true;
  dibujar();
  guardar(a.ins, a.rec);
  return true;
}

const cadenas = new Map();
function guardar(insId, recId) {
  const k = clave(insId, recId);
  const anterior = cadenas.get(k) || Promise.resolve();
  const p = anterior.then(() => guardarAhora(insId, recId)).catch(() => { });
  cadenas.set(k, p);
  return p;
}

async function guardarAhora(insId, recId) {
  const k = clave(insId, recId);
  const t = estado.tiempos.get(k);
  if (!t) return;
  const pe = estado.pes.find(p => p.id === recId);
  const especial = ESPECIALES[t.estado] ? t.estado : null;
  const c = celdaPE(insId, pe);
  const bruto = especial ? null : c.brutoMs;
  const pen = penalPE(insId, recId);
  if (!t.id && t.salidaMs == null && t.pasoMs == null && !especial && !t.brutoSinHoras) { estado.tiempos.delete(k); return; }
  const datos = {
    hora_salida: t.salidaMs != null ? isoDesdeMs(t.salidaMs) : null,
    hora_llegada: !especial && t.pasoMs != null ? isoDesdeMs(t.pasoMs) : null,
    tiempo_bruto: bruto != null ? intervalo(bruto) : null,
    tiempo_penalizacion: intervalo(pen),
    tiempo_neto: bruto != null ? intervalo(bruto + pen) : null,
    velocidad_promedio_kmh: bruto ? Number((pe.km / ((bruto + pen) / 3600000)).toFixed(2)) : 0,
    estado: especial || (bruto != null ? 'valido' : 'pendiente'),
  };
  estado.guardando.set(k, 'guardando'); marcar(k, 'guardando'); estadoBarra();
  try {
    if (t.id) {
      const { error } = await db().from('tiempos').update(datos).eq('id', t.id);
      if (error) throw error;
    } else {
      const { data, error } = await db().from('tiempos').insert({ ...datos, inscripcion_id: insId, recorrido_id: recId, vuelta: 1 }).select('id').single();
      if (error && error.code === '23505') {
        // Otro operador cargó este mismo auto/PE recién: se actualiza esa fila.
        const { data: ex } = await db().from('tiempos').select('id').eq('inscripcion_id', insId).eq('recorrido_id', recId).eq('vuelta', 1).is('deleted_at', null).maybeSingle();
        if (!ex) throw error;
        const { error: e2 } = await db().from('tiempos').update(datos).eq('id', ex.id);
        if (e2) throw e2;
        t.id = ex.id;
      } else if (error) throw error;
      else t.id = data.id;
    }
    t.brutoMs = bruto;
    estado.guardando.delete(k);
    estado.ultimoGuardado = new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    marcar(k, 'ok');
  } catch (e) {
    estado.guardando.set(k, 'error');
    marcar(k, 'error', e.message);
    toast('No se pudo guardar: ' + (e.message || e), true);
  }
  estadoBarra();
}

function marcar(k, tipo, msg) {
  const [ins, rec] = k.split('|');
  document.querySelectorAll(`tr[data-ins="${ins}"] td.ed[data-r="${rec}"]`).forEach(td => {
    td.classList.remove('guardando', 'error', 'ok');
    void td.offsetWidth;
    td.classList.add(tipo);
    td.title = tipo === 'error' ? 'No se guardó: ' + (msg || '') + ' — tocá para reintentar' : '';
  });
}

// ------------------------------------------------------------------
// Penalizaciones (las mismas del Control de Tiempos: por PE, con motivo)
// ------------------------------------------------------------------
function dialogo(html) {
  const f = document.createElement('div');
  f.className = 'pl-dialogo-fondo';
  f.innerHTML = `<div class="pl-dialogo" role="dialog" aria-modal="true">${html}</div>`;
  f.addEventListener('click', e => { if (e.target === f || e.target.closest('[data-cerrar]')) f.remove(); });
  document.body.appendChild(f);
  return f;
}

function abrirPenales(insId) {
  const ins = estado.inscritos.find(i => i.id === insId);
  const pinta = () => {
    const items = estado.pes.flatMap(pe => (estado.penales.get(clave(insId, pe.id)) || []).map(p => ({ ...p, pe })));
    return items.length ? `<ul class="pl-lista-penal">${items.map(p => `<li><span><b>+${verPenal(p.ms)}</b> · PE${p.pe.numero} · ${esc(p.motivo)}</span><button type="button" class="pl-btn" data-quitar="${p.id}" data-rec="${p.pe.id}">Quitar</button></li>`).join('')}</ul>` : '<p>Sin penalizaciones.</p>';
  };
  const d = dialogo(`
    <h3>Penalizaciones · #${esc(ins.numero)}</h3>
    <p>${esc(ins.piloto ? ins.piloto.nombre + ' ' + ins.piloto.apellido : '')}</p>
    <div id="pl-pen-lista">${pinta()}</div>
    <div class="grupo"><b>Agregar penalización</b>
      <label>PE</label><select id="pl-pen-pe">${estado.pes.map(pe => `<option value="${pe.id}">PE${pe.numero} · ${esc(pe.nombre)}</option>`).join('')}</select>
      <div class="fila"><div><label>Minutos</label><input type="number" id="pl-pen-mm" min="0" value="0"></div><div><label>Segundos</label><input type="number" id="pl-pen-ss" min="0" max="59" value="0"></div></div>
      <label>Motivo *</label><input type="text" id="pl-pen-motivo" placeholder="Ej: Adelanto en control horario">
    </div>
    <div class="acciones"><button type="button" class="pl-btn" data-cerrar>Cerrar</button><button type="button" class="pl-btn primario" id="pl-pen-add">Aplicar</button></div>`);
  const recalcular = async recId => {
    await traerTiemposYPenales(false);
    if (estado.tiempos.get(clave(insId, recId))?.id) await guardar(insId, recId);
    d.querySelector('#pl-pen-lista').innerHTML = pinta();
    dibujar();
  };
  d.querySelector('#pl-pen-add').onclick = async () => {
    const seg = (parseInt(d.querySelector('#pl-pen-mm').value, 10) || 0) * 60 + (parseInt(d.querySelector('#pl-pen-ss').value, 10) || 0);
    const motivo = d.querySelector('#pl-pen-motivo').value.trim();
    const recId = d.querySelector('#pl-pen-pe').value;
    if (seg <= 0) return toast('Poné minutos y/o segundos.', true);
    if (!motivo) return toast('Escribí el motivo.', true);
    const { error } = await db().from('penalizaciones').insert({ inscripcion_id: insId, recorrido_id: recId, tipo: 'tiempo', tiempo_penalizacion: `${seg} seconds`, motivo });
    if (error) return toast('No se pudo aplicar: ' + error.message, true);
    toast('Penalización aplicada.');
    d.querySelector('#pl-pen-motivo').value = '';
    await recalcular(recId);
  };
  d.addEventListener('click', async e => {
    const b = e.target.closest('[data-quitar]');
    if (!b) return;
    const { error } = await db().from('penalizaciones').update({ deleted_at: new Date().toISOString() }).eq('id', b.dataset.quitar);
    if (error) return toast('No se pudo quitar: ' + error.message, true);
    toast('Penalización quitada.');
    await recalcular(b.dataset.rec);
  });
}

// ------------------------------------------------------------------
// Encabezado, logos y firmas (solo administradores)
// ------------------------------------------------------------------
async function subirImagen(archivo) {
  const ext = (archivo.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ruta = `planillas/${estado.rally.id}/${crypto.randomUUID ? crypto.randomUUID() : Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('logo-sitio').upload(ruta, archivo, { upsert: false, contentType: archivo.type });
  if (error) throw error;
  return supabase.storage.from('logo-sitio').getPublicUrl(ruta).data.publicUrl;
}

function abrirConfig() {
  const c = cfg();
  const borrador = JSON.parse(JSON.stringify({ titulos: c.titulos, fecha: c.fecha, hora_publicacion: c.hora, logo_izq: c.logoIzq, logos_der: c.logosDer, firmas: c.firmas.concat([{}, {}]).slice(0, 2) }));
  const prev = (urls, grupo) => urls.map((u, i) => `<span><img src="${esc(u)}" alt=""><button type="button" data-borrar-img="${grupo}" data-i="${i}">✕</button></span>`).join('');
  const d = dialogo(`
    <h3>Encabezado y firmas</h3>
    <p>Así sale arriba y abajo de la planilla, en pantalla y en el Excel.</p>
    ${[0, 1, 2, 3].map(i => `<label>Título ${i + 1}</label><input type="text" data-titulo="${i}" value="${esc(borrador.titulos[i] || '')}">`).join('')}
    <div class="fila"><div><label>Fecha (texto)</label><input type="text" id="pl-c-fecha" value="${esc(borrador.fecha || '')}"></div>
    <div><label>Hora de publicación</label><input type="text" id="pl-c-hora" placeholder="22:00" value="${esc(borrador.hora_publicacion || '')}"></div></div>
    <div class="grupo"><b>Logo izquierdo</b><div class="pl-img-prev" id="pl-c-izq">${borrador.logo_izq ? prev([borrador.logo_izq], 'izq') : ''}</div><input type="file" accept="image/*" id="pl-c-izq-f"></div>
    <div class="grupo"><b>Logos derecha (federación, auspiciantes)</b><div class="pl-img-prev" id="pl-c-der">${prev(borrador.logos_der, 'der')}</div><input type="file" accept="image/*" id="pl-c-der-f"></div>
    ${[0, 1].map(i => `<div class="grupo"><b>Firma ${i + 1}</b>
      <div class="fila"><div><label>Nombre</label><input type="text" data-firma="${i}" data-k="nombre" value="${esc(borrador.firmas[i].nombre || '')}" placeholder="Sr. ..."></div>
      <div><label>Cargo</label><input type="text" data-firma="${i}" data-k="cargo" value="${esc(borrador.firmas[i].cargo || '')}"></div></div>
      <label>Imagen de la firma (opcional)</label><div class="pl-img-prev" id="pl-c-f${i}">${borrador.firmas[i].img ? prev([borrador.firmas[i].img], 'f' + i) : ''}</div><input type="file" accept="image/*" data-firma-img="${i}"></div>`).join('')}
    <p style="margin-top:12px;">Las imágenes se guardan en el servidor con un enlace imposible de adivinar, pero quien tenga el enlace puede verlas. Si preferís, dejá la firma sin imagen y firmá a mano al imprimir.</p>
    <div class="acciones"><button type="button" class="pl-btn" data-cerrar>Cancelar</button><button type="button" class="pl-btn primario" id="pl-c-guardar">Guardar</button></div>`);
  const refrescar = () => {
    d.querySelector('#pl-c-izq').innerHTML = borrador.logo_izq ? prev([borrador.logo_izq], 'izq') : '';
    d.querySelector('#pl-c-der').innerHTML = prev(borrador.logos_der, 'der');
    [0, 1].forEach(i => { d.querySelector('#pl-c-f' + i).innerHTML = borrador.firmas[i].img ? prev([borrador.firmas[i].img], 'f' + i) : ''; });
  };
  const subir = async (input, alListo) => {
    const f = input.files[0]; if (!f) return;
    input.disabled = true;
    try { alListo(await subirImagen(f)); refrescar(); } catch (e) { toast('No se pudo subir la imagen: ' + e.message, true); }
    input.disabled = false; input.value = '';
  };
  d.querySelector('#pl-c-izq-f').onchange = e => subir(e.target, u => { borrador.logo_izq = u; });
  d.querySelector('#pl-c-der-f').onchange = e => subir(e.target, u => { borrador.logos_der.push(u); });
  d.querySelectorAll('[data-firma-img]').forEach(inp => inp.onchange = e => subir(e.target, u => { borrador.firmas[+inp.dataset.firmaImg].img = u; }));
  d.addEventListener('click', e => {
    const b = e.target.closest('[data-borrar-img]'); if (!b) return;
    const g = b.dataset.borrarImg;
    if (g === 'izq') borrador.logo_izq = '';
    else if (g === 'der') borrador.logos_der.splice(+b.dataset.i, 1);
    else borrador.firmas[+g.slice(1)].img = '';
    refrescar();
  });
  d.querySelector('#pl-c-guardar').onclick = async () => {
    d.querySelectorAll('[data-titulo]').forEach(i => { borrador.titulos[+i.dataset.titulo] = i.value.trim(); });
    d.querySelectorAll('[data-firma]').forEach(i => { borrador.firmas[+i.dataset.firma][i.dataset.k] = i.value.trim(); });
    borrador.fecha = d.querySelector('#pl-c-fecha').value.trim();
    borrador.hora_publicacion = d.querySelector('#pl-c-hora').value.trim();
    const { error } = await db().from('planillas').upsert({ rally_id: estado.rally.id, config: borrador, updated_at: new Date().toISOString() });
    if (error) return toast('No se pudo guardar: ' + error.message + (/planillas/.test(error.message) ? ' (¿corriste el script 65?)' : ''), true);
    estado.config = borrador;
    d.remove();
    dibujar();
    toast('Encabezado guardado.');
  };
}

// ------------------------------------------------------------------
// Descargar Excel con el formato de la planilla oficial
// ------------------------------------------------------------------
const letra = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const DIA = 86400000;

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
  if (!estado.rally || !estado.pes.length) return;
  const btn = $('pl-excel'); btn.disabled = true; btn.textContent = 'Generando…';
  try {
    const c = cfg();
    const grupos = clasificar();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'AMADESU RALLYS';
    const ws = wb.addWorksheet('TIEMPOS', {
      views: [{ state: 'frozen', xSplit: 5, ySplit: 7 }],
      pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
    });
    const F = (size, extra = {}) => ({ name: 'Cambria', size, ...extra });
    const borde = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    const centro = { horizontal: 'center', vertical: 'middle', wrapText: true };

    // Columnas
    const cols = [{ t: 'Nro', w: 4.6, f: 10 }, { t: 'Psto.', w: 6.9, f: 10 }, { t: 'Nº COCHE', w: 8.9, f: 12 }, { t: 'CLASE', w: 16.9, f: 12 }, { t: 'PILOTO / NAVEGANTE', w: 62, f: 14, b: true, i: true }, { t: 'ASOCIACION', w: 17.9, f: 12 }];
    const pos = {}; // ids de PE -> columnas
    for (const et of estado.etapas) {
      for (const pe of et.recorridos) {
        pos[pe.id] = { s: cols.length + 1, p: cols.length + 2, t: cols.length + 3 };
        cols.push({ t: 'Hr. Salida', w: 10.7, f: 12 }, { t: `Hr. Paso P${pe.numero}`, w: 13.7, f: 12 }, { t: `PE${pe.numero}`, w: 11, f: 16, b: true });
      }
      pos[et.id] = cols.length + 1;
      cols.push({ t: et.nombre.toUpperCase(), w: 16.8, f: 16, b: true });
    }
    const cPen = cols.length + 1, cGen = cols.length + 2, cVel = cols.length + 3, cAnt = cols.length + 4, cPri = cols.length + 5;
    cols.push({ t: 'penalización', w: 13, f: 12 }, { t: 'GENERAL', w: 13, f: 16, b: true }, { t: 'Promedio Velocidad km/h', w: 11.8, f: 11 }, { t: 'DIF. CON ANTERIOR', w: 10.6, f: 10 }, { t: 'DIF. CON PRIMERO', w: 10.9, f: 10 });
    const N = cols.length;
    ws.columns = cols.map(x => ({ width: x.w }));

    // Encabezado
    c.titulos.forEach((t, i) => {
      ws.mergeCells(i + 1, 1, i + 1, N);
      const cel = ws.getCell(i + 1, 1);
      cel.value = t || null; cel.font = F(18, { bold: true }); cel.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(i + 1).height = 22.8;
    });
    ws.getRow(5).height = 28.8; ws.getRow(6).height = 18; ws.getRow(7).height = 41.4;
    ws.getCell('A5').value = c.fecha || null; ws.getCell('A5').font = F(11, { bold: true });
    ws.getCell('A6').value = 'Hora de Publicación:'; ws.getCell('A6').font = F(11, { italic: true });
    ws.getCell('D6').value = c.hora || null; ws.getCell('D6').font = F(12, { italic: true }); ws.getCell('D6').alignment = { horizontal: 'left' };
    ws.getCell('E6').value = 'Kilometraje total:'; ws.getCell('E6').font = { name: 'Arial', size: 11 }; ws.getCell('E6').alignment = { horizontal: 'right' };
    const kmTotal = estado.pes.reduce((a, p) => a + p.km, 0);
    ws.getCell('F6').value = Number(kmTotal.toFixed(2)); ws.getCell('F6').font = { name: 'Calibri', size: 12 }; ws.getCell('F6').border = borde; ws.getCell('F6').alignment = { horizontal: 'left' };

    cols.forEach((x, i) => {
      const cel = ws.getCell(7, i + 1);
      cel.value = x.t; cel.font = F(x.f, { bold: !!x.b, italic: !!x.i, color: { argb: 'FFFFFFFF' } });
      cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } }; cel.border = borde; cel.alignment = centro;
    });

    // Filas (siempre por resultado, como la planilla oficial)
    let r = 8, nro = 0;
    const L = letra;
    const clases = ordenarClases(Object.keys(grupos));
    clases.forEach((cl, ci) => {
      let primeraFila = null, filaAnterior = null;
      for (const f of grupos[cl]) {
        nro++;
        const fila = ws.getRow(r); fila.height = 30;
        const i = f.ins;
        const piloto = i.piloto ? `${i.piloto.nombre} ${i.piloto.apellido}`.trim() : '';
        const nav = i.navegante ? `${i.navegante.nombre} ${i.navegante.apellido}`.trim() : '';
        const put = (col, valor, opc = {}) => {
          const cel = ws.getCell(r, col);
          cel.value = valor ?? null;
          cel.font = F(opc.f || 12, { bold: !!opc.b, italic: !!opc.i, color: opc.color ? { argb: opc.color } : undefined });
          cel.alignment = centro; cel.border = borde;
          if (opc.fmt) cel.numFmt = opc.fmt;
          if (opc.fill) cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opc.fill } };
        };
        put(1, nro, { f: 11, b: true }); put(2, f.psto ?? null, { f: 11, b: true }); put(3, Number(i.numero) || i.numero, { f: 14 });
        put(4, cl, {}); put(5, nav ? `${piloto}//${nav}` : piloto, { b: true }); put(6, i.asociacion?.nombre || null, { b: true });
        for (const et of estado.etapas) {
          const celdasPE = [];
          for (const pe of et.recorridos) {
            const p = f.porPE[pe.id], ps = pos[pe.id];
            put(ps.s, p.salidaMs != null ? p.salidaMs / DIA : null, { fmt: 'h:mm' });
            if (p.especial) put(ps.p, ESPECIALES[p.especial], { f: 11, b: true, color: 'FFC0392B' });
            else put(ps.p, p.pasoMs != null ? p.pasoMs / DIA : null, { fmt: 'h:mm:ss.0' });
            if (p.salidaMs != null && p.pasoMs != null && p.brutoMs) put(ps.t, { formula: `${L(ps.p)}${r}-${L(ps.s)}${r}`, result: p.brutoMs / DIA }, { f: 14, fmt: 'mm:ss.0' });
            else put(ps.t, p.brutoMs ? p.brutoMs / DIA : null, { f: 14, fmt: 'mm:ss.0' });
            celdasPE.push(`${L(ps.t)}${r}`);
          }
          const e = f.etapas[et.id];
          put(pos[et.id], e.alguna ? { formula: celdasPE.join('+'), result: e.ms / DIA } : null, { f: 16, b: true, fmt: 'h:mm:ss.0', fill: 'FFF2F2F2', i: !e.completa });
        }
        put(cPen, f.penal ? f.penal / DIA : null, { fmt: 'mm:ss' });
        const etapasRef = estado.etapas.map(et => `${L(pos[et.id])}${r}`).join('+');
        if (f.completa) {
          put(cGen, { formula: `${etapasRef}+${L(cPen)}${r}`, result: f.general / DIA }, { f: 16, b: true, fmt: 'h:mm:ss.0', fill: 'FFDCE6F2' });
          put(cVel, { formula: `$F$6/((${L(cGen)}${r}-${L(cPen)}${r})*24)`, result: f.vel }, { f: 11, fmt: '0.00' });
          if (primeraFila == null) { put(cAnt, null); put(cPri, null); primeraFila = r; }
          else {
            put(cAnt, { formula: `${L(cGen)}${r}-${L(cGen)}${filaAnterior}`, result: f.difAnterior / DIA }, { f: 11, fmt: '\\+mm:ss.0' });
            put(cPri, { formula: `${L(cGen)}${r}-${L(cGen)}$${primeraFila}`, result: f.difPrimero / DIA }, { f: 11, fmt: '\\+mm:ss.0' });
          }
          filaAnterior = r;
        } else {
          const txt = f.especial ? ESPECIALES[f.especial] : f.completas ? `Faltan ${estado.pes.length - f.completas} PE` : null;
          put(cGen, txt, { f: f.especial ? 12 : 11, b: !!f.especial, i: !f.especial, fill: 'FFDCE6F2', color: f.especial ? 'FFC0392B' : 'FF777777' });
          put(cVel, f.vel ? Number(f.vel.toFixed(2)) : null, { f: 11, fmt: '0.00' });
          put(cAnt, null); put(cPri, null);
        }
        r++;
      }
      if (ci < clases.length - 1) { ws.getRow(r).height = 15; r++; }
    });

    // Firmas
    const filaFirma = r + 4;
    const lugares = [5, Math.min(N - 6, 12)];
    c.firmas.slice(0, 2).forEach((fi, k) => {
      const col = lugares[k];
      const ancho = k === 0 ? 0 : 6;
      if (ancho) ws.mergeCells(filaFirma, col, filaFirma, col + ancho);
      if (ancho) ws.mergeCells(filaFirma + 1, col, filaFirma + 1, col + ancho);
      const n = ws.getCell(filaFirma, col), cg = ws.getCell(filaFirma + 1, col);
      n.value = fi.nombre || null; n.font = { name: 'Calibri', size: 12 }; n.alignment = { horizontal: 'center' };
      n.border = { top: { style: 'thin' } };
      cg.value = fi.cargo || null; cg.font = { name: 'Calibri', size: 11, bold: true }; cg.alignment = { horizontal: 'center', vertical: 'top' };
    });

    // Imágenes
    const ponerImagen = async (url, col, fila, altoPx) => {
      const im = await imagenParaExcel(wb, url);
      if (!im) return;
      const alto = altoPx, ancho = Math.round(im.w * (alto / im.h));
      ws.addImage(im.id, { tl: { col, row: fila }, ext: { width: ancho, height: alto }, editAs: 'oneCell' });
    };
    if (c.logoIzq) await ponerImagen(c.logoIzq, 0.2, 0.1, 130);
    let colDer = N - 1.2;
    for (const u of [...c.logosDer].reverse()) { await ponerImagen(u, Math.max(6, colDer), 0.2, 80); colDer -= 2.2; }
    for (const [k, fi] of c.firmas.slice(0, 2).entries()) if (fi.img) await ponerImagen(fi.img, lugares[k] - (k === 0 ? 0.6 : -1.5), filaFirma - 4, 90);

    ws.pageSetup.printArea = `A1:${letra(N)}${filaFirma + 2}`;
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `PLANILLA - ${estado.rally.nombre.replace(/[\\/:*?"<>|]/g, '')}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Excel descargado.');
  } catch (e) {
    toast('No se pudo generar el Excel: ' + (e.message || e), true);
  } finally {
    btn.disabled = false; btn.textContent = '⬇ Descargar Excel';
  }
}

// ------------------------------------------------------------------
// Eventos
// ------------------------------------------------------------------
$('pl-marco').addEventListener('click', e => {
  const pen = e.target.closest('td[data-penal]');
  if (pen) return abrirPenales(pen.dataset.penal);
  const td = e.target.closest('td.ed');
  if (!td || td.querySelector('input')) return;
  if (td.classList.contains('error')) { const a = idCelda(td); guardar(a.ins, a.rec); return; }
  if (tactil) empezarEdicion(td); else seleccionar(td);
});
$('pl-marco').addEventListener('dblclick', e => { const td = e.target.closest('td.ed'); if (td && !td.querySelector('input')) empezarEdicion(td); });

document.addEventListener('keydown', e => {
  if (estado.editando || !estado.activa || document.querySelector('.pl-dialogo-fondo')) return;
  const td = celdaDe(estado.activa);
  if (!td) return;
  const flechas = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  if (flechas[e.key]) { e.preventDefault(); mover(td, ...flechas[e.key]); }
  else if (e.key === 'Tab') { e.preventDefault(); mover(td, e.shiftKey ? -1 : 1, 0); }
  else if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); empezarEdicion(td); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); confirmar(td, '', 'borrar'); }
  else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); empezarEdicion(td, e.key); }
});

// Teclas rápidas en celular
$('pl-teclas').addEventListener('pointerdown', () => { estado.usandoTeclas = true; });
$('pl-teclas').addEventListener('click', e => {
  const b = e.target.closest('[data-especial]');
  estado.usandoTeclas = false;
  if (!b || !estado.activa) return;
  const td = celdaDe(estado.activa);
  if (!td) return;
  const tipo = b.dataset.especial;
  if (tipo === 'listo') confirmar(td, td.querySelector('input')?.value ?? '');
  else confirmar(td, '', tipo);
});

document.querySelectorAll('.pl-orden button').forEach(b => b.onclick = () => {
  estado.orden = b.dataset.orden;
  try { localStorage.setItem('pl_orden', estado.orden); } catch (e) { }
  document.querySelectorAll('.pl-orden button').forEach(x => x.classList.toggle('activo', x === b));
  dibujar();
});
$('pl-clase').onchange = () => { estado.clase = $('pl-clase').value; dibujar(); };
$('pl-ir').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const tr = document.querySelector(`tr[data-num="${CSS.escape($('pl-ir').value.trim())}"]`);
  if (!tr) return toast('No hay ningún auto con ese número' + (estado.clase ? ' en esta clase.' : '.'), true);
  tr.classList.add('destacada'); setTimeout(() => tr.classList.remove('destacada'), 2500);
  const primera = [...tr.querySelectorAll('td.ed')].find(td => !td.textContent.trim()) || tr.querySelector('td.ed');
  seleccionar(primera);
  if (tactil) empezarEdicion(primera);
  $('pl-ir').value = '';
});
$('pl-excel').onclick = descargarExcel;
$('pl-config').onclick = abrirConfig;
$('pl-ayuda-x')?.addEventListener('click', () => { $('pl-ayuda').remove(); try { localStorage.setItem('pl_sin_ayuda', '1'); } catch (e) { } });
window.addEventListener('beforeunload', e => { if ([...estado.guardando.values()].includes('guardando')) { e.preventDefault(); e.returnValue = ''; } });

iniciar();
