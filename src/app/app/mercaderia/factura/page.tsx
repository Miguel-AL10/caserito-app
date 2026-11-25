import Link from 'next/link';
import { Aviso, Encabezado } from '@/components/ui';
import { requireDueno } from '@/lib/contexto';
import { iaDisponible } from '@/lib/ia/gemini';
import { createClient } from '@/lib/supabase/server';
import { hoyLima } from '@/lib/validaciones';
import { FacturaCliente } from './factura-cliente';

export const metadata = { title: 'Cargar factura con foto' };
// Leer una foto con la IA puede tardar más que el límite por defecto de una función
export const maxDuration = 60;

// HU10: cargar la mercadería tomando una foto a la factura del distribuidor
export default async function CargarFactura() {
  await requireDueno();
  const supabase = await createClient();
  const { data: productos } = await supabase.from('productos').select('id, nombre, unidad').eq('activo', true).order('nombre');

  return (
    <div className="space-y-6">
      <Link href="/app/mercaderia" className="text-sm font-semibold text-marca hover:underline">← Ingresar mercadería</Link>
      <Encabezado titulo="Cargar factura con foto" descripcion="Toma una foto a la factura del distribuidor: la IA lee los productos, cantidades y costos, y tú revisas antes de guardar." />
      {!iaDisponible() ? (
        <Aviso tipo="alerta">La IA no está configurada en este entorno. Falta la variable GEMINI_API_KEY en el servidor.</Aviso>
      ) : !productos?.length ? (
        <Aviso tipo="info">Primero registra tus productos en Productos.</Aviso>
      ) : (
        <FacturaCliente productos={productos} hoy={hoyLima()} />
      )}
    </div>
  );
}
