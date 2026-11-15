// Administración del Ranking del Campeonato (pilotos y navegantes).
// Igual que el Excel "RANKING AMADESU": fechas en columnas, filas por clase,
// los totales y el puesto se calculan solos.
import { supabase } from './supabase_config.js';
import { ranking, camposDe, totalFecha, verPts, esc, num, ordenClases, imagenRanking, descargarBlob, archivoDe } from './ranking_comun.js';

const db = () => supabase.schema('rally');
const $ = id => document.getElementById(id);
const nuevoId = () => crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
const estado = { camps: [], camp: null, filas: [], rol: 'piloto', buscar: '', pendientes: new Set(), guardando: false, error: null };

let timerToast;
function toast(t, mal = false) {
  const el = $('pl-toast'); el.textContent = t; el.classList.toggle('mal', mal); el.classList.add('visible');
  clearTimeout(timerToast); timerToast = setTimeout(() => el.classList.remove('visible'), 3800);
}
function dialogo(html) {
  const f = document.createElement('div');
  f.className = 'pl-dialogo-fondo';
  f.innerHTML = `<div class="pl-dialogo" role="dialog" aria-modal="true">${html}</div>`;
  f.addEventListener('click', e => { if (e.target === f || e.target.closest('[data-cerrar]')) f.remove(); });
  document.body.appendChild(f);
  return f;
}
const faltaScript = e => /ranking_(campeonatos|filas)/.test(String(e?.message || '')) && /exist|schema cache|find/i.test(String(e?.message || ''));

// ------------------------------------------------------------------
// Carga
// ------------------------------------------------------------------
async function iniciar() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { location.href = 'admin_login.html?volver=ranking_admin.html'; return; }
  const u = await db().from('usuarios').select('rol_id').eq('id', session.user.id).maybeSingle();
  if (u.data && Number(u.data.rol_id) === 3) { $('rk-marco').innerHTML = '<div class="pl-vacio">El ranking lo manejan los administradores.</div>'; return; }
  await cargarCamps(new URLSearchParams(location.search).get('c'));
}

async function cargarCamps(elegido) {
  const { data, error } = await db().from('ranking_campeonatos').select('*').is('deleted_at', null).order('created_at', { ascending: false });
  if (error) {
    $('rk-marco').innerHTML = `<div class="pl-vacio">${faltaScript(error) ? 'Falta ejecutar el script <b>files/76_ranking_campeonato.sql</b> en Supabase.' : 'No se pudo cargar: ' + esc(error.message)}</div>`;
    $('rk-sub').textContent = '';
    return;
  }
  estado.camps = data || [];
  const sel = $('rk-camp');
  sel.innerHTML = estado.camps.map(c => `<option value="${c.id}">${esc(c.titulo)}${c.publicado ? '' : ' (sin publicar)'}</option>`).join('');
  sel.hidden = !estado.camps.length;
  if (!estado.camps.length) {
    estado.camp = null;
    $('rka-tabs').hidden = true;
    $('rk-sub').textContent = 'Todavía no hay campeonatos';
    $('rk-marco').innerHTML = `<div class="pl-vacio rka-inicio"><b>Empezá cargando tu Excel de ranking</b>
      <p>Usá <b>⬆ Subir Excel</b> con tu archivo (hojas "RANKING PILOTOS" y "RANKING NAVEGANTES"): se crean el campeonato, las fechas y todos los puntos.
      O creá uno vacío con <b>＋ Nuevo campeonato</b>.</p></div>`;
    return;
  }
  const c = estado.camps.find(x => x.id === elegido) || estado.camps[0];
  sel.value = c.id;
  await abrir(c.id);
}

async function abrir(id) {
  estado.camp = estado.camps.find(c => c.id === id);
  history.replaceState(null, '', '?c=' + id);
  $('rk-ver').href = 'ranking.html?c=' + id;
  $('rk-marco').innerHTML = '<div class="pl-cargando">Cargando ranking…</div>';
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db().from('ranking_filas').select('id, rol, clase, nombre, numero, puntos, created_at').eq('campeonato_id', id).order('created_at').range(desde, desde + 999);
    if (error) { toast('No se pudo cargar: ' + error.message, true); break; }
    filas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  estado.filas = filas.map(f => ({ ...f, puntos: f.puntos || {} }));
  $('rka-tabs').hidden = false;
  barra();
  dibujar();
}

