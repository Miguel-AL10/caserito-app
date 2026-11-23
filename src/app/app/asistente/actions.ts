'use server';

import { requireDueno } from '@/lib/contexto';
import { responderPregunta, validarPregunta, type RespuestaAsistente, type Turno } from '@/lib/ia/asistente';
import { iaDisponible, mensajeErrorIA } from '@/lib/ia/gemini';
import { createClient } from '@/lib/supabase/server';
import { hoyLima } from '@/lib/validaciones';

export type ResultadoPregunta = ({ ok: true } & RespuestaAsistente) | { ok: false; error: string };

// HU16: solo el dueño; las consultas corren con su sesión, así la RLS limita todo a su bodega (CA2)
export async function preguntar(pregunta: string, historial: Turno[]): Promise<ResultadoPregunta> {
  const ctx = await requireDueno();
  if (!iaDisponible()) return { ok: false, error: 'La IA no está configurada en este entorno.' };
  const v = validarPregunta(pregunta, historial);
  if (!v) return { ok: false, error: 'Escribe una pregunta de hasta 300 caracteres.' };
  try {
    const supabase = await createClient();
    const r = await responderPregunta(supabase, v.pregunta, v.historial, { bodega: ctx.bodegaNombre, hoy: hoyLima(), diasAviso: ctx.diasAviso });
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: mensajeErrorIA(e) };
  }
}
