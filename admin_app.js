// Central > "App y Visitas": instalaciones, visitas y avisos (notificaciones).
import { supabase } from './supabase_config.js';

const db = () => supabase.schema('rally');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => Number(n || 0).toLocaleString('es-BO');
const toast = (m, t) => (window.toast ? window.toast(m, t) : alert(m));

const PERIODOS = [{ d: 1, t: '24 h' }, { d: 7, t: '7 días' }, { d: 30, t: '30 días' }, { d: 90, t: '90 días' }];
const SECCIONES = { tiempos: 'Tiempos', pilotos: 'Pilotos', stats: 'Estadísticas' };
const ESTADO_AVISO = {
  enviado: ['ok', 'Enviado'], pendiente: ['espera', 'En espera'], enviando: ['espera', 'Enviando…'],
  omitido: ['gris', 'Omitido'], error: ['mal', 'Error'],
};
const ICONO_TIPO = { nuevo: '🏁', publicacion: '📄', largada: '🟢', hoy: '📅', fin: '🏆', manual: '✉️' };

let dias = 30;
let rallies = [];
let datos = null;
let temporizador = null;

function raiz() { return document.getElementById('av-raiz'); }
const seccionVisible = () => document.getElementById('section-app-visitas')?.classList.contains('active');

window.initAppVisitasSection = async function () {
  if (!rallies.length) {
    const { data } = await db().from('rallies').select('id, nombre, fecha_inicio').is('deleted_at', null).order('fecha_inicio', { ascending: false });
    rallies = data || [];
  }
  await cargar();
  clearInterval(temporizador);
  // Se actualiza sola cada 30 s, salvo mientras se escribe un aviso (no se pierde lo escrito).
  const escribiendo = () => { const f = document.getElementById('av-form'); return !!document.querySelector('.av-editar-form') || (!!f && (f.contains(document.activeElement) || [...f.querySelectorAll('input, textarea')].some(i => i.value.trim()))); };
  temporizador = setInterval(() => { if (seccionVisible() && !document.hidden && !escribiendo()) cargar(true); }, 30000);
};

async function cargar(silencioso = false) {
  if (!silencioso) raiz().innerHTML = '<p class="av-vacio">Cargando estadísticas…</p>';
  const { data, error } = await db().rpc('app_estadisticas', { p_dias: dias });
  if (error) {
    raiz().innerHTML = `<div class="card-panel av-aviso-config mal">
      <h3>Falta activar las estadísticas</h3>
      <p>Corré el script <b>files/62_app_visitas_y_avisos.sql</b> en el SQL Editor y volvé a abrir esta sección.</p>
      <p class="av-mini">Detalle: ${esc(error.message)}</p></div>`;
    return;
  }
  datos = data;
  // En línea de verdad y alcance de los avisos (script 69). Si todavía no
  // se corrió, queda lo de antes ("últimos 5 minutos").
  try {
    const { data: vivo, error: e2 } = await db().rpc('app_en_vivo');
    if (!e2 && vivo) {
      datos.vivo = vivo;
      const alcance = new Map((vivo.avisos || []).map(a => [a.id, a]));
      (datos.avisos || []).forEach(a => { const x = alcance.get(a.id); if (x) Object.assign(a, { recibidos: x.recibidos, abiertos: x.abiertos }); });
    }
  } catch (e) { }
  // Historial editable (script 71): sin los borrados y con el enlace de cada aviso.
  try {
    const { data: lista, error: e3 } = await db().rpc('app_avisos_admin');
    if (!e3 && Array.isArray(lista)) { datos.avisos = lista; datos.puedeEditar = true; }
  } catch (e) { }
  pintar();
}

function opcionesDestino(actual) {
  const ops = [['index.html', 'Portada (lista de carreras)']].concat(rallies.flatMap(r => [
    [`index.html?rally=${r.id}&ver=tiempos`, `Tiempos — ${r.nombre}`], [`info.html?id=${r.id}`, `Información — ${r.nombre}`]]));
  if (actual && !ops.some(o => o[0] === actual)) ops.unshift([actual, `Enlace actual: ${actual}`]);
  if (!actual) ops.unshift(['', 'No abre nada (solo el texto)']);
  return ops.map(([v, t]) => `<option value="${esc(v)}" ${v === (actual || '') ? 'selected' : ''}>${esc(t)}</option>`).join('');
}

