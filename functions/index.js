// Cloudflare Pages Function para la portada (/): tarjeta de vista previa de los
// enlaces a una carrera (?rally=<id>&ver=tiempos|pilotos|stats).
import { esLectorDeEnlaces, datosInicio, conVistaPrevia } from '../vista_previa.js';

export async function onRequestGet({ request, next }) {
  const pagina = await next();
  if (!esLectorDeEnlaces(request) || !(pagina.headers.get('content-type') || '').includes('text/html')) return pagina;
  const url = new URL(request.url);
  const datos = await datosInicio(url);
  return datos ? conVistaPrevia(pagina, datos, url) : pagina;
}
