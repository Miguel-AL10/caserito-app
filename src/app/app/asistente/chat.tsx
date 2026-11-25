'use client';

import { useState, useTransition } from 'react';
import { Aviso, Insignia } from '@/components/ui';
import type { Turno } from '@/lib/ia/asistente';
import { preguntar } from './actions';

const SUGERENCIAS = ['¿Quién me debe más?', '¿Cuánto vendí hoy?', '¿Qué tengo que reponer?', '¿Qué productos están por vencer?'];

const NOMBRE_CONSULTA: Record<string, string> = {
  deudores: 'cuaderno de fiados',
  resumen_ventas: 'ventas',
  productos_mas_vendidos: 'productos más vendidos',
  stock_bajo: 'stock bajo',
  por_vencer: 'vencimientos',
  mermas: 'mermas',
};

type Mensaje = Turno & { consultas?: string[] };

export function Chat() {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pensando, iniciar] = useTransition();

  function enviar(pregunta: string) {
    const p = pregunta.trim();
    if (!p || pensando) return;
    setError(null);
    setTexto('');
    const historial = mensajes.map(({ rol, texto }) => ({ rol, texto }));
    setMensajes((m) => [...m, { rol: 'usuario', texto: p }]);
    iniciar(async () => {
      const r = await preguntar(p, historial);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMensajes((m) => [...m, { rol: 'asistente', texto: r.respuesta, consultas: r.consultas }]);
    });
  }

  return (
    <section aria-label="Conversación con el asistente" className="space-y-4">
      <ul className="space-y-3" data-testid="chat-asistente" aria-live="polite">
        {mensajes.map((m, i) => (
          <li key={i} className={m.rol === 'usuario' ? 'flex justify-end' : 'flex justify-start'}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.rol === 'usuario' ? 'bg-marca text-white' : 'border border-linea bg-tarjeta'}`}>
              {m.rol === 'asistente' && <span className="mb-1 block"><Insignia tono="marca">IA</Insignia></span>}
              <p className="whitespace-pre-line" data-testid={m.rol === 'asistente' ? 'respuesta-asistente' : undefined}>{m.texto}</p>
              {m.consultas && m.consultas.length > 0 && (
                <p className="mt-2 text-xs text-suave" data-testid="consultas-asistente">
                  Datos consultados: {[...new Set(m.consultas)].map((c) => NOMBRE_CONSULTA[c] ?? c).join(', ')}
                </p>
              )}
            </div>
          </li>
        ))}
        {pensando && <li className="text-suave">Consultando tus datos…</li>}
      </ul>

      {error && <Aviso tipo="error">{error}</Aviso>}

      {mensajes.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {SUGERENCIAS.map((s) => (
            <button key={s} type="button" className="btn btn-secundario" onClick={() => enviar(s)} disabled={pensando}>{s}</button>
          ))}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); enviar(texto); }} className="flex gap-2">
        <input value={texto} onChange={(e) => setTexto(e.target.value)} className="campo" maxLength={300}
          aria-label="Tu pregunta" placeholder="Por ejemplo: ¿cuánto vendí esta semana?" />
        <button type="submit" className="btn btn-primario shrink-0" disabled={pensando || !texto.trim()}>Preguntar</button>
      </form>
      <p className="text-sm text-suave">
        El asistente solo puede consultar tus ventas, fiados, stock, vencimientos y mermas. No registra ni cambia nada.
      </p>
    </section>
  );
}