// Qué está mirando la gente que está en línea.
const QUE_MIRA = { tiempos: 'Tiempos', pilotos: 'Pilotos', stats: 'Estadísticas', inicio: 'Portada (lista de carreras)', info: 'Información de la carrera' };
function enVivo(v) {
  if (!v) return '';
  const filas = (v.mirando || []).map(m => ({ nombre: (QUE_MIRA[m.que] || m.que) + (m.rally && m.que !== 'inicio' ? ` — ${m.rally}` : ''), n: m.n }));
  return `<div class="card-panel av-ancho"><div class="av-titulo-graf"><h3>🟢 En línea ahora: qué están mirando</h3><span class="av-mini">se actualiza solo cada 30 segundos</span></div>
    ${lista(filas, 'personas', 'Ahora mismo no hay nadie con la página abierta.')}</div>`;
}

// ------------------------------------------------------------------
function pintar() {
  const d = datos;
  const linkApp = new URL('index.html', location.href).href;
  const textoWa = `Descargá la app de AMADESU RALLYS: tiempos en vivo, boletines y avisos de cada largada 🏁 ${linkApp}`;

  raiz().innerHTML = `
    <div class="av-cabecera">
      <div>
        <h2>App y Visitas</h2>
        <p>Quiénes entran, cuántos instalaron la app y los avisos que reciben. Los visitantes son anónimos: se cuenta cada celular o PC, sin pedir datos personales.</p>
      </div>
      <div class="av-controles">
        <div class="av-periodos" role="group" aria-label="Período">
          ${PERIODOS.map(p => `<button type="button" class="av-chip ${p.d === dias ? 'activo' : ''}" data-dias="${p.d}">${p.t}</button>`).join('')}
        </div>
        <button type="button" class="btn-secondary av-recargar" title="Actualizar">↻ Actualizar</button>
      </div>
    </div>

    <div class="card-panel av-compartir">
      <div class="av-compartir-txt">
        <h3>📲 Invitá a instalar la app</h3>
        <p>Compartí este enlace (grupos de WhatsApp, redes, pantallas en el parque). Al abrirlo, el celular ofrece <b>“Instalar”</b>; en iPhone se muestran los pasos.</p>
      </div>
      <div class="av-compartir-acciones">
        <input type="text" class="form-control" readonly value="${esc(linkApp)}" id="av-link">
        <button type="button" class="btn-secondary" id="av-copiar">Copiar</button>
        <a class="btn-primary av-wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(textoWa)}">WhatsApp</a>
      </div>
    </div>

    <div class="av-kpis">
      ${d.vivo ? kpi('En línea ahora', d.vivo.en_linea, `con la página abierta · ${num(d.vivo.en_app)} desde la app`, 'vivo') : kpi('En línea ahora', d.en_linea, 'últimos 5 minutos', 'vivo')}
      ${kpi('Visitantes', d.visitantes, `${num(d.nuevos)} nuevos · ${periodoTxt()}`)}
      ${kpi('Visitas', d.visitas, `páginas abiertas · ${periodoTxt()}`)}
      ${kpi('Hoy', d.visitantes_hoy, `visitantes · ${num(d.visitas_hoy)} visitas`)}
      ${kpi('Apps instaladas', d.instaladas, `${num(d.instaladas_periodo)} en ${periodoTxt()} · ${num(d.usan_app)} la usaron`, 'app')}
      ${kpi('Reciben avisos', d.suscriptos, 'celulares con avisos activos', 'aviso')}
    </div>

    <div class="card-panel">
      <div class="av-titulo-graf"><h3>Visitantes por día</h3><span class="av-mini">${periodoTxt()} · pasá el dedo o el mouse por las barras</span></div>
      ${graficoDias(d.por_dia || [])}
    </div>

    <div class="av-grilla">
      ${enVivo(d.vivo)}
      <div class="card-panel"><h3>Horas con más visitas</h3>${graficoHoras(d.por_hora || [])}</div>
      <div class="card-panel"><h3>Qué miran</h3>${lista((d.secciones || []).map(s => ({ nombre: SECCIONES[s.nombre] || s.nombre, n: s.n, sub: `${num(s.personas)} personas` })), 'veces abierto', 'Todavía nadie abrió Tiempos, Pilotos ni Estadísticas.')}</div>
      <div class="card-panel"><h3>Dispositivos</h3>${lista(d.dispositivos, 'visitantes')}</div>
      <div class="card-panel"><h3>Sistema</h3>${lista(d.sistemas, 'visitantes')}</div>
      <div class="card-panel"><h3>Navegador</h3>${lista(d.navegadores, 'visitantes')}</div>
      <div class="card-panel"><h3>De dónde llegan</h3>${lista((d.origenes || []).map(o => ({ nombre: o.nombre === 'app' ? 'App instalada' : o.nombre, n: o.n })), 'visitantes', 'Casi todos entran directo (escribiendo la dirección o desde un enlace sin origen).')}</div>
      <div class="card-panel av-ancho"><h3>Carreras más vistas</h3>${lista((d.rallies || []).map(r => ({ nombre: r.nombre, n: r.personas, sub: `${num(r.n)} vistas` })), 'personas', 'Todavía no hay visitas a carreras en este período.')}</div>
    </div>

    ${seccionAvisos(d)}
  `;
  conectar();
}