function barra() {
  const c = estado.camp;
  if (!c) return;
  const p = estado.filas.filter(f => f.rol === 'piloto').length, n = estado.filas.length - p;
  $('rk-sub').textContent = `${(c.fechas || []).length} fechas · ${p} pilotos · ${n} navegantes`;
  $('pl-estado').innerHTML = [
    c.publicado ? '<span class="ok">● Publicado: se ve en la página pública</span>' : '<span class="sin-red">● Sin publicar: solo lo ven los administradores — publicalo en ⚙ Datos y fechas</span>',
    estado.guardando ? '<span>⏳ Guardando…</span>' : estado.pendientes.size ? `<span class="sin-red">⏳ ${estado.pendientes.size} cambio(s) por guardar</span>` : '',
    estado.error ? `<span class="mal">⚠ ${esc(estado.error)}</span>` : '',
  ].filter(Boolean).join('');
}

// ------------------------------------------------------------------
// Hoja
// ------------------------------------------------------------------
function dibujar() {
  const c = estado.camp;
  if (!c) return;
  document.querySelectorAll('#rka-tabs [data-rol]').forEach(b => b.classList.toggle('activo', b.dataset.rol === estado.rol));
  const fechas = c.fechas || [];
  // Recordar dónde se estaba escribiendo
  const act = document.activeElement?.closest?.('[data-f]');
  const foco = act ? { id: act.closest('tr')?.dataset.id, f: act.dataset.f } : null;

  if (!fechas.length) {
    $('rk-marco').innerHTML = '<div class="pl-vacio">Este campeonato todavía no tiene fechas. Agregalas en <b>⚙ Datos y fechas</b> (o subí tu Excel).</div>';
    return;
  }
  const grupos = ranking(c, estado.filas, estado.rol);
  const q = estado.buscar.trim().toUpperCase();
  const ncol = 4 + fechas.reduce((s, f) => s + camposDe(f).length + 1, 0) + 2;
  let cab1 = '<tr><th rowspan="2" class="c-psto">Psto.</th><th rowspan="2" class="c-num">Nº COCHE</th><th rowspan="2" class="c-cls">CLASE</th><th rowspan="2" class="c-nom">' + (estado.rol === 'piloto' ? 'PILOTO' : 'NAVEGANTE') + '</th>';
  let cab2 = '<tr>';
  fechas.forEach((f, i) => {
    cab1 += `<th colspan="${camposDe(f).length + 1}" class="fe fe${i % 2}">${esc(f.nombre)}<small>${f.tipo === 'circuito' ? 'Circuito' : 'Rally'}</small></th>`;
    cab2 += camposDe(f).map(([, l]) => `<th class="fe${i % 2}">${esc(l)}</th>`).join('') + `<th class="fe${i % 2} tot">TOTAL</th>`;
  });
  cab1 += '<th rowspan="2" class="c-total">PUNTOS TOTALES</th><th rowspan="2" class="c-acc"></th></tr>';
  cab2 += '</tr>';

  let cuerpo = '';
  for (const g of grupos) {
    const filas = q ? g.filas.filter(f => f.nombre.includes(q)) : g.filas;
    if (q && !filas.length) continue;
    cuerpo += `<tr class="rka-clase"><td colspan="${ncol}"><b>${esc(g.clase)}</b> <span>${g.filas.length}</span><button type="button" class="rka-mas" data-agregar="${esc(g.clase)}">＋ Agregar en ${esc(g.clase)}</button></td></tr>`;
    for (const f of filas) {
      cuerpo += `<tr data-id="${f.id}" class="${f.psto <= 3 ? 'p' + f.psto : ''} ${estado.pendientes.has(f.id) ? 'pend' : ''}">
        <td class="c-psto">${f.psto}</td>
        <td><input data-f="numero" value="${esc(f.numero)}" inputmode="numeric" aria-label="Nº"></td>
        <td><input data-f="clase" value="${esc(f.clase)}" aria-label="Clase"></td>
        <td><input data-f="nombre" value="${esc(f.nombre)}" class="nom" placeholder="Escribí el nombre" aria-label="Nombre"></td>
        ${fechas.map((x, i) => camposDe(x).map(([k]) => {
          const v = f.puntos?.[x.id]?.[k];
          return `<td class="fe${i % 2}"><input data-f="p:${x.id}:${k}" value="${v ?? ''}" inputmode="decimal" class="pt" aria-label="${esc(x.nombre)} ${k}"></td>`;
        }).join('') + `<td class="fe${i % 2} tot">${verPts(totalFecha(f, x))}</td>`).join('')}
        <td class="c-total">${verPts(f.total)}</td>
        <td class="c-acc"><button type="button" data-imagen="${f.id}" title="Imagen para redes">🖼</button><button type="button" data-borrar="${f.id}" title="Borrar fila">🗑</button></td>
      </tr>`;
    }
  }
  $('rk-marco').innerHTML = `<div class="rka-hoja"><table class="rka-tabla"><thead>${cab1}${cab2}</thead><tbody>${cuerpo || `<tr><td colspan="${ncol}" class="rka-nada">${q ? 'Nadie con ese nombre.' : 'Todavía no hay ' + (estado.rol === 'piloto' ? 'pilotos' : 'navegantes') + '. Usá “＋ Agregar a una clase”.'}</td></tr>`}</tbody></table></div>`;
  if (foco?.id) {
    const el = document.querySelector(`tr[data-id="${CSS.escape(foco.id)}"] [data-f="${CSS.escape(foco.f)}"]`);
    if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { } }
  }
}

