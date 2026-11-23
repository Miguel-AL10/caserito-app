import 'server-only';

// Cliente mínimo de la API de Gemini (Google AI Studio) por REST, sin SDK.
// La clave solo existe en el servidor (GEMINI_API_KEY) y nunca llega al navegador.
// GEMINI_API_URL permite apuntar a un servidor simulado en las pruebas e2e.

export type Parte = Record<string, unknown>;
export type Contenido = { role: 'user' | 'model'; parts: Parte[] };
export type RespuestaGemini = {
  candidates?: { content?: Contenido; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

export type TipoErrorIA = 'sin_configurar' | 'limite' | 'respuesta' | 'red';

export class ErrorIA extends Error {
  constructor(
    public tipo: TipoErrorIA,
    mensaje: string,
    public estado?: number,
  ) {
    super(mensaje);
    this.name = 'ErrorIA';
  }
}

export function iaDisponible(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function modeloIA(): string {
  return process.env.GEMINI_MODEL || 'gemini-flash-latest';
}

/** Mensaje para la interfaz: no expone la clave ni detalles internos. */
export function mensajeErrorIA(e: unknown): string {
  if (!(e instanceof ErrorIA)) return 'La IA no pudo responder. Inténtalo de nuevo.';
  switch (e.tipo) {
    case 'sin_configurar':
      return 'La IA no está configurada en este entorno.';
    case 'limite':
      return 'La IA recibió muchas consultas seguidas. Espera un minuto y vuelve a intentarlo.';
    case 'red':
      return 'No hubo respuesta de la IA a tiempo. Revisa la conexión e inténtalo de nuevo.';
    default:
      return `La IA no pudo responder (${e.message}).`;
  }
}

/** Llama a generateContent con el cuerpo dado. */
export async function generar(cuerpo: object, { timeoutMs = 45_000 } = {}): Promise<RespuestaGemini> {
  const clave = process.env.GEMINI_API_KEY;
  if (!clave) throw new ErrorIA('sin_configurar', 'falta GEMINI_API_KEY');
  const base = (process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');

  let res: Response;
  try {
    res = await fetch(`${base}/models/${encodeURIComponent(modeloIA())}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
      body: JSON.stringify(cuerpo),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ErrorIA('red', 'sin respuesta');
  }

  if (res.status === 429) throw new ErrorIA('limite', 'límite de uso', 429);
  if (!res.ok) {
    let detalle = `error ${res.status}`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j.error?.message) detalle = `${res.status}: ${j.error.message.slice(0, 160)}`;
    } catch {
      /* cuerpo no JSON */
    }
    throw new ErrorIA('respuesta', detalle, res.status);
  }
  const json = (await res.json()) as RespuestaGemini;
  if (json.promptFeedback?.blockReason) throw new ErrorIA('respuesta', `bloqueado: ${json.promptFeedback.blockReason}`);
  return json;
}

/** Contenido del primer candidato (tal cual, con sus thoughtSignature). */
export function contenidoDe(r: RespuestaGemini): Contenido {
  const c = r.candidates?.[0]?.content;
  if (!c?.parts) throw new ErrorIA('respuesta', 'respuesta vacía');
  return { role: 'model', parts: c.parts };
}

/** Texto visible de la respuesta (sin las partes de razonamiento). */
export function textoDe(r: RespuestaGemini): string {
  return contenidoDe(r)
    .parts.filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text as string)
    .join('')
    .trim();
}

/** Interpreta un JSON aunque venga dentro de un bloque ```json ... ```. */
export function leerJSON(texto: string): unknown {
  const limpio = texto.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try {
    return JSON.parse(limpio);
  } catch {
    throw new ErrorIA('respuesta', 'la IA no devolvió datos válidos');
  }
}

/**
 * Pide una respuesta en JSON que cumpla el esquema (salida estructurada).
 * Si el modelo rechaza el esquema (400), reintenta pidiendo el mismo formato en el texto.
 */
export async function generarJSON({ sistema, partes, esquema }: { sistema: string; partes: Parte[]; esquema: object }): Promise<unknown> {
  const base = { systemInstruction: { parts: [{ text: sistema }] }, contents: [{ role: 'user', parts: partes }] };
  try {
    const r = await generar({ ...base, generationConfig: { responseMimeType: 'application/json', responseJsonSchema: esquema } });
    return leerJSON(textoDe(r));
  } catch (e) {
    if (!(e instanceof ErrorIA) || e.estado !== 400 || !/schema/i.test(e.message)) throw e;
    const r = await generar({
      ...base,
      contents: [{ role: 'user', parts: [...partes, { text: `Responde solo con JSON válido que cumpla este esquema: ${JSON.stringify(esquema)}` }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });
    return leerJSON(textoDe(r));
  }
}
