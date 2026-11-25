import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Encabezado, Insignia } from '@/components/ui';
import { requireDueno } from '@/lib/contexto';
import { cantidad, enSoles, fecha, NOMBRE_METODO } from '@/lib/formato';
import { createClient } from '@/lib/supabase/server';
import { CelularForm, PagoForm } from '../formularios';
import { BotonRecordar } from '../recordar';

export const metadata = { title: 'Cliente' };

type Movimiento = { clave: string; tipo: 'fiado' | 'pago'; monto: number; creado: string; detalle: string };

const horaLima = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false });
const diaLima = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' });

// HU11 CA2: deuda del cliente, pagos e historial de movimientos
export default async function Cliente({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireDueno();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const supabase = await createClient();
  const { data: c } = await supabase.from('v_clientes').select('id, nombre, celular, deuda').eq('id', id).maybeSingle();
  if (!c) notFound();
  const cliente = { id: c.id as number, nombre: c.nombre as string, celular: c.celular as string | null, deuda: Number(c.deuda) };

  const [{ data: ventas }, { data: pagos }] = await Promise.all([
    supabase
      .from('ventas')
      .select('id, total, created_at, venta_detalle ( cantidad, productos ( nombre ) )')
      .eq('cliente_id', id)
      .eq('metodo_pago', 'fiado'),
    supabase.from('pagos_fiado').select('id, monto, metodo_pago, created_at').eq('cliente_id', id),
  ]);

  type DetalleFila = { cantidad: number; productos: { nombre: string } | null };
  const movimientos: Movimiento[] = [
    ...(ventas ?? []).map((v) => ({
      clave: `v${v.id}`,
      tipo: 'fiado' as const,
      monto: Number(v.total),
      creado: v.created_at as string,
      detalle: ((v.venta_detalle ?? []) as unknown as DetalleFila[]).map((d) => `${cantidad(d.cantidad)} × ${d.productos?.nombre ?? '—'}`).join(' · '),
    })),
    ...(pagos ?? []).map((p) => ({
      clave: `p${p.id}`,
      tipo: 'pago' as const,
      monto: Number(p.monto),
      creado: p.created_at as string,
      detalle: `Pagó con ${NOMBRE_METODO[p.metodo_pago as string] ?? p.metodo_pago}`,
    })),
  ].sort((a, b) => b.creado.localeCompare(a.creado));

  return (
    <div className="space-y-6">
      <Link href="/app/fiados" className="text-sm font-semibold text-marca hover:underline">← Cuaderno de fiados</Link>
      <Encabezado titulo={cliente.nombre} descripcion={cliente.celular ? `Celular ${cliente.celular}` : 'Sin celular registrado'} />

      <div className="tarjeta flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-suave">Deuda actual</p>
          <p className={`text-4xl font-bold ${cliente.deuda > 0 ? 'text-error' : 'text-bien'}`} data-testid="deuda-actual">{enSoles(cliente.deuda)}</p>
        </div>
        <BotonRecordar cliente={cliente} bodega={ctx.bodegaNombre} />
      </div>

      {cliente.deuda > 0 && <PagoForm clienteId={cliente.id} />}

      <section aria-labelledby="titulo-historial" className="space-y-3">
        <h2 id="titulo-historial" className="text-lg font-bold">Historial</h2>
        {movimientos.length === 0 ? (
          <p className="tarjeta text-center text-suave">Todavía no hay movimientos.</p>
        ) : (
          <ul className="space-y-2" data-testid="historial-cliente">
            {movimientos.map((m) => (
              <li key={m.clave} className="flex items-start justify-between gap-3 rounded-2xl border border-linea bg-tarjeta px-4 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2">
                    <Insignia tono={m.tipo === 'fiado' ? 'alerta' : 'bien'}>{m.tipo === 'fiado' ? 'Fiado' : 'Pago'}</Insignia>
                    <span className="text-sm text-suave">{fecha(diaLima.format(new Date(m.creado)))} · {horaLima.format(new Date(m.creado))}</span>
                  </p>
                  <p className="mt-1 text-sm">{m.detalle}</p>
                </div>
                <span className={`shrink-0 text-lg font-bold ${m.tipo === 'fiado' ? 'text-error' : 'text-bien'}`}>
                  {m.tipo === 'fiado' ? '+' : '−'}{enSoles(m.monto)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="tarjeta">
        <CelularForm clienteId={cliente.id} celular={cliente.celular} />
      </div>
    </div>
  );
}
