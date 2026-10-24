// Sugerencias de pilotos y navegantes en "Nueva inscripción".
// Al escribir en Nombre o Apellido se listan las personas que ya están en la
// base (pilotos y navegantes). Al elegir una se rellenan nombre, apellido,
// país y celular: así no se reescribe todo y no se crean duplicados por
// errores de tipeo (la inscripción reutiliza a la persona si el nombre y el
// apellido coinciden exactamente).
import { supabase } from './supabase_config.js';

const db = () => supabase.schema('rally');
const CAMPOS = [
  { pre: 'ins-p', rol: 'piloto' },
  { pre: 'ins-n', rol: 'navegante' },
];
const MAX = 8;

let personas = null;   // [{ clave, nombre, apellido, pais, celular, roles:Set, datos:{piloto,navegante} }]
let cargando = null;

const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function todas(tabla) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db().from(tabla).select('nombre, apellido, pais, celular').is('deleted_at', null).range(desde, desde + 999);
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < 1000) return filas;
  }
}

function cargar() {
  if (personas) return Promise.resolve(personas);
  if (cargando) return cargando;
  cargando = Promise.all([todas('pilotos').catch(() => []), todas('navegantes').catch(() => [])]).then(([pil, nav]) => {
    const mapa = new Map();
    const sumar = (f, rol) => {
      if (!f.nombre && !f.apellido) return;
      const clave = normal(`${f.nombre} ${f.apellido}`);
      let p = mapa.get(clave);
      if (!p) { p = { clave, nombre: f.nombre || '', apellido: f.apellido || '', roles: new Set(), datos: {} }; mapa.set(clave, p); }
      p.roles.add(rol);
      p.datos[rol] = f;
    };
    pil.forEach(f => sumar(f, 'piloto'));
    nav.forEach(f => sumar(f, 'navegante'));
    personas = [...mapa.values()];
    cargando = null;
    return personas;
  });
  return cargando;
}

function buscar(texto) {
  const partes = normal(texto).split(' ').filter(Boolean);
  if (!partes.length || !personas) return [];
  const res = personas.filter(p => partes.every(t => p.clave.split(' ').some(w => w.startsWith(t)) || p.clave.includes(t)));
  const q = partes.join(' ');
  res.sort((a, b) => (b.clave.startsWith(q) - a.clave.startsWith(q)) || a.clave.localeCompare(b.clave));
  return res.slice(0, MAX);
}

