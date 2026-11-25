import { Aviso, Encabezado } from '@/components/ui';
import { requireDueno } from '@/lib/contexto';
import { iaDisponible } from '@/lib/ia/gemini';
import { Chat } from './chat';

export const metadata = { title: 'Asistente' };
// Una pregunta puede necesitar varias idas y vueltas con la IA
export const maxDuration = 60;

// HU16: preguntas en lenguaje natural sobre ventas, deudas, stock, vencimientos y mermas
export default async function Asistente() {
  await requireDueno();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Encabezado titulo="Asistente" descripcion="Pregúntale a tu bodega en tus palabras. Responde con tus datos, sin que tengas que revisar reportes." />
      {iaDisponible() ? (
        <Chat />
      ) : (
        <Aviso tipo="alerta">La IA no está configurada en este entorno. Falta la variable GEMINI_API_KEY en el servidor.</Aviso>
      )}
    </div>
  );
}
