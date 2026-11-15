// Página pública: Ranking del campeonato (pilotos y navegantes, por clase).
import { supabase } from './supabase_config.js';
import { ranking, camposDe, corrio, totalFecha, verPts, esc, nombreCorto, imagenRanking, compartirImagen, descargarBlob, archivoDe } from './ranking_comun.js';

const db = () => supabase.schema('rally');
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const estado = { camps: [], camp: null, filas: [], rol: params.get('rol') === 'navegante' ? 'navegante' : 'piloto', clase: '', buscar: '', abierta: null };

const ICO = {
  imagen: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>',
  bajar: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M5 21h14"/></svg>',
  compartir: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4"/><path d="m15.4 6.5-6.8 4"/></svg>',
  cerrar: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  flecha: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
};

const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
const leer = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };

async function iniciar() {
  try {
    const { data, error } = await db().from('ranking_campeonatos').select('id, titulo, subtitulo, fecha_corte, fechas, orden_clases, updated_at').eq('publicado', true).is('deleted_at', null).order('updated_at', { ascending: false });
    if (error) throw error;
    estado.camps = data || [];
    guardar('rk_camps', estado.camps);
  } catch (e) {
    estado.camps = leer('rk_camps') || [];
    if (estado.camps.length) $('rk-nota').hidden = false, $('rk-nota').textContent = 'Sin conexión: se muestra el último ranking guardado en este equipo.';
  }
  if (!estado.camps.length) {
    $('rk-titulo').textContent = 'Ranking del campeonato';
    $('rk-sub').textContent = '';
    $('rk-cuerpo').innerHTML = '<div class="rk-vacio">Todavía no hay ningún ranking publicado. Volvé pronto.</div>';
    return;
  }
  const sel = $('rk-camp');
  if (estado.camps.length > 1) {
    sel.innerHTML = estado.camps.map(c => `<option value="${c.id}">${esc(c.titulo)}</option>`).join('');
    sel.hidden = false;
    sel.onchange = () => abrir(sel.value);
  }
  const pedido = estado.camps.find(c => c.id === params.get('c')) || estado.camps[0];
  sel.value = pedido.id;
  await abrir(pedido.id);
}

async function abrir(id) {
  estado.camp = estado.camps.find(c => c.id === id);
  estado.clase = ''; estado.abierta = null;
  const c = estado.camp;
  $('rk-titulo').textContent = c.titulo;
  $('rk-sub').innerHTML = [c.subtitulo, c.fecha_corte].filter(Boolean).map(esc).join('<span class="rk-punto">·</span>');
  document.title = `Ranking — ${c.titulo}`;
  $('rk-cuerpo').innerHTML = '<div class="rk-cargando"><span></span><span></span><span></span></div>';
  try {
    const filas = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await db().from('ranking_filas').select('id, rol, clase, nombre, numero, puntos').eq('campeonato_id', id).order('created_at').range(desde, desde + 999);
      if (error) throw error;
      filas.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    estado.filas = filas;
    guardar('rk_filas_' + id, filas);
  } catch (e) {
    estado.filas = leer('rk_filas_' + id) || [];
    if (!estado.filas.length) { $('rk-cuerpo').innerHTML = '<div class="rk-vacio">No se pudo cargar el ranking. Revisá tu conexión.</div>'; return; }
  }
  const u = new URL(location.href); u.searchParams.set('c', id); history.replaceState(null, '', u);
  $('rk-controles').hidden = false;
  pintar();
}

function pintarClases(grupos) {
  const cont = $('rk-clases');
  cont.innerHTML = [['', 'Todas']].concat(grupos.map(g => [g.clase, g.clase])).map(([v, t]) =>
    `<button type="button" data-clase="${esc(v)}" class="${estado.clase === v ? 'activo' : ''}">${esc(t)}</button>`).join('');
}

