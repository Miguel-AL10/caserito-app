// Cliente de Gemini (HU09, HU10, HU16): forma de la solicitud y manejo de errores, con fetch simulado
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorIA, generarJSON, leerJSON, mensajeErrorIA, textoDe } from '@/lib/ia/gemini';

const respuesta = (estado: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });
const conTexto = (texto: string) => ({ candidates: [{ content: { role: 'model', parts: [{ text: texto }] } }] });

describe('Cliente de Gemini', () => {
  const fetchSimulado = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSimulado);
    vi.stubEnv('GEMINI_API_KEY', 'clave-x');
    vi.stubEnv('GEMINI_API_URL', 'https://gemini.prueba/v1beta');
    vi.stubEnv('GEMINI_MODEL', 'modelo-prueba');
    vi.stubEnv('GEMINI_MODEL_RESPALDO', 'modelo-respaldo');
    vi.stubEnv('GEMINI_ESPERA_MS', '0');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    fetchSimulado.mockReset();
  });

  it('envía la clave en la cabecera (no en la URL), el esquema JSON y nada de temperature', async () => {
    fetchSimulado.mockResolvedValueOnce(respuesta(200, conTexto('{"ok":true}')));
    const r = await generarJSON({ sistema: 'S', partes: [{ text: 'hola' }], esquema: { type: 'object' } });
    expect(r).toEqual({ ok: true });
    const [url, init] = fetchSimulado.mock.calls[0];
    expect(url).toBe('https://gemini.prueba/v1beta/models/modelo-prueba:generateContent');
    expect(url).not.toContain('clave-x');
    expect(init.headers['x-goog-api-key']).toBe('clave-x');
    const cuerpo = JSON.parse(init.body);
    expect(cuerpo.systemInstruction).toEqual({ parts: [{ text: 'S' }] });
    expect(cuerpo.contents).toEqual([{ role: 'user', parts: [{ text: 'hola' }] }]);
    expect(cuerpo.generationConfig).toEqual({
      responseMimeType: 'application/json',
      responseJsonSchema: { type: 'object' },
      thinkingConfig: { thinkingLevel: 'low' }, // poco razonamiento: respuestas más rápidas
    });
  });

  it('si el modelo no acepta el nivel de razonamiento, reintenta sin él y no lo vuelve a enviar', async () => {
    fetchSimulado
      .mockResolvedValueOnce(respuesta(400, { error: { message: 'Invalid JSON payload: Unknown name "thinkingLevel" at generation_config.thinking_config' } }))
      .mockResolvedValueOnce(respuesta(200, conTexto('{"a":1}')))
      .mockResolvedValueOnce(respuesta(200, conTexto('{"b":2}')));
    expect(await generarJSON({ sistema: 'S', partes: [{ text: 'x' }], esquema: { type: 'object' } })).toEqual({ a: 1 });
    expect(JSON.parse(fetchSimulado.mock.calls[1][1].body).generationConfig.thinkingConfig).toBeUndefined();
    await generarJSON({ sistema: 'S', partes: [{ text: 'x' }], esquema: { type: 'object' } });
    expect(JSON.parse(fetchSimulado.mock.calls[2][1].body).generationConfig.thinkingConfig).toBeUndefined();
  });

  it('si el modelo rechaza el esquema, reintenta pidiendo el JSON en el texto', async () => {
    fetchSimulado
      .mockResolvedValueOnce(respuesta(400, { error: { message: 'Unknown name "responseJsonSchema": schema not supported' } }))
      .mockResolvedValueOnce(respuesta(200, conTexto('```json\n{"items":[]}\n```')));
    expect(await generarJSON({ sistema: 'S', partes: [{ text: 'x' }], esquema: { type: 'object' } })).toEqual({ items: [] });
    const segundo = JSON.parse(fetchSimulado.mock.calls[1][1].body);
    expect(segundo.generationConfig).toEqual({ responseMimeType: 'application/json' });
    expect(segundo.contents[0].parts.at(-1).text).toContain('Responde solo con JSON');
  });

  it('traduce los errores a mensajes para el usuario sin exponer la clave', async () => {
    fetchSimulado.mockResolvedValueOnce(respuesta(429, { error: { message: 'quota' } })).mockResolvedValueOnce(respuesta(429, { error: { message: 'quota' } }));
    const e1 = await generarJSON({ sistema: 'S', partes: [], esquema: {} }).catch((e) => e);
    expect(e1).toBeInstanceOf(ErrorIA);
    expect(mensajeErrorIA(e1)).toContain('Espera un minuto');

    fetchSimulado.mockResolvedValueOnce(respuesta(404, { error: { message: 'models/modelo-prueba is not found' } }));
    const e2 = await generarJSON({ sistema: 'S', partes: [], esquema: {} }).catch((e) => e);
    expect(mensajeErrorIA(e2)).toContain('404');
    expect(mensajeErrorIA(e2)).not.toContain('clave-x');

    const tiempo = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    fetchSimulado.mockRejectedValueOnce(tiempo()).mockRejectedValueOnce(tiempo());
    expect(mensajeErrorIA(await generarJSON({ sistema: 'S', partes: [], esquema: {} }).catch((e) => e))).toContain('tardó demasiado');

    // Error de conexión: se muestra solo el código, nunca el mensaje original (podría traer la clave)
    fetchSimulado.mockRejectedValueOnce(Object.assign(new TypeError('fetch failed clave-x'), { cause: { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND' } }));
    const e3 = mensajeErrorIA(await generarJSON({ sistema: 'S', partes: [], esquema: {} }).catch((e) => e));
    expect(e3).toBe('No se pudo conectar con la IA (ENOTFOUND). Inténtalo de nuevo.');
    fetchSimulado.mockRejectedValueOnce(new TypeError('Headers.append: "cla\nve-x" is an invalid header value.'));
    expect(mensajeErrorIA(await generarJSON({ sistema: 'S', partes: [], esquema: {} }).catch((e) => e))).not.toContain('cla');

    vi.stubEnv('GEMINI_API_KEY', '');
    const e4 = await generarJSON({ sistema: 'S', partes: [], esquema: {} }).catch((e) => e);
    expect(mensajeErrorIA(e4)).toBe('La IA no está configurada en este entorno.');
  });

  it('si el modelo está saturado (503) usa el modelo de respaldo; si también falla, lo dice claro', async () => {
    fetchSimulado
      .mockResolvedValueOnce(respuesta(503, { error: { message: 'This model is currently experiencing high demand.' } }))
      .mockResolvedValueOnce(respuesta(200, conTexto('{"ok":1}')));
    expect(await generarJSON({ sistema: 'S', partes: [], esquema: {} })).toEqual({ ok: 1 });
    expect(fetchSimulado.mock.calls[0][0]).toContain('/models/modelo-prueba:');
    expect(fetchSimulado.mock.calls[1][0]).toContain('/models/modelo-respaldo:');

    fetchSimulado.mockReset();
    fetchSimulado
      .mockResolvedValueOnce(respuesta(503, { error: { message: 'high demand' } }))
      .mockResolvedValueOnce(respuesta(404, { error: { message: 'models/modelo-respaldo is not found' } }));
    const e = await generarJSON({ sistema: 'S', partes: [], esquema: {} }).catch((x) => x);
    expect(mensajeErrorIA(e)).toBe('Los servidores de IA de Google están saturados en este momento. Espera un minuto y vuelve a intentarlo.');

    fetchSimulado.mockReset();
    fetchSimulado.mockResolvedValueOnce(respuesta(400, { error: { message: 'bad request' } }));
    await generarJSON({ sistema: 'S', partes: [], esquema: {} }).catch(() => null);
    expect(fetchSimulado).toHaveBeenCalledTimes(1); // un error 400 no se reintenta
  });

  it('ignora las partes de razonamiento y valida que el JSON sea JSON', () => {
    expect(textoDe({ candidates: [{ content: { role: 'model', parts: [{ text: 'pensando', thought: true }, { text: 'Hola' }] } }] })).toBe('Hola');
    expect(() => leerJSON('no es json')).toThrow(ErrorIA);
  });
});
