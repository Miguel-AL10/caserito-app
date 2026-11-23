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
    expect(cuerpo.generationConfig).toEqual({ responseMimeType: 'application/json', responseJsonSchema: { type: 'object' } });
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
    fetchSimulado.mockResolvedValueOnce(respuesta(429, { error: { message: 'quota' } }));
    const e1 = await generarJSON({ sistema: 'S', partes: [], esquema: {} }).catch((e) => e);
    expect(e1).toBeInstanceOf(ErrorIA);
    expect(mensajeErrorIA(e1)).toContain('Espera un minuto');

    fetchSimulado.mockResolvedValueOnce(respuesta(404, { error: { message: 'models/modelo-prueba is not found' } }));
    const e2 = await generarJSON({ sistema: 'S', partes: [], esquema: {} }).catch((e) => e);
    expect(mensajeErrorIA(e2)).toContain('404');
    expect(mensajeErrorIA(e2)).not.toContain('clave-x');

    fetchSimulado.mockRejectedValueOnce(new Error('timeout'));
    expect(mensajeErrorIA(await generarJSON({ sistema: 'S', partes: [], esquema: {} }).catch((e) => e))).toContain('No hubo respuesta');

    vi.stubEnv('GEMINI_API_KEY', '');
    const e4 = await generarJSON({ sistema: 'S', partes: [], esquema: {} }).catch((e) => e);
    expect(mensajeErrorIA(e4)).toBe('La IA no está configurada en este entorno.');
  });

  it('ignora las partes de razonamiento y valida que el JSON sea JSON', () => {
    expect(textoDe({ candidates: [{ content: { role: 'model', parts: [{ text: 'pensando', thought: true }, { text: 'Hola' }] } }] })).toBe('Hola');
    expect(() => leerJSON('no es json')).toThrow(ErrorIA);
  });
});
