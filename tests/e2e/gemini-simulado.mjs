// Servidor que simula la API de Gemini (generateContent) para las pruebas e2e y la CI.
// No hay IA real aquí: responde con reglas fijas, pero exige lo mismo que la API real
// (clave en x-goog-api-key, esquema JSON en las respuestas estructuradas y la thoughtSignature
// devuelta en el historial de function calling), así se prueba de verdad el cliente de Caserito.
import http from 'node:http';

const PUERTO = Number(process.env.GEMINI_SIMULADO_PUERTO ?? 54399);
const CLAVE = process.env.GEMINI_SIMULADO_CLAVE ?? 'clave-de-prueba';
const FIRMA = 'firma-de-prueba';

const responder = (res, estado, cuerpo) => {
  res.writeHead(estado, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(cuerpo));
};
const error = (res, estado, mensaje) => responder(res, estado, { error: { code: estado, message: mensaje } });
const conTexto = (texto) => ({ candidates: [{ content: { role: 'model', parts: [{ text: texto }] }, finishReason: 'STOP' }] });

const textoDe = (contenido) => (contenido?.parts ?? []).map((p) => p.text ?? '').join('\n');
const jsonTras = (texto, rotulo) => {
  const linea = texto.split('\n').findIndex((l) => l.startsWith(rotulo));
  return linea === -1 ? [] : JSON.parse(texto.split('\n')[linea + 1]);
};
const buscar = (catalogo, patron) => catalogo.find((p) => patron.test(p.nombre))?.id ?? 0;

// HU09: nombres coloquiales → producto del catálogo
const COLOQUIALES = [
  [/gaseosa amarilla/i, /inca kola/i],
  [/galletitas? de soda/i, /soda/i],
];
function sugerencias(cuerpo, res) {
  if (!cuerpo.generationConfig?.responseJsonSchema) return error(res, 400, 'Falta responseJsonSchema en la solicitud simulada');
  const texto = textoDe(cuerpo.contents?.[0]);
  const catalogo = jsonTras(texto, 'Catálogo de la bodega');
  const pendientes = jsonTras(texto, 'Pedidos sin reconocer');
  const lista = pendientes.map((p) => {
    const par = COLOQUIALES.find(([dicho]) => dicho.test(p.texto));
    return { clave: p.clave, producto_id: par ? buscar(catalogo, par[1]) : 0 };
  });
  return responder(res, 200, conTexto(JSON.stringify({ sugerencias: lista })));
}