// Un cambio en una celda
function cambiar(input) {
  const f = estado.filas.find(x => x.id === input.closest('tr').dataset.id);
  if (!f) return;
  const campo = input.dataset.f, v = input.value.trim();
  if (campo.startsWith('p:')) {
    const [, fid, k] = campo.split(':');
    if (v !== '' && !/^-?\d+([.,]\d+)?$/.test(v)) { toast('Los puntos son números. Ej: 7 o 3.5', true); input.value = f.puntos?.[fid]?.[k] ?? ''; return; }
    const p = { ...(f.puntos[fid] || {}) };
    if (v === '') delete p[k]; else p[k] = num(v);
    if (Object.keys(p).length) f.puntos = { ...f.puntos, [fid]: p }; else { const q = { ...f.puntos }; delete q[fid]; f.puntos = q; }
  } else if (campo === 'nombre') f.nombre = v.replace(/\s+/g, ' ').toUpperCase();
  else if (campo === 'clase') { if (!v) { toast('La clase no puede quedar vacía.', true); input.value = f.clase; return; } f.clase = v.toUpperCase(); }
  else if (campo === 'numero') f.numero = v;
  marcar(f.id);
  // Totales al momento; el orden (puestos) se rehace al salir de la hoja,
  // así no se mueven las filas mientras se escribe.
  const tr = input.closest('tr');
  const fechas = estado.camp.fechas || [];
  tr.querySelectorAll('td.tot').forEach((td, i) => { if (fechas[i]) td.textContent = verPts(totalFecha(f, fechas[i])); });
  tr.querySelector('td.c-total').textContent = verPts(fechas.reduce((s, x) => s + totalFecha(f, x), 0));
  tr.classList.add('pend');
  if (campo === 'clase') dibujar(); else reordenarLuego();
}
let timerOrden;
function reordenarLuego() {
  clearTimeout(timerOrden);
  timerOrden = setTimeout(() => { if (!document.activeElement?.closest?.('.rka-tabla')) dibujar(); else reordenarLuego(); }, 1200);
}

// ------------------------------------------------------------------
// Guardar (se juntan los cambios y se mandan cada un ratito)
// ------------------------------------------------------------------
let timerGuardar;
function marcar(id) { estado.pendientes.add(id); barra(); clearTimeout(timerGuardar); timerGuardar = setTimeout(guardar, 700); }
async function guardar() {
  if (estado.guardando || !estado.pendientes.size) return;
  const ids = [...estado.pendientes].filter(id => estado.filas.find(f => f.id === id)?.nombre);
  if (!ids.length) return;
  estado.guardando = true; barra();
  const filas = ids.map(id => { const f = estado.filas.find(x => x.id === id); return { id: f.id, campeonato_id: estado.camp.id, rol: f.rol, clase: f.clase, nombre: f.nombre, numero: f.numero || '', puntos: f.puntos || {} }; });
  const { error } = await db().from('ranking_filas').upsert(filas);
  estado.guardando = false;
  if (error) { estado.error = 'No se guardó: ' + error.message; toast(estado.error, true); }
  else { ids.forEach(id => estado.pendientes.delete(id)); estado.error = null; document.querySelectorAll('tr.pend').forEach(tr => { if (!estado.pendientes.has(tr.dataset.id)) tr.classList.remove('pend'); }); }
  barra();
  if (estado.pendientes.size && !error) marcar([...estado.pendientes][0]);
}
window.addEventListener('beforeunload', e => { if (estado.pendientes.size) { e.preventDefault(); e.returnValue = ''; } });

