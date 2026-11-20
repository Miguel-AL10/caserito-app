'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

// HU09: reconocimiento de voz del navegador (Web Speech API). En Chrome el audio lo transcribe
// el servicio de voz del navegador; Caserito solo recibe el texto. Firefox no lo soporta y Edge no es confiable: ahí se escribe el pedido.

type Alternativa = { transcript: string };
type Resultado = { isFinal: boolean; 0: Alternativa };
type Reconocedor = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<Resultado> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type ConstructorReconocedor = new () => Reconocedor;

function constructorReconocedor(): ConstructorReconocedor | undefined {
  const w = window as unknown as { SpeechRecognition?: ConstructorReconocedor; webkitSpeechRecognition?: ConstructorReconocedor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const sinSuscripcion = () => () => {};

const ERRORES: Record<string, string> = {
  'not-allowed': 'Permite el uso del micrófono en el navegador para vender por voz.',
  'service-not-allowed': 'Permite el uso del micrófono en el navegador para vender por voz.',
  'no-speech': 'No te escuché. Toca el micrófono e inténtalo otra vez.',
  'audio-capture': 'No se encontró un micrófono en este equipo.',
  network: 'El reconocimiento de voz necesita conexión a internet.',
};

function Microfono() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0014 0M12 18v3" />
    </svg>
  );
}

export function Dictado({ onDictado }: { onDictado: (texto: string) => void }) {
  // null en el servidor; true/false ya en el navegador
  const soportado = useSyncExternalStore(sinSuscripcion, () => !!constructorReconocedor(), () => null);
  const [escuchando, setEscuchando] = useState(false);
  const [parcial, setParcial] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [escrito, setEscrito] = useState('');
  const reconocedor = useRef<Reconocedor | null>(null);

  useEffect(() => () => reconocedor.current?.abort(), []);

  function escuchar() {
    if (escuchando) {
      reconocedor.current?.stop(); // termina y procesa lo que ya se dijo
      return;
    }
    const Reconocedor = constructorReconocedor();
    if (!Reconocedor) return;
    const r = new Reconocedor();
    r.lang = 'es-PE';
    r.interimResults = true;
    r.continuous = false; // CA1: al terminar de hablar se muestra la venta propuesta
    r.maxAlternatives = 1;
    let final = '';
    r.onresult = (e) => {
      let interino = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) final += `${res[0].transcript} `;
        else interino += res[0].transcript;
      }
      setParcial(`${final}${interino}`.trim());
    };
    r.onerror = (e) => {
      if (e.error !== 'aborted') setError(ERRORES[e.error] ?? 'No se pudo usar el micrófono. Puedes escribir el pedido.');
    };
    r.onend = () => {
      setEscuchando(false);
      reconocedor.current = null;
      setParcial('');
      if (final.trim()) onDictado(final.trim());
    };
    reconocedor.current = r;
    setError(null);
    setParcial('');
    setEscuchando(true);
    try {
      r.start();
    } catch {
      setEscuchando(false);
      setError('No se pudo usar el micrófono. Puedes escribir el pedido.');
    }
  }

  function enviarEscrito(e: React.FormEvent) {
    e.preventDefault();
    const t = escrito.trim();
    if (!t) return;
    onDictado(t);
    setEscrito('');
  }

  const formularioEscrito = (
    <form onSubmit={enviarEscrito} className="flex gap-2">
      <input value={escrito} onChange={(e) => setEscrito(e.target.value)} className="campo" aria-label="Escribe el pedido"
        placeholder="dos Inca Kola y un paquete de galletas" />
      <button type="submit" className="btn btn-secundario shrink-0">Interpretar</button>
    </form>
  );

  return (
    <div className="tarjeta mb-3 space-y-3" data-testid="dictado">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={escuchar} disabled={soportado === false} aria-pressed={escuchando}
          className={`btn gap-2 ${escuchando ? 'animate-pulse bg-error text-white' : 'btn-primario'}`}>
          <Microfono />
          {escuchando ? 'Escuchando… toca para terminar' : 'Vender por voz'}
        </button>
        <p className="min-w-0 flex-1 text-sm text-suave">
          Di, por ejemplo: «dos Inca Kola de medio litro y un paquete de galletas».
        </p>
      </div>
      {parcial && <p className="text-lg font-semibold" aria-live="polite" data-testid="dictado-parcial">«{parcial}»</p>}
      {error && <p role="alert" className="text-sm font-medium text-error">{error}</p>}
      {soportado === false ? (
        <div className="space-y-2">
          <p className="text-sm text-suave">Este navegador no reconoce la voz (usa Chrome o Safari). Puedes escribir el pedido:</p>
          {formularioEscrito}
        </div>
      ) : (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-marca">¿Sin micrófono? Escribe el pedido</summary>
          <div className="mt-2">{formularioEscrito}</div>
        </details>
      )}
    </div>
  );
}