// HU10: lo que "se lee" en la foto de la factura
function factura(cuerpo, res) {
  const partes = cuerpo.contents?.[0]?.parts ?? [];
  const imagen = partes.find((p) => p.inlineData || p.inline_data);
  const datos = imagen?.inlineData ?? imagen?.inline_data;
  if (!datos?.data || !/^image\//.test(datos.mimeType ?? datos.mime_type ?? '')) return error(res, 400, 'La imagen no llegó');
  if (!cuerpo.generationConfig?.responseJsonSchema) return error(res, 400, 'Falta responseJsonSchema en la solicitud simulada');
  const catalogo = jsonTras(textoDe({ parts: partes }), 'Catálogo de la bodega');
  const hoy = new Date();
  const enDias = (d) => new Date(hoy.getTime() + d * 86_400_000).toISOString().slice(0, 10);
  return responder(res, 200, conTexto(JSON.stringify({
    proveedor: 'Distribuidora El Sol',
    items: [
      { texto: 'INCA KOLA 500ML PET', producto_id: buscar(catalogo, /inca kola 500/i), cantidad: 12, costo_unitario: 2.1, fecha_vencimiento: enDias(90) },
      { texto: 'GALLETA SODA FIELD X6', producto_id: buscar(catalogo, /soda field/i), cantidad: 24, costo_unitario: 0.55, fecha_vencimiento: '' },
      { texto: 'PAPEL HIGIENICO ELITE', producto_id: 0, cantidad: 4, costo_unitario: 1.8, fecha_vencimiento: '' },
    ],
  })));
}

// HU16: function calling
function asistente(cuerpo, res) {
  const contenidos = cuerpo.contents ?? [];
  const ultimo = contenidos.at(-1);
  const respuestas = (ultimo?.parts ?? []).filter((p) => p.functionResponse);
  if (respuestas.length === 0) {
    const pregunta = textoDe(ultimo).toLowerCase();
    const declaradas = (cuerpo.tools?.[0]?.functionDeclarations ?? []).map((f) => f.name);
    let llamada;
    if (/debe/.test(pregunta)) llamada = { name: 'deudores', args: { limite: 3 } };
    else if (/vend/.test(pregunta)) {
      const hoy = /Hoy es (\d{4}-\d{2}-\d{2})/.exec(textoDe(cuerpo.systemInstruction))?.[1];
      llamada = { name: 'resumen_ventas', args: { desde: hoy, hasta: hoy } };
    } else if (/vence|vencer/.test(pregunta)) llamada = { name: 'por_vencer', args: { dias: 7 } };
    else if (/repon|stock/.test(pregunta)) llamada = { name: 'stock_bajo', args: {} };
    else return responder(res, 200, conTexto('Solo puedo responder preguntas sobre tu bodega: ventas, deudas, stock, vencimientos y mermas.'));
    if (!declaradas.includes(llamada.name)) return error(res, 400, `La función ${llamada.name} no fue declarada`);
    return responder(res, 200, {
      candidates: [{ content: { role: 'model', parts: [{ functionCall: { id: 'llamada-1', ...llamada }, thoughtSignature: FIRMA }] }, finishReason: 'STOP' }],
    });
  }
  // Igual que la API real: la llamada previa del modelo debe volver con su thoughtSignature
  const previa = contenidos.at(-2);
  const llamadaPrevia = previa?.parts?.find((p) => p.functionCall);
  if (previa?.role !== 'model' || !llamadaPrevia) return error(res, 400, 'Falta el turno del modelo con la functionCall');
  if (llamadaPrevia.thoughtSignature !== FIRMA) return error(res, 400, 'Function call is missing a thought_signature');
  const r = respuestas[0].functionResponse;
  if (r.id !== 'llamada-1') return error(res, 400, 'El id de la functionResponse no coincide');
  const datos = r.response?.resultado;
  let texto = 'Listo.';
  const primero = datos?.deudores?.[0];
  if (r.name === 'deudores') texto = primero ? `Quien más te debe es ${primero.nombre}, con S/ ${Number(primero.deuda).toFixed(2)}.` : 'Nadie te debe.';
  if (r.name === 'resumen_ventas') texto = `Vendiste S/ ${Number(datos?.total_vendido ?? 0).toFixed(2)} en ${datos?.cantidad_ventas ?? 0} ventas.`;
  if (r.name === 'stock_bajo') texto = datos?.productos?.length ? `Te conviene reponer: ${datos.productos.map((p) => p.nombre).join(', ')}.` : 'No hay productos con stock bajo.';
  if (r.name === 'por_vencer') texto = datos?.por_vencer?.length ? `Por vencer: ${datos.por_vencer.map((p) => p.producto).join(', ')}.` : 'No hay productos por vencer.';
  if (datos?.error) texto = `No pude consultar: ${datos.error}`;
  return responder(res, 200, conTexto(texto));
}

http
  .createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/salud') return responder(res, 200, { ok: true });
    if (req.method !== 'POST' || !/^\/v1beta\/models\/[^/:]+:generateContent$/.test(req.url ?? '')) return error(res, 404, 'Ruta no encontrada');
    if (req.headers['x-goog-api-key'] !== CLAVE) return error(res, 403, 'API key not valid');
    let datos = '';
    req.on('data', (c) => (datos += c));
    req.on('end', () => {
      let cuerpo;
      try {
        cuerpo = JSON.parse(datos);
      } catch {
        return error(res, 400, 'JSON inválido');
      }
      if ('temperature' in (cuerpo.generationConfig ?? {})) return error(res, 400, 'temperature está obsoleto en los modelos actuales');
      if (cuerpo.tools) return asistente(cuerpo, res);
      const conImagen = (cuerpo.contents?.[0]?.parts ?? []).some((p) => p.inlineData || p.inline_data);
      return conImagen ? factura(cuerpo, res) : sugerencias(cuerpo, res);
    });
  })
  .listen(PUERTO, '127.0.0.1', () => console.log(`Gemini simulado en http://127.0.0.1:${PUERTO}`));