function pintar() {
  const c = estado.camp, fechas = c.fechas || [];
  document.querySelectorAll('.rk-tabs button').forEach(b => b.classList.toggle('activo', b.dataset.rol === estado.rol));
  const grupos = ranking(c, estado.filas, estado.rol);
  if (estado.clase && !grupos.some(g => g.clase === estado.clase)) estado.clase = '';
  pintarClases(grupos);
  const q = estado.buscar.trim().toUpperCase();
  const html = grupos.filter(g => !estado.clase || g.clase === estado.clase).map(g => {
    const filas = q ? g.filas.filter(f => f.nombre.includes(q) || String(f.numero) === q) : g.filas;
    if (!filas.length) return '';
    return `<section class="rk-clase">
      <header class="rk-clase-cab"><h2>${esc(g.clase)}</h2><span>${g.filas.length} ${estado.rol === 'piloto' ? 'piloto' : 'navegante'}${g.filas.length > 1 ? 's' : ''}</span></header>
      <ol class="rk-lista">${filas.map(f => filaHtml(f, g, fechas)).join('')}</ol>
    </section>`;
  }).join('');
  $('rk-cuerpo').innerHTML = html || `<div class="rk-vacio">${q ? 'No hay nadie con ese nombre.' : 'Todavía no hay puntos cargados.'}</div>`;
}

function filaHtml(f, g, fechas) {
  const top = f.psto <= 3 ? ` p${f.psto}` : '';
  const max = Math.max(1, ...g.filas.map(x => x.total));
  const abierta = estado.abierta === f.id;
  const chips = fechas.map(x => {
    const fue = corrio(f, x);
    return `<span class="rk-chip ${fue ? '' : 'no'}" title="${esc(x.nombre)}">${fue ? verPts(totalFecha(f, x)) : '–'}</span>`;
  }).join('');
  const detalle = abierta ? `<div class="rk-detalle">
      <table><thead><tr><th>Fecha</th><th>Detalle</th><th>Pts</th></tr></thead><tbody>
      ${fechas.map(x => {
        const fue = corrio(f, x);
        const partes = camposDe(x).map(([k, , corto]) => `<span><small>${corto}</small>${fue ? verPts(f.puntos?.[x.id]?.[k] ?? 0) : '–'}</span>`).join('');
        return `<tr class="${fue ? '' : 'no'}"><td>${esc(x.nombre)}<small>${x.tipo === 'circuito' ? 'Circuito' : 'Rally'}</small></td><td class="rk-partes">${partes}</td><td class="rk-pts">${fue ? verPts(totalFecha(f, x)) : '–'}</td></tr>`;
      }).join('')}
      </tbody><tfoot><tr><td colspan="2">Total</td><td class="rk-pts">${verPts(f.total)}</td></tr></tfoot></table>
      <button type="button" class="rk-btn-imagen grande" data-imagen="${f.id}">${ICO.imagen} Crear imagen para redes</button>
    </div>` : '';
  return `<li class="rk-fila${top}${abierta ? ' abierta' : ''}" data-id="${f.id}">
    <button type="button" class="rk-fila-btn" data-abrir="${f.id}" aria-expanded="${abierta}">
      <span class="rk-pos">${f.psto}</span>
      <span class="rk-nombre"><b>${esc(f.nombre)}</b>
        <span class="rk-meta">${f.numero ? `<i>#${esc(f.numero)}</i>` : ''}<span class="rk-chips">${chips}</span></span>
        <span class="rk-barra"><i style="width:${(f.total / max * 100).toFixed(1)}%"></i></span>
      </span>
      <span class="rk-total"><b>${verPts(f.total)}</b><small>pts</small></span>
      <span class="rk-flecha">${ICO.flecha}</span>
    </button>
    <button type="button" class="rk-btn-imagen" data-imagen="${f.id}" title="Imagen para redes sociales" aria-label="Crear imagen de ${esc(f.nombre)} para redes">${ICO.imagen}</button>
    ${detalle}
  </li>`;
}

// ------------------------------------------------------------------
// Imagen para redes
// ------------------------------------------------------------------
async function abrirImagen(id) {
  const c = estado.camp;
  const g = ranking(c, estado.filas, estado.rol).find(x => x.filas.some(f => f.id === id));
  const f = g?.filas.find(x => x.id === id);
  if (!f) return;
  const fondo = document.createElement('div');
  fondo.className = 'rk-modal-fondo';
  fondo.innerHTML = `<div class="rk-modal" role="dialog" aria-modal="true" aria-label="Imagen para redes">
    <button type="button" class="rk-modal-x" aria-label="Cerrar">${ICO.cerrar}</button>
    <div class="rk-modal-img"><div class="rk-cargando"><span></span><span></span><span></span></div></div>
    <div class="rk-modal-acc">
      <button type="button" class="rk-btn-p" id="rk-compartir" disabled>${ICO.compartir} Compartir</button>
      <button type="button" class="rk-btn-s" id="rk-bajar" disabled>${ICO.bajar} Descargar</button>
    </div>
    <p class="rk-modal-nota">Lista para Instagram, Facebook o WhatsApp (1080 × 1350).</p>
  </div>`;
  const cerrar = () => { fondo.classList.remove('visible'); setTimeout(() => fondo.remove(), 200); document.removeEventListener('keydown', tecla); };
  const tecla = e => { if (e.key === 'Escape') cerrar(); };
  fondo.addEventListener('click', e => { if (e.target === fondo || e.target.closest('.rk-modal-x')) cerrar(); });
  document.addEventListener('keydown', tecla);
  document.body.appendChild(fondo);
  requestAnimationFrame(() => fondo.classList.add('visible'));

  const cv = await imagenRanking({ camp: c, fila: f, rol: estado.rol, clase: g.clase, lista: g.filas });
  const cont = fondo.querySelector('.rk-modal-img');
  cont.innerHTML = '';
  const img = new Image(); img.alt = `Ranking de ${f.nombre}`; img.src = cv.toDataURL('image/png');
  cont.appendChild(img);
  const nombre = archivoDe(`RANKING ${f.nombre} ${g.clase}.png`);
  const texto = `${f.psto}° en ${g.clase} con ${verPts(f.total)} puntos — ${c.titulo}. Mirá el ranking completo en https://amadesu.com/ranking`;
  const bComp = fondo.querySelector('#rk-compartir'), bBajar = fondo.querySelector('#rk-bajar');
  bComp.disabled = bBajar.disabled = false;
  if (!navigator.canShare) bComp.hidden = true;
  bComp.onclick = async () => { const r = await compartirImagen(cv, nombre, texto); if (r === 'descargada') aviso('Imagen descargada'); };
  bBajar.onclick = () => cv.toBlob(b => { descargarBlob(b, nombre); aviso('Imagen descargada'); }, 'image/png');
}