function periodoTxt() { return dias === 1 ? 'últimas 24 h' : `últimos ${dias} días`; }

function kpi(titulo, valor, sub, tono = '') {
  return `<div class="av-kpi ${tono}">
    <div class="av-kpi-titulo">${tono === 'vivo' ? '<i class="av-pulso"></i>' : ''}${esc(titulo)}</div>
    <div class="av-kpi-valor">${num(valor)}</div>
    <div class="av-kpi-sub">${esc(sub)}</div>
  </div>`;
}

// Barras verticales de un solo color (una serie, un eje); el número va en el tooltip.
function graficoDias(filas) {
  const porDia = Object.fromEntries(filas.map(f => [f.dia, f]));
  const hoy = new Date();
  const cant = Math.max(dias, 1);
  const serie = [];
  for (let i = cant - 1; i >= 0; i--) {
    const f = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - i);
    const clave = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
    serie.push({ clave, fecha: f, visitantes: porDia[clave]?.visitantes || 0, visitas: porDia[clave]?.visitas || 0 });
  }
  const max = Math.max(1, ...serie.map(s => s.visitantes));
  if (serie.every(s => s.visitantes === 0)) return '<p class="av-vacio">Todavía no hay visitas registradas en este período.</p>';
  const fmt = f => f.toLocaleDateString('es-BO', { day: 'numeric', month: 'short' });
  const etiquetas = serie.length === 1 ? [0] : [0, Math.floor((serie.length - 1) / 2), serie.length - 1];
  return `<div class="av-graf">
      <div class="av-graf-max">${num(max)}</div>
      <div class="av-barras ${serie.length > 45 ? 'densas' : ''}">
        ${serie.map(s => `<div class="av-barra-col" data-tip="${esc(`${fmt(s.fecha)}: ${num(s.visitantes)} visitantes · ${num(s.visitas)} visitas`)}">
          <div class="av-barra" style="height:${s.visitantes ? Math.max(3, s.visitantes / max * 100) : 0}%"></div></div>`).join('')}
      </div>
      <div class="av-eje">${etiquetas.map(i => `<span>${fmt(serie[i].fecha)}</span>`).join('')}</div>
    </div>`;
}

function graficoHoras(filas) {
  const por = Object.fromEntries(filas.map(f => [f.hora, f.visitas]));
  const serie = Array.from({ length: 24 }, (_, h) => ({ h, n: por[h] || 0 }));
  const max = Math.max(1, ...serie.map(s => s.n));
  if (serie.every(s => !s.n)) return '<p class="av-vacio">Sin datos todavía.</p>';
  const pico = serie.reduce((a, b) => (b.n > a.n ? b : a));
  return `<div class="av-graf chico">
      <div class="av-barras">
        ${serie.map(s => `<div class="av-barra-col" data-tip="${s.h}:00 a ${s.h}:59 — ${num(s.n)} visitas">
          <div class="av-barra ${s.h === pico.h ? 'pico' : ''}" style="height:${s.n ? Math.max(3, s.n / max * 100) : 0}%"></div></div>`).join('')}
      </div>
      <div class="av-eje"><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>23 h</span></div>
      <p class="av-mini">Hora pico: <b>${pico.h}:00</b> (hora de Bolivia)</p>
    </div>`;
}

