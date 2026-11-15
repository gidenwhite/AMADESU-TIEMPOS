// Lo que comparten la página pública del ranking (ranking.html) y la de
// administración (ranking_admin.html): cálculo de puntos, orden por clase e
// imagen para redes sociales.

export const num = v => { const n = Number(String(v ?? '').trim().replace(',', '.')); return Number.isFinite(n) ? n : 0; };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const verPts = n => { const r = Math.round(num(n) * 10) / 10; return Number.isInteger(r) ? String(r) : r.toFixed(1); };

// Columnas de puntos de cada tipo de fecha (como el Excel).
export const CAMPOS = {
  rally: [['a', 'Etapa 1', 'ET1'], ['b', 'Etapa 2', 'ET2'], ['g', 'General', 'GRAL']],
  circuito: [['a', 'Punto clasificación', 'CLASF'], ['g', 'Puntos general', 'GRAL']],
};
export const camposDe = f => CAMPOS[f?.tipo === 'circuito' ? 'circuito' : 'rally'];
const valor = (fila, f, k) => fila.puntos?.[f.id]?.[k];
const lleno = v => v !== undefined && v !== null && v !== '';
export const corrio = (fila, f) => camposDe(f).some(([k]) => lleno(valor(fila, f, k)));
export const totalFecha = (fila, f) => camposDe(f).reduce((s, [k]) => s + num(valor(fila, f, k)), 0);
export const totalFila = (fila, fechas) => fechas.reduce((s, f) => s + totalFecha(fila, f), 0);

const normal = s => String(s || '').trim().toUpperCase();

// Orden de las clases: el elegido para el campeonato; las demás, como aparecen.
export function ordenClases(camp, filas) {
  const manual = (camp.orden_clases || []).map(normal).filter(Boolean);
  const vistas = [];
  for (const f of filas) { const c = normal(f.clase); if (c && !vistas.includes(c)) vistas.push(c); }
  return manual.filter(c => vistas.includes(c)).concat(vistas.filter(c => !manual.includes(c)));
}

// Ranking de un rol (piloto / navegante): por clase, de más a menos puntos.
// Empates: mismo puesto (1, 2, 2, 4).
export function ranking(camp, filas, rol) {
  const fechas = camp.fechas || [];
  const delRol = filas.filter(f => f.rol === rol);
  return ordenClases(camp, delRol).map(clase => {
    const lista = delRol.filter(f => normal(f.clase) === clase)
      .map(f => ({ ...f, total: totalFila(f, fechas), corridas: fechas.filter(x => corrio(f, x)).length }))
      .sort((a, b) => b.total - a.total || b.corridas - a.corridas || a.nombre.localeCompare(b.nombre));
    lista.forEach((f, i) => { f.psto = i > 0 && lista[i - 1].total === f.total ? lista[i - 1].psto : i + 1; });
    return { clase, filas: lista };
  });
}

// Nombre corto de una fecha para gráficos ("RALLY SPRINT SUCRE CAPITAL" -> "SUCRE CAPITAL").
export const nombreCorto = n => String(n || '').toUpperCase().replace(/^(RALLY|CIRCUITO)\s+(SPRINT\s+)?/, '').replace(/^"(.*)"$/, '$1').trim() || String(n || '');

// ------------------------------------------------------------------
// Imagen para redes (1080 × 1350, formato vertical de Instagram/Facebook)
// ------------------------------------------------------------------
const COLOR_PUESTO = p => p === 1 ? ['#FFD166', '#FFB703'] : p === 2 ? ['#E9EEF5', '#AEB8C6'] : p === 3 ? ['#F0B27A', '#C77D43'] : ['#FF4D5A', '#E63946'];