function aviso(t) {
  const d = document.createElement('div');
  d.className = 'rk-toast'; d.textContent = t;
  document.body.appendChild(d);
  requestAnimationFrame(() => d.classList.add('visible'));
  setTimeout(() => { d.classList.remove('visible'); setTimeout(() => d.remove(), 300); }, 2600);
}

// ------------------------------------------------------------------
// Eventos
// ------------------------------------------------------------------
document.querySelector('.rk-tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-rol]'); if (!b) return;
  estado.rol = b.dataset.rol; estado.abierta = null;
  const u = new URL(location.href); if (estado.rol === 'navegante') u.searchParams.set('rol', 'navegante'); else u.searchParams.delete('rol'); history.replaceState(null, '', u);
  pintar();
});
$('rk-clases').addEventListener('click', e => {
  const b = e.target.closest('button[data-clase]'); if (!b) return;
  estado.clase = b.dataset.clase; pintar();
});
$('rk-buscar').addEventListener('input', e => { estado.buscar = e.target.value; pintar(); });
$('rk-cuerpo').addEventListener('click', e => {
  const im = e.target.closest('[data-imagen]'); if (im) return abrirImagen(im.dataset.imagen);
  const ab = e.target.closest('[data-abrir]'); if (ab) { estado.abierta = estado.abierta === ab.dataset.abrir ? null : ab.dataset.abrir; pintar(); }
});

iniciar();
