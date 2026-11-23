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

export type TipoErrorIA = 'sin_configurar' | 'limite' | 'saturado' | 'respuesta' | 'red';

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

const clave = () => process.env.GEMINI_API_KEY?.trim() ?? '';

export function iaDisponible(): boolean {
  return clave().length > 0;
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
    case 'saturado':
      return 'Los servidores de IA de Google están saturados en este momento. Espera un minuto y vuelve a intentarlo.';
    case 'red':
      return e.message === 'tiempo agotado'
        ? 'La IA tardó demasiado en responder. Inténtalo de nuevo.'
        : `No se pudo conectar con la IA (${e.message}). Inténtalo de nuevo.`;
    default:
      return `La IA no pudo responder (${e.message}).`;
  }
}

/** Quita la clave de cualquier texto antes de registrarlo. */
function sinClave(texto: string): string {
  const k = clave();
  return k ? texto.split(k).join('***') : texto;
}

// Se pide poco razonamiento para responder rápido; si el modelo no admite el parámetro, se deja de enviar
let enviarNivelRazonamiento = true;

/** Modelo de respaldo cuando el principal está saturado (503) o sin cuota (429): los límites son por modelo. */
export function modeloRespaldo(): string {
  return process.env.GEMINI_MODEL_RESPALDO || 'gemini-flash-lite-latest';
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const esTransitorio = (e: ErrorIA) =>
  e.tipo === 'limite' || e.tipo === 'saturado' || (e.tipo === 'red' && e.message === 'tiempo agotado');

/**
 * Llama a generateContent. Si el modelo está saturado, sin cuota o no responde a tiempo,
 * espera un momento y lo intenta una vez con el modelo de respaldo.
 */
export async function generar(cuerpo: object, { timeoutMs = 25_000 } = {}): Promise<RespuestaGemini> {
  try {
    return await llamar(modeloIA(), cuerpo, timeoutMs);
  } catch (e) {
    if (!(e instanceof ErrorIA) || !esTransitorio(e)) throw e;
    await esperar(Number(process.env.GEMINI_ESPERA_MS ?? 1200));
    try {
      return await llamar(modeloRespaldo(), cuerpo, timeoutMs);
    } catch (e2) {
      // Si el respaldo no existe (404), el error útil para el usuario es el primero
      if (e2 instanceof ErrorIA && e2.estado === 404) throw e;
      throw e2;
    }
  }
}

async function llamar(modelo: string, cuerpo: object, timeoutMs: number): Promise<RespuestaGemini> {
  const k = clave();
  if (!k) throw new ErrorIA('sin_configurar', 'falta GEMINI_API_KEY');
  const base = (process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const c = cuerpo as { generationConfig?: Record<string, unknown> };
  const conRazonamiento = enviarNivelRazonamiento
    ? { ...c, generationConfig: { ...c.generationConfig, thinkingConfig: { thinkingLevel: 'low' } } }
    : c;

  let res: Response;
  try {
    res = await fetch(`${base}/models/${encodeURIComponent(modelo)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k },
      body: JSON.stringify(conRazonamiento),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string } };
    console.error(`[IA] Sin respuesta de ${modelo}:`, err.name, sinClave(String(err.cause?.message ?? err.message ?? '')));
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new ErrorIA('red', 'tiempo agotado');
    const codigo = String(err.cause?.code ?? err.name ?? 'desconocido').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40);
    throw new ErrorIA('red', codigo || 'desconocido');
  }

  if (!res.ok) {
    let detalle = `error ${res.status}`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j.error?.message) detalle = `${res.status}: ${sinClave(j.error.message).slice(0, 160)}`;
    } catch {
      /* cuerpo no JSON */
    }
    console.error(`[IA] ${modelo} respondió con error:`, detalle);
    if (res.status === 429) throw new ErrorIA('limite', 'límite de uso', 429);
    if ([500, 503, 504].includes(res.status)) throw new ErrorIA('saturado', detalle, res.status);
    if (res.status === 400 && enviarNivelRazonamiento && /thinking/i.test(detalle)) {
      enviarNivelRazonamiento = false;
      return llamar(modelo, cuerpo, timeoutMs);
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