// Lista con barra horizontal: nombre · barra · número · %.
function lista(filas, unidad, vacio = 'Sin datos todavía.') {
  filas = filas || [];
  if (!filas.length) return `<p class="av-vacio">${esc(vacio)}</p>`;
  const total = filas.reduce((a, f) => a + Number(f.n || 0), 0) || 1;
  const max = Math.max(...filas.map(f => Number(f.n || 0)), 1);
  return `<div class="av-lista">${filas.map(f => `
      <div class="av-fila" data-tip="${esc(`${f.nombre}: ${num(f.n)} ${unidad}${f.sub ? ' · ' + f.sub : ''}`)}">
        <div class="av-fila-nombre">${esc(f.nombre)}${f.sub ? `<small>${esc(f.sub)}</small>` : ''}</div>
        <div class="av-fila-barra"><i style="width:${Math.max(2, f.n / max * 100)}%"></i></div>
        <div class="av-fila-num">${num(f.n)} <small>${Math.round(f.n / total * 100)}%</small></div>
      </div>`).join('')}</div>`;
}

function seccionAvisos(d) {
  const opciones = ['<option value="index.html">Portada (lista de carreras)</option>']
    .concat(rallies.map(r => `<option value="index.html?rally=${r.id}&ver=tiempos">Tiempos — ${esc(r.nombre)}</option>
      <option value="info.html?id=${r.id}">Información — ${esc(r.nombre)}</option>`)).join('');
  const avisos = d.avisos || [];
  return `
    <div class="card-panel av-avisos">
      <div class="av-titulo-graf">
        <h3>🔔 Avisos (notificaciones)</h3>
        <span class="av-mini">${num(d.suscriptos)} celulares los reciben</span>
      </div>
      ${d.envio_configurado ? '' : `<div class="av-aviso-config">
        <b>El envío todavía no está activado.</b> Los avisos se guardan “en espera” y salen solos apenas se active.
        Seguí la guía <b>files/GUIA_APP_Y_AVISOS.md</b> (pasos 2 y 3).</div>`}
      <p class="av-mini" style="margin-bottom:14px;">Se mandan solos: carrera nueva, boletín, comunicado, reglamento, recorrido, “Hoy comienza”, largada de Shakedown/Clasificación, del rally, de cada Etapa, PE y Manga, y “Finalizó”.</p>

      <form id="av-form" class="av-form">
        <h4>Mandar un aviso ahora</h4>
        <div class="form-grid">
          <div class="form-group full-width">
            <label class="form-label">Título *</label>
            <input type="text" id="av-titulo" class="form-control" maxlength="120" placeholder="Ej: Cambio de horario de la PE5">
          </div>
          <div class="form-group full-width">
            <label class="form-label">Mensaje</label>
            <textarea id="av-cuerpo" class="form-control" rows="3" maxlength="300" placeholder="Ej: La PE5 se larga a las 15:30 por neblina."></textarea>
          </div>
          <div class="form-group full-width">
            <label class="form-label">Al tocar el aviso, abre…</label>
            <select id="av-destino" class="form-control">${opciones}</select>
          </div>
        </div>
        <div class="av-preview" aria-hidden="true">
          <img src="icons/icon-192.png" alt="">
          <div><b id="av-prev-titulo">Título del aviso</b><span id="av-prev-cuerpo">Así se va a ver en el celular.</span></div>
        </div>
        <button type="submit" class="btn-primary">Enviar a ${num(d.suscriptos)} celulares</button>
      </form>

      <h4 style="margin-top:22px;">Últimos avisos</h4>
      ${avisos.length ? `<div class="av-historial">${avisos.map(a => {
        const [tono, txt] = ESTADO_AVISO[a.estado] || ['gris', a.estado];
        const fecha = new Date(a.created_at).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const reintentar = ['pendiente', 'error', 'omitido'].includes(a.estado) && d.envio_configurado
          ? `<button type="button" class="btn-secondary av-reintentar" data-id="${a.id}">Enviar</button>` : '';
        const acciones = d.puedeEditar ? `<div class="av-item-acciones">
            <button type="button" class="btn-secondary av-editar" data-id="${a.id}" title="Corregir título, texto o adónde lleva">✏️ Editar</button>
            <button type="button" class="btn-secondary av-borrar" data-id="${a.id}" title="Quitar de Novedades y del historial">🗑 Eliminar</button></div>` : '';
        return `<div class="av-item" data-aviso="${a.id}">
          <div class="av-item-ico">${ICONO_TIPO[a.tipo] || '🔔'}</div>
          <div class="av-item-txt"><b>${esc(String(a.titulo || '').replace(/^\p{Extended_Pictographic}️?\s*/u, ''))}</b><span>${esc(a.cuerpo)}</span><small>${fecha}</small></div>
          <div class="av-item-estado"><span class="av-estado ${tono}">${txt}${a.estado === 'enviado' ? ` a ${num(a.enviados)}` : ''}</span>${a.recibidos != null && ['enviado', 'enviando'].includes(a.estado) ? `<small class="av-alcance" title="Recibido: llegó al celular · Abierto: la persona tocó el aviso">📥 Recibido por ${num(a.recibidos)} · 👆 Abierto por ${num(a.abiertos)}${a.enviados ? ` (${Math.round((a.abiertos || 0) / a.enviados * 100)}%)` : ''}</small>` : ''}${reintentar}${acciones}</div>
        </div>`;
      }).join('')}</div>` : '<p class="av-vacio">Todavía no se mandó ningún aviso.</p>'}
    </div>`;
}