function agregar(clase) {
  const f = { id: nuevoId(), rol: estado.rol, clase, nombre: '', numero: '', puntos: {} };
  estado.filas.push(f);
  estado.buscar = ''; $('rk-buscar').value = '';
  dibujar();
  const el = document.querySelector(`tr[data-id="${f.id}"] [data-f="nombre"]`);
  el?.scrollIntoView({ block: 'center' }); el?.focus();
}
function nuevaClase() {
  const clases = ordenClases(estado.camp, estado.filas);
  const d = dialogo(`<h3>Agregar ${estado.rol === 'piloto' ? 'piloto' : 'navegante'}</h3>
    <label>Clase</label><input type="text" id="rka-cls" list="rka-cls-l" placeholder="Ej. R2B" autocomplete="off">
    <datalist id="rka-cls-l">${clases.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="acciones"><button type="button" class="pl-btn" data-cerrar>Cancelar</button><button type="button" class="pl-btn primario" id="rka-ok">Agregar</button></div>`);
  const inp = d.querySelector('#rka-cls'); inp.focus();
  const ok = () => { const v = inp.value.trim().toUpperCase(); if (!v) return; d.remove(); agregar(v); };
  d.querySelector('#rka-ok').onclick = ok;
  inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
}
async function borrar(id) {
  const f = estado.filas.find(x => x.id === id);
  if (!f) return;
  if (f.nombre && !confirm(`¿Borrar a ${f.nombre} (${f.clase}) del ranking?`)) return;
  estado.filas = estado.filas.filter(x => x.id !== id);
  estado.pendientes.delete(id);
  dibujar(); barra();
  if (!f.nombre) return;
  const { error } = await db().from('ranking_filas').delete().eq('id', id);
  if (error) { toast('No se borró: ' + error.message, true); estado.filas.push(f); dibujar(); }
}

async function imagen(id) {
  const g = ranking(estado.camp, estado.filas, estado.rol).find(x => x.filas.some(f => f.id === id));
  const f = g?.filas.find(x => x.id === id);
  if (!f?.nombre) return;
  toast('Generando imagen…');
  const cv = await imagenRanking({ camp: estado.camp, fila: f, rol: estado.rol, clase: g.clase, lista: g.filas });
  cv.toBlob(b => { descargarBlob(b, archivoDe(`RANKING ${f.nombre} ${g.clase}.png`)); toast('🖼 Imagen descargada.'); }, 'image/png');
}

// ------------------------------------------------------------------
// Datos del campeonato y fechas
// ------------------------------------------------------------------
function abrirConfig(nuevo = false) {
  const c = nuevo ? { titulo: '', subtitulo: '', fecha_corte: '', fechas: [], orden_clases: null, publicado: false } : estado.camp;
  if (!c) return nuevoCamp();
  const fechas = JSON.parse(JSON.stringify(c.fechas || []));
  const conPuntos = fid => estado.filas.some(f => f.puntos?.[fid] && Object.keys(f.puntos[fid]).length);
  const d = dialogo(`<h3>${nuevo ? 'Nuevo campeonato' : 'Datos y fechas'}</h3>
    <label>Título</label><input type="text" id="c-titulo" value="${esc(c.titulo)}" placeholder="RANKING CAMPEONATO MIXTO MUNICIPAL AMADESU 2.026">
    <label>Subtítulo</label><input type="text" id="c-sub" value="${esc(c.subtitulo)}" placeholder='CAMPEONATO "CLUB CORDOVA"'>
    <label>Fecha de actualización</label><input type="text" id="c-corte" value="${esc(c.fecha_corte)}" placeholder="Fecha: 27 de octubre 2026">
    <label>Orden de las clases (separadas por coma; vacío = como están)</label>
    <input type="text" id="c-orden" value="${esc((c.orden_clases || []).join(', '))}" placeholder="RC2, PROTO, RC2N, R2B, R1B, RC5, PROMOCIONAL, BUGUIE">
    <div class="grupo"><b>Fechas del campeonato</b><div id="c-fechas"></div>
      <button type="button" class="pl-btn" id="c-mas-fecha" style="margin-top:10px;">＋ Agregar fecha</button></div>
    <label class="rka-chk"><input type="checkbox" id="c-pub" ${c.publicado ? 'checked' : ''}> <b>Publicado</b> — se ve en la página pública (botón “Ranking”)</label>
    <div class="acciones">
      ${nuevo ? '' : '<button type="button" class="pl-btn rka-peligro" id="c-borrar">Borrar campeonato</button>'}
      <button type="button" class="pl-btn" data-cerrar>Cancelar</button><button type="button" class="pl-btn primario" id="c-ok">Guardar</button></div>`);
  const pintar = () => {
    d.querySelector('#c-fechas').innerHTML = fechas.map((f, i) => `<div class="rka-fecha" data-i="${i}">
      <span class="n">${i + 1}</span>
      <input type="text" data-k="nombre" value="${esc(f.nombre)}" placeholder="Nombre de la fecha">
      <select data-k="tipo"><option value="rally" ${f.tipo !== 'circuito' ? 'selected' : ''}>Rally (Etapa 1, Etapa 2, General)</option><option value="circuito" ${f.tipo === 'circuito' ? 'selected' : ''}>Circuito (Clasificación, General)</option></select>
      <button type="button" class="pl-btn" data-mov="-1" ${i === 0 ? 'disabled' : ''} title="Subir">▲</button><button type="button" class="pl-btn" data-mov="1" ${i === fechas.length - 1 ? 'disabled' : ''} title="Bajar">▼</button>
      <button type="button" class="pl-btn" data-quitar="${i}" title="Quitar">🗑</button></div>`).join('') || '<p style="margin:10px 0 0;">Sin fechas todavía.</p>';
  };
  pintar();
  d.querySelector('#c-fechas').addEventListener('input', e => { const el = e.target.closest('[data-k]'); if (el) fechas[+el.closest('[data-i]').dataset.i][el.dataset.k] = el.value; });
  d.querySelector('#c-fechas').addEventListener('click', e => {
    const m = e.target.closest('[data-mov]');
    if (m) { const i = +m.closest('[data-i]').dataset.i, j = i + +m.dataset.mov; [fechas[i], fechas[j]] = [fechas[j], fechas[i]]; pintar(); }
    const q = e.target.closest('[data-quitar]');
    if (q) { const i = +q.dataset.quitar; if (conPuntos(fechas[i].id) && !confirm(`"${fechas[i].nombre}" tiene puntos cargados. ¿Quitarla igual? (se pierden esos puntos)`)) return; fechas.splice(i, 1); pintar(); }
  });
  d.querySelector('#c-mas-fecha').onclick = () => { fechas.push({ id: nuevoId(), nombre: '', tipo: 'rally' }); pintar(); d.querySelector('#c-fechas .rka-fecha:last-child input')?.focus(); };
  d.querySelector('#c-borrar')?.addEventListener('click', async () => {
    if (prompt(`Para borrar "${c.titulo}" con todo su ranking escribí BORRAR`) !== 'BORRAR') return;
    const { error } = await db().from('ranking_campeonatos').update({ deleted_at: new Date().toISOString(), publicado: false }).eq('id', c.id);
    if (error) return toast('No se borró: ' + error.message, true);
    d.remove(); toast('Campeonato borrado.'); cargarCamps();
  });
  d.querySelector('#c-ok').onclick = async () => {
    const titulo = d.querySelector('#c-titulo').value.trim();
    if (!titulo) return toast('Poné un título.', true);
    if (fechas.some(f => !String(f.nombre).trim())) return toast('Cada fecha necesita un nombre.', true);
    const datos = {
      titulo, subtitulo: d.querySelector('#c-sub').value.trim(), fecha_corte: d.querySelector('#c-corte').value.trim(),
      orden_clases: d.querySelector('#c-orden').value.split(',').map(x => x.trim().toUpperCase()).filter(Boolean),
      fechas: fechas.map(f => ({ id: f.id, nombre: String(f.nombre).trim().toUpperCase(), tipo: f.tipo === 'circuito' ? 'circuito' : 'rally' })),
      publicado: d.querySelector('#c-pub').checked,
    };
    if (!datos.orden_clases.length) datos.orden_clases = null;
    const r = nuevo ? await db().from('ranking_campeonatos').insert(datos).select().single() : await db().from('ranking_campeonatos').update(datos).eq('id', c.id).select().single();
    if (r.error) return toast(faltaScript(r.error) ? 'Falta ejecutar el script 76_ranking_campeonato.sql en Supabase.' : 'No se guardó: ' + r.error.message, true);
    d.remove();
    toast('✓ Guardado.');
    await cargarCamps(r.data.id);
  };
}
const nuevoCamp = () => abrirConfig(true);

