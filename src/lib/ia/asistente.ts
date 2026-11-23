import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DECLARACIONES, ejecutarConsulta, ErrorConsulta, esConsulta } from './consultas';
import { contenidoDe, generar, textoDe, type Contenido, type Parte } from './gemini';

// HU16: asistente de consultas en lenguaje natural con function calling.
// Gemini decide qué consulta predefinida necesita; Caserito la ejecuta y le devuelve el resultado.

export type Turno = { rol: 'usuario' | 'asistente'; texto: string };
export type RespuestaAsistente = { respuesta: string; consultas: string[] };

const MAX_PASOS = 4;

export function instruccionesAsistente(bodega: string, hoy: string): string {
  return [
    `Eres el asistente de Caserito para la bodega "${bodega}" en Perú. Hoy es ${hoy} (hora de Lima).`,
    'Respondes preguntas del dueño sobre su negocio: ventas, deudas del cuaderno de fiados, stock, vencimientos y mermas.',
    'Usa siempre las funciones para obtener los datos y nunca inventes cifras. Si ninguna función sirve, dilo con amabilidad.',
    'Para "esta semana" usa desde el lunes hasta hoy; para "este mes", desde el día 1 hasta hoy; para "ayer", solo ese día.',
    'Responde en español sencillo, en una a tres oraciones, con montos en soles (S/ 0.00).',
    'No pidas ni muestres datos personales que no hagan falta para responder.',
  ].join(' ');
}

export async function responderPregunta(
  db: SupabaseClient,
  pregunta: string,
  historial: Turno[],
  ctx: { bodega: string; hoy: string; diasAviso: number },
): Promise<RespuestaAsistente> {
  const contents: Contenido[] = [
    ...historial.slice(-6).map((t): Contenido => ({ role: t.rol === 'usuario' ? 'user' : 'model', parts: [{ text: t.texto }] })),
    { role: 'user', parts: [{ text: pregunta }] },
  ];
  const consultas: string[] = [];

  for (let paso = 0; paso < MAX_PASOS; paso++) {
    const r = await generar({
      systemInstruction: { parts: [{ text: instruccionesAsistente(ctx.bodega, ctx.hoy) }] },
      contents,
      tools: [{ functionDeclarations: DECLARACIONES }],
    });
    const contenido = contenidoDe(r);
    const llamadas = contenido.parts.filter((p) => p.functionCall) as { functionCall: { name: string; args?: Record<string, unknown>; id?: string } }[];
    if (llamadas.length === 0) return { respuesta: textoDe(r) || 'No encontré una respuesta para eso.', consultas };

    // El turno del modelo vuelve tal cual (con su thoughtSignature), como exige la API
    contents.push(contenido);
    const resultados: Parte[] = [];
    for (const { functionCall: f } of llamadas) {
      consultas.push(f.name);
      let resultado: unknown;
      try {
        if (!esConsulta(f.name)) throw new ErrorConsulta(`La función "${f.name}" no existe.`);
        resultado = await ejecutarConsulta(db, f.name, f.args ?? {}, ctx);
      } catch (e) {
        resultado = { error: e instanceof ErrorConsulta ? e.message : 'No se pudo hacer la consulta.' };
      }
      resultados.push({ functionResponse: { name: f.name, ...(f.id ? { id: f.id } : {}), response: { resultado } } });
    }
    contents.push({ role: 'user', parts: resultados });
  }
  return { respuesta: 'La pregunta necesitó demasiadas consultas. Intenta hacerla más concreta.', consultas };
}

/** Lo que se acepta del navegador. */
export function validarPregunta(pregunta: unknown, historial: unknown): { pregunta: string; historial: Turno[] } | null {
  const p = String(pregunta ?? '').trim();
  if (!p || p.length > 300) return null;
  const h = Array.isArray(historial) ? historial : [];
  const turnos: Turno[] = [];
  for (const t of h.slice(-10)) {
    const rol = (t as Turno)?.rol;
    const texto = String((t as Turno)?.texto ?? '').slice(0, 1000);
    if ((rol === 'usuario' || rol === 'asistente') && texto) turnos.push({ rol, texto });
  }
  return { pregunta: p, historial: turnos };
}
