import Link from 'next/link';
import { Encabezado } from '@/components/ui';
import { requireDueno } from '@/lib/contexto';
import { enSoles } from '@/lib/formato';
import { createClient } from '@/lib/supabase/server';
import { NuevoClienteForm } from './formularios';
import { BotonRecordar } from './recordar';

export const metadata = { title: 'Fiados' };

// HU11: cuaderno de fiados (quién debe y cuánto); HU12: recordatorio por WhatsApp
export default async function Fiados() {
  const ctx = await requireDueno();
  const supabase = await createClient();
  const { data } = await supabase
    .from('v_clientes')
    .select('id, nombre, celular, deuda')
    .order('deuda', { ascending: false })
    .order('nombre', { ascending: true });

  const clientes = (data ?? []).map((c) => ({ id: c.id as number, nombre: c.nombre as string, celular: c.celular as string | null, deuda: Number(c.deuda) }));
  const porCobrar = clientes.reduce((s, c) => s + Math.max(c.deuda, 0), 0);
  const deudores = clientes.filter((c) => c.deuda > 0).length;

  return (
    <div className="space-y-6">
      <Encabezado titulo="Cuaderno de fiados" descripcion="Quién te debe, cuánto, y un recordatorio por WhatsApp con un toque." />

      <div className="tarjeta">
        <p className="text-sm font-semibold uppercase tracking-wide text-suave">Por cobrar</p>
        <p className="text-4xl font-bold text-marca" data-testid="total-por-cobrar">{enSoles(porCobrar)}</p>
        <p className="mt-1 text-suave">{deudores} cliente{deudores === 1 ? '' : 's'} con deuda</p>
      </div>

      {clientes.length === 0 ? (
        <p className="tarjeta text-center text-suave">Aún no tienes clientes en el cuaderno. Agrega el primero abajo.</p>
      ) : (
        <ul className="space-y-2" data-testid="lista-clientes">
          {clientes.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-linea bg-tarjeta px-4 py-3">
              <Link href={`/app/fiados/${c.id}`} className="min-w-0 flex-1 hover:underline">
                <span className="block font-semibold">{c.nombre}</span>
                <span className="text-sm text-suave">{c.celular ? `Cel. ${c.celular}` : 'Sin celular'}</span>
              </Link>
              <span className={`text-lg font-bold ${c.deuda > 0 ? 'text-error' : 'text-bien'}`} data-testid="deuda-cliente">
                {c.deuda > 0 ? `Debe ${enSoles(c.deuda)}` : 'Al día'}
              </span>
              <BotonRecordar cliente={c} bodega={ctx.bodegaNombre} />
            </li>
          ))}
        </ul>
      )}

      <NuevoClienteForm />
    </div>
  );
}