// ------------------------------------------------------------------
// Subir el Excel de ranking (formato "RANKING AMADESU 2026")
// ------------------------------------------------------------------
const texto = v => {
  if (v == null) return '';
  if (typeof v === 'object') { if (v.richText) return v.richText.map(x => x.text).join(''); if (v.result != null) return String(v.result); if (v.text != null) return String(v.text); if (v.error) return ''; return ''; }
  return String(v);
};
const numero = v => { if (v && typeof v === 'object' && 'result' in v) v = v.result; const t = texto(v).trim(); if (t === '' || !/^-?\d+([.,]\d+)?$/.test(t)) return null; return num(t); };

function leerHoja(ws) {
  let hdr = 0;
  for (let r = 1; r <= Math.min(20, ws.rowCount); r++) if (/^PSTO/i.test(texto(ws.getCell(r, 1).value).trim())) { hdr = r; break; }
  if (!hdr) return null;
  const rotulo = c => texto(ws.getCell(hdr, c).value).trim().toUpperCase();
  const nomCol = [...Array(8)].map((_, i) => i + 1).find(c => /PILOTO|NAVEGANTE/.test(rotulo(c))) || 4;
  const rol = /NAVEG/.test(rotulo(nomCol)) ? 'navegante' : 'piloto';
  const clsCol = [...Array(8)].map((_, i) => i + 1).find(c => rotulo(c) === 'CLASE') || 3;
  const numCol = [...Array(8)].map((_, i) => i + 1).find(c => /COCHE|^N/.test(rotulo(c)) && c !== nomCol && c !== clsCol && c > 1) || 2;
  // Grupos de columnas: cada fecha termina en "TOTAL"
  const grupos = [];
  let actual = null;
  for (let c = nomCol + 1; c <= ws.columnCount + 1; c++) {
    const r = rotulo(c);
    if (!r) continue;
    if (/PUNTOS TOTALES/.test(r)) break;
    if (!actual) actual = { desde: c, cols: [] };
    if (r === 'TOTAL') { actual.hasta = c; grupos.push(actual); actual = null; continue; }
    const k = /CLASF|CLASIF/.test(r) ? 'a' : /ETAPA 1|ET\.? ?1|^E1/.test(r) ? 'a' : /ETAPA 2|ET\.? ?2|^E2/.test(r) ? 'b' : /GENERAL/.test(r) ? 'g' : null;
    if (k) actual.cols.push({ c, k, circuito: /CLASF|CLASIF/.test(r) });
  }
  const fechas = grupos.map(g => {
    let nombre = '';
    for (let r = hdr - 1; r >= Math.max(1, hdr - 3) && !nombre; r--)
      for (let c = g.desde; c <= g.hasta && !nombre; c++) { const t = texto(ws.getCell(r, c).value).trim(); if (t && !/^#/.test(t)) nombre = t; }
    return { nombre: nombre.toUpperCase() || `FECHA ${grupos.indexOf(g) + 1}`, tipo: g.cols.some(x => x.circuito) ? 'circuito' : 'rally', cols: g.cols };
  });
  const filas = [];
  for (let r = hdr + 1; r <= ws.rowCount; r++) {
    const nombre = texto(ws.getCell(r, nomCol).value).replace(/\s+/g, ' ').trim().toUpperCase();
    const clase = texto(ws.getCell(r, clsCol).value).trim().toUpperCase();
    if (!nombre || !clase || clase === 'CLASE') continue;
    const puntos = fechas.map(f => { const p = {}; f.cols.forEach(({ c, k }) => { const v = numero(ws.getCell(r, c).value); if (v != null) p[k] = v; }); return p; });
    filas.push({ rol, clase, nombre, numero: texto(ws.getCell(r, numCol).value).trim(), puntos });
  }
  const cab = [1, 2, 3, 4, 5, 6, 7].map(r => texto(ws.getCell(r, 1).value).trim() || texto(ws.getCell(r, 4).value).trim());
  return { rol, fechas, filas, titulo: cab[0], subtitulo: cab[1], corte: cab.find(t => /^FECHA/i.test(t)) || '' };
}

async function subirExcel(archivo) {
  if (!archivo) return;
  if (!window.ExcelJS) return toast('Todavía está cargando el lector de Excel, probá en un segundo.', true);
  let hojas;
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await archivo.arrayBuffer());
    hojas = wb.worksheets.filter(ws => /RANKING/i.test(ws.name)).map(leerHoja).filter(Boolean);
    if (!hojas.length) hojas = wb.worksheets.map(leerHoja).filter(h => h && h.fechas.length);
  } catch (e) { return toast('No se pudo leer el Excel: ' + (e.message || e), true); }
  const pil = hojas.find(h => h.rol === 'piloto'), nav = hojas.find(h => h.rol === 'navegante');
  if (!pil && !nav) return toast('No encontré las hojas de ranking (con columnas Psto., CLASE, PILOTO/NAVEGANTE y las fechas).', true);
  const base = pil || nav;
  const fechas = base.fechas.map(f => ({ id: nuevoId(), nombre: f.nombre, tipo: f.tipo }));
  const filas = [pil, nav].filter(Boolean).flatMap(h => h.filas.map(f => ({
    id: nuevoId(), rol: f.rol, clase: f.clase, nombre: f.nombre, numero: f.numero,
    puntos: Object.fromEntries(f.puntos.map((p, i) => [fechas[i]?.id, p]).filter(([id, p]) => id && Object.keys(p).length)),
  })));
  const clases = []; filas.forEach(f => { if (!clases.includes(f.clase)) clases.push(f.clase); });
  const cuenta = rol => filas.filter(f => f.rol === rol).length;
  const d = dialogo(`<h3>Subir ranking desde Excel</h3>
    <p>Encontré <b>${fechas.length} fechas</b>: ${fechas.map(f => esc(f.nombre) + (f.tipo === 'circuito' ? ' <i>(circuito)</i>' : '')).join(' · ')}</p>
    <p><b>${cuenta('piloto')}</b> pilotos y <b>${cuenta('navegante')}</b> navegantes en ${clases.length} clases (${clases.map(esc).join(', ')}).</p>
    <label>Título</label><input type="text" id="x-titulo" value="${esc(base.titulo || estado.camp?.titulo || '')}">
    <label>Subtítulo</label><input type="text" id="x-sub" value="${esc(base.subtitulo || '')}">
    <label>Fecha de actualización</label><input type="text" id="x-corte" value="${esc(base.corte || '')}">
    <div class="acciones">
      <button type="button" class="pl-btn" data-cerrar>Cancelar</button>
      ${estado.camp ? `<button type="button" class="pl-btn" id="x-reemplazar" title="Borra lo que tiene este campeonato y pone lo del Excel">Reemplazar “${esc(estado.camp.titulo.slice(0, 30))}${estado.camp.titulo.length > 30 ? '…' : ''}”</button>` : ''}
      <button type="button" class="pl-btn primario" id="x-nuevo">Crear campeonato nuevo</button>
    </div>`);
  const ejecutar = async reemplazar => {
    const datos = { titulo: d.querySelector('#x-titulo').value.trim() || 'RANKING', subtitulo: d.querySelector('#x-sub').value.trim(), fecha_corte: d.querySelector('#x-corte').value.trim(), fechas, orden_clases: clases };
    d.querySelectorAll('button').forEach(b => { b.disabled = true; });
    toast('Subiendo ranking…');
    try {
      let campId;
      if (reemplazar) {
        if (!confirm(`Se borran TODOS los puntos de "${estado.camp.titulo}" y se reemplazan por los del Excel. ¿Seguir?`)) { d.querySelectorAll('button').forEach(b => { b.disabled = false; }); return; }
        campId = estado.camp.id;
        let r = await db().from('ranking_campeonatos').update(datos).eq('id', campId); if (r.error) throw r.error;
        r = await db().from('ranking_filas').delete().eq('campeonato_id', campId); if (r.error) throw r.error;
      } else {
        const r = await db().from('ranking_campeonatos').insert({ ...datos, publicado: false }).select().single(); if (r.error) throw r.error;
        campId = r.data.id;
      }
      for (let i = 0; i < filas.length; i += 400) {
        const r = await db().from('ranking_filas').insert(filas.slice(i, i + 400).map(f => ({ ...f, campeonato_id: campId })));
        if (r.error) throw r.error;
      }
      d.remove();
      toast(`✓ Listo: ${filas.length} filas cargadas.${reemplazar ? '' : ' Revisalo y publicalo en ⚙ Datos y fechas.'}`);
      await cargarCamps(campId);
    } catch (e) {
      d.querySelectorAll('button').forEach(b => { b.disabled = false; });
      toast(faltaScript(e) ? 'Falta ejecutar el script 76_ranking_campeonato.sql en Supabase.' : 'No se pudo subir: ' + (e.message || e), true);
    }
  };
  d.querySelector('#x-nuevo').onclick = () => ejecutar(false);
  d.querySelector('#x-reemplazar')?.addEventListener('click', () => ejecutar(true));
}