function cargarImagen(src) {
  return new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
}
async function fuentes() {
  if (!document.fonts?.load) return;
  await Promise.all([
    document.fonts.load('400 120px "Russo One"'), document.fonts.load('800 80px "Barlow Condensed"'),
    document.fonts.load('900 80px "Barlow Condensed"'), document.fonts.load('600 30px "Chakra Petch"'),
    document.fonts.load('700 30px "Chakra Petch"'),
  ].map(p => p.catch(() => null)));
}
// Achica la letra hasta que entre; parte en 2 renglones si hace falta.
function ajustar(ctx, texto, fuente, max, ancho, min = 40) {
  let t = max;
  const medir = s => { ctx.font = fuente(t); return ctx.measureText(s).width; };
  while (t > min && medir(texto) > ancho) {
    const pal = texto.split(' ');
    if (pal.length > 1 && t < max * 0.82) {
      // dos renglones, lo más parejos posible
      let mejor = null;
      for (let i = 1; i < pal.length; i++) {
        const l = [pal.slice(0, i).join(' '), pal.slice(i).join(' ')];
        const w = Math.max(medir(l[0]), medir(l[1]));
        if (!mejor || w < mejor.w) mejor = { l, w };
      }
      let t2 = max;
      const medir2 = s => { ctx.font = fuente(t2); return ctx.measureText(s).width; };
      while (t2 > min && Math.max(medir2(mejor.l[0]), medir2(mejor.l[1])) > ancho) t2 -= 2;
      return { lineas: mejor.l, t: t2 };
    }
    t -= 2;
  }
  return { lineas: [texto], t };
}