function preparar({ pre, rol }) {
  const inNombre = document.getElementById(pre + '-nombre');
  const inApellido = document.getElementById(pre + '-apellido');
  if (!inNombre || !inApellido || inNombre.dataset.sugerencias) return;
  inNombre.dataset.sugerencias = '1';
  [inNombre, inApellido].forEach(i => i.setAttribute('autocomplete', 'off'));

  const fila = inNombre.closest('.form-group').parentElement;
  fila.style.position = 'relative';
  const lista = document.createElement('div');
  lista.className = 'persona-sugerencias';
  lista.hidden = true;
  fila.appendChild(lista);

  const aviso = document.createElement('div');
  aviso.className = 'persona-existente';
  aviso.hidden = true;
  fila.insertAdjacentElement('afterend', aviso);

  let opciones = [], activa = -1;

  const cerrar = () => { lista.hidden = true; activa = -1; };
  const marcar = () => lista.querySelectorAll('.ps-op').forEach((el, i) => el.classList.toggle('activa', i === activa));

  // Avisa si lo escrito ya es una persona de la base (se usará la misma).
  const revisarExistente = () => {
    const clave = normal(`${inNombre.value} ${inApellido.value}`);
    const p = personas && inNombre.value.trim() && inApellido.value.trim() && personas.find(x => x.clave === clave);
    aviso.hidden = !p;
    if (p) aviso.textContent = p.datos[rol]
      ? `✓ Ya está registrado como ${rol}: se usará el mismo (no se duplica).`
      : `✓ Ya está registrado como ${[...p.roles][0]}: se lo agregará también como ${rol}.`;
  };

  const elegir = p => {
    const d = p.datos[rol] || p.datos.piloto || p.datos.navegante || {};
    inNombre.value = p.nombre;
    inApellido.value = p.apellido;
    const pais = document.getElementById(pre + '-pais');
    if (d.pais && pais) {
      if (pais.tomselect) pais.tomselect.setValue(String(d.pais).toUpperCase());
      else pais.value = String(d.pais).toUpperCase();
    }
    const cel = document.getElementById(pre + '-celular');
    if (cel && d.celular) cel.value = d.celular;
    cerrar();
    revisarExistente();
  };

  const mostrar = async () => {
    const texto = `${inNombre.value} ${inApellido.value}`;
    if (normal(texto).replace(/ /g, '').length < 2) { cerrar(); revisarExistente(); return; }
    await cargar();
    revisarExistente();
    opciones = buscar(texto);
    // Si ya coincide exacto con la única opción, no hace falta la lista.
    if (!opciones.length || (opciones.length === 1 && opciones[0].clave === normal(texto))) { cerrar(); return; }
    activa = -1;
    lista.innerHTML = '<div class="ps-titulo">Ya registrados — tocá para rellenar</div>' + opciones.map((p, i) => {
      const d = p.datos[rol] || p.datos.piloto || p.datos.navegante || {};
      const roles = p.roles.size > 1 ? 'Piloto y navegante' : (p.roles.has('piloto') ? 'Piloto' : 'Navegante');
      const extra = [d.pais, d.celular].filter(Boolean).map(esc).join(' · ');
      return `<div class="ps-op" data-i="${i}"><b>${esc(p.nombre)} ${esc(p.apellido)}</b><small>${roles}${extra ? ' · ' + extra : ''}</small></div>`;
    }).join('');
    lista.hidden = false;
  };

  // mousedown (no click): así se elige antes de que el campo pierda el foco.
  lista.addEventListener('mousedown', e => {
    const op = e.target.closest('.ps-op');
    if (!op) return;
    e.preventDefault();
    elegir(opciones[+op.dataset.i]);
  });

  [inNombre, inApellido].forEach(input => {
    input.addEventListener('input', mostrar);
    input.addEventListener('focus', () => { cargar(); if (input.value.trim()) mostrar(); });
    input.addEventListener('blur', () => setTimeout(() => { if (![inNombre, inApellido].includes(document.activeElement)) cerrar(); }, 150));
    input.addEventListener('keydown', e => {
      if (lista.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); activa = Math.min(activa + 1, opciones.length - 1); marcar(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); activa = Math.max(activa - 1, 0); marcar(); }
      else if (e.key === 'Enter' && activa >= 0) { e.preventDefault(); elegir(opciones[activa]); }
      else if (e.key === 'Escape') cerrar();
    });
  });

  // Al limpiar el formulario (nueva inscripción) se ocultan lista y aviso.
  inNombre.form?.addEventListener('reset', () => { cerrar(); aviso.hidden = true; });
}

const estilos = document.createElement('style');
estilos.textContent = `
  .persona-sugerencias { position: absolute; left: 0; right: 0; top: 100%; z-index: 50; margin-top: -8px;
    background: var(--bg-surface-elevated, #1a1a1a); border: 1px solid var(--border-strong, #333); border-radius: 10px;
    box-shadow: 0 10px 30px rgba(0,0,0,.55); max-height: 320px; overflow-y: auto; }
  .persona-sugerencias .ps-titulo { padding: 8px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--text-muted, #8E9BAE); border-bottom: 1px solid var(--border-strong, #333); }
  .persona-sugerencias .ps-op { padding: 10px 14px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; }
  .persona-sugerencias .ps-op b { font-size: 14px; color: var(--text-main, #fff); }
  .persona-sugerencias .ps-op small { font-size: 12px; color: var(--text-muted, #8E9BAE); }
  .persona-sugerencias .ps-op:hover, .persona-sugerencias .ps-op.activa { background: rgba(0,245,160,.08); }
  .persona-existente { margin: -6px 0 14px; font-size: 12px; color: var(--live-green, #00F5A0); }
`;
document.head.appendChild(estilos);

CAMPOS.forEach(preparar);

// Tras guardar una inscripción puede haber personas nuevas: se recarga la lista.
document.getElementById('form-nueva-inscripcion')?.addEventListener('submit', () => { setTimeout(() => { personas = null; }, 3000); });