// ------------------------------------------------------------------
// Descargar Excel (mismo formato que el original, con fórmulas)
// ------------------------------------------------------------------
async function descargarExcel() {
  const c = estado.camp;
  if (!c) return;
  if (!window.ExcelJS) return toast('Todavía está cargando el generador de Excel, probá en un segundo.', true);
  const wb = new ExcelJS.Workbook(); wb.creator = 'AMADESU RALLYS';
  const fechas = c.fechas || [];
  const L = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const borde = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  const centro = { horizontal: 'center', vertical: 'middle', wrapText: true };
  for (const rol of ['piloto', 'navegante']) {
    const ws = wb.addWorksheet(rol === 'piloto' ? 'RANKING PILOTOS' : 'RANKING NAVEGANTES', { views: [{ state: 'frozen', xSplit: 4, ySplit: 8 }], pageSetup: { orientation: 'landscape', paperSize: 14, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    let col = 5; const grupos = [];
    for (const f of fechas) { const cs = camposDe(f); grupos.push({ f, desde: col, campos: cs, tot: col + cs.length }); col += cs.length + 1; }
    const ultima = col;
    ws.columns = [{ width: 6 }, { width: 8 }, { width: 13 }, { width: 34 }].concat([...Array(ultima - 4)].map((_, i) => ({ width: i === ultima - 5 ? 12 : 9 })));
    ws.mergeCells(1, 1, 1, ultima); ws.mergeCells(2, 1, 2, ultima); ws.mergeCells(4, 4, 4, Math.min(ultima, 11));
    Object.assign(ws.getCell(1, 1), { value: c.titulo, font: { name: 'Cambria', size: 18, bold: true }, alignment: { horizontal: 'center' } });
    Object.assign(ws.getCell(2, 1), { value: c.subtitulo || null, font: { name: 'Cambria', size: 14, bold: true }, alignment: { horizontal: 'center' } });
    Object.assign(ws.getCell(4, 4), { value: rol === 'piloto' ? 'RANKING PILOTOS' : 'RANKING NAVEGANTES', font: { name: 'Cambria', size: 16, bold: true }, alignment: { horizontal: 'center' }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF99' } } });
    Object.assign(ws.getCell(7, 1), { value: c.fecha_corte || null, font: { name: 'Cambria', size: 11 } });
    ws.getRow(6).height = 30; ws.getRow(8).height = 32;
    const negro = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
    for (const g of grupos) {
      ws.mergeCells(6, g.desde, 7, g.tot);
      Object.assign(ws.getCell(6, g.desde), { value: g.f.nombre, font: { name: 'Cambria', size: 11, bold: true }, alignment: centro, border: borde });
    }
    const cab = ['Psto.', 'Nº COCHE', 'CLASE', rol === 'piloto' ? 'PILOTO' : 'NAVEGANTE'];
    grupos.forEach(g => { g.campos.forEach(([, l]) => cab.push(l.toUpperCase())); cab.push('TOTAL'); });
    cab.push('PUNTOS TOTALES');
    cab.forEach((t, i) => Object.assign(ws.getCell(8, i + 1), { value: t, font: { name: 'Cambria', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }, fill: negro, alignment: centro, border: borde }));
    let r = 9;
    for (const gr of ranking(c, estado.filas, rol)) {
      for (const f of gr.filas) {
        const fila = ws.getRow(r);
        fila.getCell(1).value = f.psto; fila.getCell(2).value = /^\d+$/.test(f.numero) ? +f.numero : (f.numero || null);
        fila.getCell(3).value = gr.clase; fila.getCell(4).value = f.nombre;
        for (const g of grupos) {
          g.campos.forEach(([k], j) => { const v = f.puntos?.[g.f.id]?.[k]; fila.getCell(g.desde + j).value = v ?? null; });
          fila.getCell(g.tot).value = { formula: g.campos.map((_, j) => `${L(g.desde + j)}${r}`).join('+'), result: totalFecha(f, g.f) };
          fila.getCell(g.tot).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
        }
        fila.getCell(ultima).value = { formula: grupos.map(g => `${L(g.tot)}${r}`).join('+') || '0', result: f.total };
        fila.getCell(ultima).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F2' } };
        for (let k = 1; k <= ultima; k++) { const ce = fila.getCell(k); ce.border = borde; ce.alignment = k === 4 ? { vertical: 'middle' } : centro; ce.font = { name: 'Calibri', size: 11, bold: k === 1 || k === ultima || k === 4 }; }
        r++;
      }
      r++; // fila en blanco entre clases
    }
  }
  const buf = await wb.xlsx.writeBuffer();
  descargarBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), archivoDe(`${c.titulo}.xlsx`));
  toast('⬇ Excel descargado.');
}

// ------------------------------------------------------------------
// Eventos
// ------------------------------------------------------------------
$('rk-camp').onchange = e => abrir(e.target.value);
$('rk-nuevo').onclick = nuevoCamp;
$('rk-config').onclick = () => abrirConfig(false);
$('rk-subir').onclick = () => $('rk-archivo').click();
$('rk-archivo').onchange = e => { const f = e.target.files[0]; e.target.value = ''; subirExcel(f); };
$('rk-excel').onclick = descargarExcel;
$('rk-nueva-clase').onclick = nuevaClase;
$('rk-buscar').oninput = e => { estado.buscar = e.target.value; dibujar(); };
$('rka-tabs').addEventListener('click', e => { const b = e.target.closest('[data-rol]'); if (b) { estado.rol = b.dataset.rol; dibujar(); } });
$('rk-marco').addEventListener('change', e => { if (e.target.matches('input[data-f]')) cambiar(e.target); });
$('rk-marco').addEventListener('keydown', e => {
  const inp = e.target.closest('input[data-f]');
  if (!inp || (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
  e.preventDefault();
  const filas = [...document.querySelectorAll('.rka-tabla tbody tr[data-id]')];
  const id = inp.closest('tr').dataset.id, campo = inp.dataset.f;
  const i = filas.findIndex(tr => tr.dataset.id === id);
  const destinoId = filas[i + (e.key === 'ArrowUp' ? -1 : 1)]?.dataset.id;
  inp.blur(); // dispara "change" y se redibuja
  const sig = destinoId && document.querySelector(`tr[data-id="${CSS.escape(destinoId)}"] [data-f="${CSS.escape(campo)}"]`);
  if (sig) { sig.focus(); sig.select(); }
});
$('rk-marco').addEventListener('click', e => {
  const a = e.target.closest('[data-agregar]'); if (a) return agregar(a.dataset.agregar);
  const b = e.target.closest('[data-borrar]'); if (b) return borrar(b.dataset.borrar);
  const im = e.target.closest('[data-imagen]'); if (im) return imagen(im.dataset.imagen);
});

iniciar();