// ------------------------------------------------------------------
function conectar() {
  const r = raiz();
  r.querySelectorAll('.av-chip').forEach(b => b.onclick = () => { dias = Number(b.dataset.dias); cargar(); });
  r.querySelector('.av-recargar').onclick = () => cargar();
  r.querySelector('#av-copiar').onclick = async () => {
    const inp = r.querySelector('#av-link');
    try { await navigator.clipboard.writeText(inp.value); } catch (e) { inp.select(); document.execCommand('copy'); }
    toast('Enlace copiado.', 'ok');
  };

  const t = r.querySelector('#av-titulo'), c = r.querySelector('#av-cuerpo');
  const prev = () => {
    r.querySelector('#av-prev-titulo').textContent = t.value.trim() || 'Título del aviso';
    r.querySelector('#av-prev-cuerpo').textContent = c.value.trim() || 'Así se va a ver en el celular.';
  };
  t.oninput = prev; c.oninput = prev;

  r.querySelector('#av-form').onsubmit = async (e) => {
    e.preventDefault();
    const titulo = t.value.trim();
    if (!titulo) { toast('Escribí un título.', 'warn'); t.focus(); return; }
    if (!confirm(`¿Mandar este aviso a ${num(datos.suscriptos)} celulares?\n\n${titulo}\n${c.value.trim()}`)) return;
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Enviando…';
    const { error } = await db().rpc('app_aviso_manual', { p_titulo: titulo, p_cuerpo: c.value.trim(), p_url: r.querySelector('#av-destino').value });
    if (error) { toast('No se pudo enviar: ' + error.message, 'error'); btn.disabled = false; btn.textContent = 'Enviar'; return; }
    toast(datos.envio_configurado ? 'Aviso enviado.' : 'Aviso guardado: sale apenas se active el envío.', 'ok');
    setTimeout(() => cargar(true), 2500);
    cargar(true);
  };

  // Eliminar un aviso
  r.querySelectorAll('.av-borrar').forEach(b => b.onclick = async () => {
    const a = (datos.avisos || []).find(x => x.id === Number(b.dataset.id));
    const yaSalio = a && ['enviado', 'enviando'].includes(a.estado);
    const msg = `¿Eliminar el aviso "${a?.titulo || ''}"?\n\nSe quita del panel de Novedades de la página y del historial.` +
      (yaSalio ? `\nOjo: a los ${num(a.enviados)} celulares que ya lo recibieron no se les puede borrar.` : '\nTodavía no salió: ya no se va a enviar.');
    const ok = window.confirmDialog ? await window.confirmDialog(msg.replace(/\n/g, '<br>'), { title: 'Eliminar aviso', confirmText: 'Eliminar', danger: true }) : confirm(msg);
    if (!ok) return;
    b.disabled = true;
    const { error } = await db().rpc('app_borrar_aviso', { p_id: Number(b.dataset.id) });
    if (error) { toast('No se pudo eliminar: ' + error.message, 'error'); b.disabled = false; return; }
    toast('Aviso eliminado.', 'ok');
    cargar(true);
  });

  // Editar un aviso (en el mismo lugar de la lista)
  r.querySelectorAll('.av-editar').forEach(b => b.onclick = () => {
    const a = (datos.avisos || []).find(x => x.id === Number(b.dataset.id));
    const item = b.closest('.av-item');
    if (!a || !item) return;
    const yaSalio = ['enviado', 'enviando'].includes(a.estado);
    item.classList.add('editando');
    item.innerHTML = `<form class="av-editar-form">
      <h4>✏️ Editar aviso</h4>
      ${yaSalio ? `<p class="av-mini">Ya llegó a ${num(a.enviados)} celulares: allí queda como llegó. El cambio se ve en el panel de <b>Novedades</b> de la página.</p>` : '<p class="av-mini">Todavía no salió: se envía ya corregido.</p>'}
      <label class="form-label">Título *</label><input type="text" class="form-control" name="titulo" maxlength="120" value="${esc(a.titulo || '')}">
      <label class="form-label">Mensaje</label><textarea class="form-control" name="cuerpo" rows="3" maxlength="300">${esc(a.cuerpo || '')}</textarea>
      <label class="form-label">Al tocar el aviso, abre…</label><select class="form-control" name="url">${opcionesDestino(a.url)}</select>
      <div class="av-editar-botones"><button type="button" class="btn-secondary" data-cancelar>Cancelar</button><button type="submit" class="btn-primary">Guardar cambios</button></div>
    </form>`;
    const f = item.querySelector('form');
    f.titulo.focus();
    f.querySelector('[data-cancelar]').onclick = () => pintar();
    f.onsubmit = async e => {
      e.preventDefault();
      if (!f.titulo.value.trim()) { toast('Escribí un título.', 'warn'); f.titulo.focus(); return; }
      const btn = f.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Guardando…';
      const { error } = await db().rpc('app_editar_aviso', { p_id: a.id, p_titulo: f.titulo.value.trim(), p_cuerpo: f.cuerpo.value.trim(), p_url: f.url.value });
      if (error) { toast('No se pudo guardar: ' + error.message, 'error'); btn.disabled = false; btn.textContent = 'Guardar cambios'; return; }
      toast('Aviso corregido.', 'ok');
      cargar(true);
    };
  });

  r.querySelectorAll('.av-reintentar').forEach(b => b.onclick = async () => {
    b.disabled = true;
    const { error } = await db().rpc('app_reintentar_aviso', { p_id: Number(b.dataset.id) });
    if (error) { toast('Error: ' + error.message, 'error'); b.disabled = false; return; }
    toast('Enviando…', 'ok');
    setTimeout(() => cargar(true), 3000);
  });
}

// Tooltip único (mouse y dedo)
const tip = document.createElement('div');
tip.className = 'av-tip';
document.addEventListener('DOMContentLoaded', () => document.body.appendChild(tip));
function mostrarTip(e) {
  const el = e.target.closest?.('#av-raiz [data-tip]');
  if (!el) { tip.style.opacity = '0'; return; }
  tip.textContent = el.dataset.tip;
  const p = e.touches ? e.touches[0] : e;
  tip.style.opacity = '1';
  const ancho = tip.offsetWidth;
  tip.style.left = Math.min(window.innerWidth - ancho - 8, Math.max(8, p.clientX - ancho / 2)) + 'px';
  tip.style.top = Math.max(8, p.clientY - 44) + 'px';
}
document.addEventListener('mousemove', mostrarTip);
document.addEventListener('touchstart', mostrarTip, { passive: true });
document.addEventListener('scroll', () => { tip.style.opacity = '0'; }, true);