export async function imagenRanking({ camp, fila, rol, clase, lista }) {
  await fuentes();
  const W = 1080, H = 1350;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const fechas = camp.fechas || [];
  const p = fila.psto;
  const [c1, c2] = COLOR_PUESTO(p);
  const lider = lista[0], segundo = lista.find(x => x.psto > 1);

  // Fondo: negro carbono con viñeta
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#16161a'); bg.addColorStop(0.55, '#0b0b0d'); bg.addColorStop(1, '#050506');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalAlpha = 0.05; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  for (let x = -H; x < W; x += 14) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H, H); ctx.stroke(); }
  ctx.restore();
  const luz = ctx.createRadialGradient(W * 0.78, H * 0.3, 40, W * 0.78, H * 0.3, 720);
  luz.addColorStop(0, c2 + '55'); luz.addColorStop(1, 'transparent');
  ctx.fillStyle = luz; ctx.fillRect(0, 0, W, H);

  // Franjas de carrera en diagonal
  ctx.save();
  ctx.translate(W, 0); ctx.rotate(Math.PI / 7.5);
  [[0, 34, '#E63946'], [52, 12, '#ffffff'], [76, 6, c1]].forEach(([y, h, col]) => { ctx.fillStyle = col; ctx.globalAlpha = col === '#ffffff' ? 0.85 : 1; ctx.fillRect(-1600, 300 + y, 3200, h); });
  ctx.restore();

  // Número de puesto gigante, de fondo
  ctx.save();
  ctx.font = '400 760px "Russo One", Impact, sans-serif';
  ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 0.11; ctx.fillStyle = c1;
  ctx.fillText(String(p), W + 40, 980);
  ctx.globalAlpha = 0.22; ctx.lineWidth = 3; ctx.strokeStyle = c1;
  ctx.strokeText(String(p), W + 40, 980);
  ctx.restore();

  // Bandera a cuadros (arriba)
  const cuadros = (y, alto, alpha) => {
    ctx.save(); ctx.globalAlpha = alpha;
    const t = alto / 2;
    for (let x = 0, i = 0; x < W; x += t, i++) for (let r = 0; r < 2; r++) { ctx.fillStyle = (i + r) % 2 ? '#fff' : '#000'; ctx.fillRect(x, y + r * t, t, t); }
    ctx.restore();
  };
  cuadros(0, 28, 0.9);

  // Logo y etiqueta
  const logo = await cargarImagen('icons/amadesu_escudo.png');
  if (logo) { const h = 150, w = logo.width * (h / logo.height); ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 24; ctx.drawImage(logo, 50, 46, w, h); ctx.shadowBlur = 0; }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.font = '700 26px "Chakra Petch", sans-serif';
  const etiqueta = `RANKING ${(camp.titulo.match(/20\d\d|2\.0\d\d/) || [''])[0].replace('.', '')}`.trim();
  const ew = ctx.measureText(etiqueta).width + 44;
  ctx.fillStyle = '#E63946'; redondeado(ctx, W - 60 - ew, 86, ew, 50, 25); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText(etiqueta, W - 82, 112);

  // Rol y clase
  let y = 300;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = '700 34px "Chakra Petch", sans-serif'; ctx.fillStyle = '#C7CDD6';
  const rolTxt = rol === 'piloto' ? 'PILOTO' : 'NAVEGANTE';
  ctx.fillText(rolTxt, 64, y);
  const rw = ctx.measureText(rolTxt).width;
  ctx.font = '800 34px "Barlow Condensed", sans-serif';
  const cw = ctx.measureText(clase).width + 36;
  ctx.fillStyle = c1; redondeado(ctx, 64 + rw + 22, y - 33, cw, 46, 8); ctx.fill();
  ctx.fillStyle = '#0b0b0d'; ctx.fillText(clase, 64 + rw + 40, y + 1);
  if (fila.numero) { ctx.fillStyle = '#8E9BAE'; ctx.font = '700 34px "Chakra Petch", sans-serif'; ctx.fillText(`#${fila.numero}`, 64 + rw + 22 + cw + 22, y); }

  // Puesto
  y += 170;
  const gp = ctx.createLinearGradient(0, y - 150, 0, y);
  gp.addColorStop(0, c1); gp.addColorStop(1, c2);
  ctx.fillStyle = gp; ctx.font = '400 190px "Russo One", Impact, sans-serif';
  ctx.fillText(String(p), 56, y);
  let pw = ctx.measureText(String(p)).width;
  // "°" dibujado como un anillo arriba a la derecha del número
  ctx.strokeStyle = gp; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(56 + pw + 24, y - 122, 15, 0, Math.PI * 2); ctx.stroke();
  pw += 52;
  ctx.font = '800 46px "Barlow Condensed", sans-serif'; ctx.fillStyle = '#F8F9FA';
  ctx.fillText(p === 1 ? 'LÍDER' : 'LUGAR', 56 + pw + 18, y - 92);
  ctx.font = '600 30px "Chakra Petch", sans-serif'; ctx.fillStyle = '#8E9BAE';
  ctx.fillText(`de ${lista.length} en la clase`, 56 + pw + 18, y - 40);

  // Nombre
  y += 40;
  const nom = ajustar(ctx, fila.nombre, t => `900 ${t}px "Barlow Condensed", sans-serif`, 124, W - 128, 58);
  if (nom.lineas.length > 1) nom.t = Math.min(nom.t, 98); // en 2 renglones, más chico: deja lugar a las barras
  ctx.font = `900 ${nom.t}px "Barlow Condensed", sans-serif`; ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 18;
  nom.lineas.forEach((l, i) => ctx.fillText(l, 60, y + nom.t * 0.86 * (i + 1)));
  ctx.shadowBlur = 0;
  y += nom.t * 0.86 * nom.lineas.length + 30;

  // Puntos totales + datos
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; redondeado(ctx, 56, y, W - 112, 200, 26); ctx.fill();
  ctx.strokeStyle = c1 + '88'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = c1; ctx.fillRect(56, y + 30, 8, 140);
  ctx.font = '400 128px "Russo One", Impact, sans-serif'; ctx.fillStyle = '#fff';
  const tot = verPts(fila.total);
  ctx.fillText(tot, 96, y + 150);
  const tw = ctx.measureText(tot).width;
  ctx.font = '800 40px "Barlow Condensed", sans-serif'; ctx.fillStyle = c1;
  ctx.fillText('PUNTOS', 96 + tw + 16, y + 150);
  const datos = [
    [`${fila.corridas}/${fechas.length}`, 'FECHAS'],
    p === 1 && segundo ? [`+${verPts(fila.total - segundo.total)}`, 'SOBRE EL 2°'] : p > 1 ? [`-${verPts(lider.total - fila.total)}`, 'DEL LÍDER'] : null,
  ].filter(Boolean);
  ctx.textAlign = 'right';
  datos.forEach(([v, l], i) => {
    const x = W - 96 - i * 200;
    ctx.font = '400 56px "Russo One", Impact, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(v, x, y + 110);
    ctx.font = '700 22px "Chakra Petch", sans-serif'; ctx.fillStyle = '#8E9BAE'; ctx.fillText(l, x, y + 148);
  });
  ctx.textAlign = 'left';
  y += 240;

  // Barras: puntos por fecha (siempre con la misma altura)
  y = Math.min(y, H - 430);
  const zonaAlto = H - 150 - y;
  if (fechas.length && zonaAlto > 160) {
    ctx.font = '700 24px "Chakra Petch", sans-serif'; ctx.fillStyle = '#8E9BAE';
    ctx.fillText('PUNTOS POR FECHA', 60, y + 6);
    const n = fechas.length, gap = n > 6 ? 14 : 22, bw = (W - 120 - gap * (n - 1)) / n;
    const maxV = Math.max(30, ...fechas.map(f => totalFecha(fila, f)));
    const base = y + zonaAlto - 62, altoMax = zonaAlto - 150;
    fechas.forEach((f, i) => {
      const x = 60 + i * (bw + gap), v = totalFecha(fila, f), h = Math.max(6, altoMax * v / maxV);
      const fue = corrio(fila, f);
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; redondeado(ctx, x, base - altoMax, bw, altoMax, 10); ctx.fill();
      if (fue) {
        const g = ctx.createLinearGradient(0, base - h, 0, base);
        g.addColorStop(0, c1); g.addColorStop(1, c2 + 'aa');
        ctx.fillStyle = g; redondeado(ctx, x, base - h, bw, h, 10); ctx.fill();
      }
      ctx.textAlign = 'center';
      ctx.font = `400 ${bw < 110 ? 30 : 36}px "Russo One", Impact, sans-serif`; ctx.fillStyle = fue ? '#fff' : '#546071';
      ctx.fillText(fue ? verPts(v) : '—', x + bw / 2, base - h - 14);
      const corto = ajustar(ctx, nombreCorto(f.nombre), t => `800 ${t}px "Barlow Condensed", sans-serif`, 26, bw + gap - 4, 15);
      ctx.font = `800 ${corto.t}px "Barlow Condensed", sans-serif`; ctx.fillStyle = '#C7CDD6';
      corto.lineas.forEach((l, k) => ctx.fillText(l, x + bw / 2, base + 30 + k * (corto.t + 2)));
      ctx.textAlign = 'left';
    });
  }

  // Pie
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, H - 118, W, 90);
  ctx.font = '700 25px "Chakra Petch", sans-serif'; ctx.fillStyle = '#F8F9FA';
  const pie = ajustar(ctx, camp.titulo.toUpperCase(), t => `700 ${t}px "Chakra Petch", sans-serif`, 25, W - 400, 16);
  ctx.font = `700 ${pie.t}px "Chakra Petch", sans-serif`;
  ctx.fillText(pie.lineas.join(' '), 60, H - 80);
  ctx.font = '600 21px "Chakra Petch", sans-serif'; ctx.fillStyle = '#8E9BAE';
  ctx.fillText([camp.subtitulo, camp.fecha_corte].filter(Boolean).join('  ·  ').slice(0, 70), 60, H - 47);
  ctx.textAlign = 'right'; ctx.font = '400 34px "Russo One", Impact, sans-serif'; ctx.fillStyle = '#E63946';
  ctx.fillText('AMADESU.COM', W - 60, H - 60);
  ctx.textAlign = 'left';
  cuadros(H - 28, 28, 0.9);
  return cv;
}

function redondeado(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Descargar o compartir la imagen (en el celular abre "Compartir" con Instagram, WhatsApp...).
export async function compartirImagen(cv, nombreArchivo, texto) {
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  const file = new File([blob], nombreArchivo, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text: texto }); return 'compartida'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelada'; }
  }
  descargarBlob(blob, nombreArchivo);
  return 'descargada';
}
export function descargarBlob(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export const archivoDe = s => String(s || '').replace(/[\\/:*?"<>|]/g, '').trim();
