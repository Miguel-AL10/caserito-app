// RF06 · HU11 y HU12 — Cuaderno de fiados y recordatorio por WhatsApp (Sprint 3)
import { describe, expect, it } from 'vitest';
import { admin, crearAyudanteDe, crearDueno, crearProducto, ingresarLote, stockDe, type Usuario } from './helpers';

async function crearCliente(d: Usuario, nombre: string, celular: string | null = null): Promise<number> {
  const { data, error } = await d.client.from('clientes').insert({ nombre, celular }).select('id').single();
  if (error) throw error;
  return data.id;
}

async function deuda(d: Usuario, clienteId: number): Promise<number> {
  const { data, error } = await d.client.from('v_clientes').select('deuda').eq('id', clienteId).single();
  if (error) throw error;
  return Number(data.deuda);
}

describe('HU11 · Cuaderno de fiados', () => {
  it('CP24 Registro de venta al fiado', async () => {
    const d = await crearDueno();
    const a = await crearAyudanteDe(d);
    const otro = await crearDueno();
    const prod = await crearProducto(d.client, { precio_venta: 2.81 });
    await ingresarLote(d.client, prod, 10, 30);
    const carmen = await crearCliente(d, 'Carmen Rojas', '987654321');
    const ajeno = await crearCliente(otro, 'Cliente de otra bodega');

    // Venta al fiado de 5 × 2.81 = 14.05: la deuda sube en el total exacto (sin redondeo de efectivo)
    const { data, error } = await d.client.rpc('registrar_venta', {
      p_items: [{ producto_id: prod, cantidad: 5 }],
      p_metodo_pago: 'fiado',
      p_cliente_id: carmen,
    });
    expect(error).toBeNull();
    expect(Number(data.total)).toBe(14.05);
    expect(Number(data.total_cobrado)).toBe(14.05);
    expect(Number(data.deuda)).toBe(14.05);
    expect(await deuda(d, carmen)).toBe(14.05);
    expect(await stockDe(d.client, prod)).toBe(5); // el stock se descuenta igual que en una venta normal

    // Una segunda venta al fiado se suma a la deuda
    await d.client.rpc('registrar_venta', { p_items: [{ producto_id: prod, cantidad: 1 }], p_metodo_pago: 'fiado', p_cliente_id: carmen });
    expect(await deuda(d, carmen)).toBe(16.86);

    // Sin cliente, con un cliente de otra bodega o desde la cuenta del ayudante, no se registra
    const sinCliente = await d.client.rpc('registrar_venta', { p_items: [{ producto_id: prod, cantidad: 1 }], p_metodo_pago: 'fiado' });
    expect(sinCliente.error?.hint).toBe('CLIENTE_REQUERIDO');
    const deOtra = await d.client.rpc('registrar_venta', { p_items: [{ producto_id: prod, cantidad: 1 }], p_metodo_pago: 'fiado', p_cliente_id: ajeno });
    expect(deOtra.error?.hint).toBe('CLIENTE_NO_EXISTE');
    const delAyudante = await a.client.rpc('registrar_venta', { p_items: [{ producto_id: prod, cantidad: 1 }], p_metodo_pago: 'fiado', p_cliente_id: carmen });
    expect(delAyudante.error?.code).toBe('42501');
    expect(await stockDe(d.client, prod)).toBe(4); // los intentos fallidos no tocaron el stock

    // Las ventas normales siguen igual (sin cliente) y el ayudante no ve el cuaderno
    const normal = await a.client.rpc('registrar_venta', { p_items: [{ producto_id: prod, cantidad: 1 }], p_metodo_pago: 'yape' });
    expect(normal.error).toBeNull();
    expect((await a.client.from('v_clientes').select('id')).data ?? []).toHaveLength(0);
    expect((await a.client.from('clientes').select('id')).data ?? []).toHaveLength(0);
  });

  it('CP25 Registro de pago de deuda', async () => {
    const d = await crearDueno();
    const a = await crearAyudanteDe(d);
    const prod = await crearProducto(d.client, { precio_venta: 5 });
    await ingresarLote(d.client, prod, 10, 30);
    const pedro = await crearCliente(d, 'Pedro Huamán');
    await d.client.rpc('registrar_venta', { p_items: [{ producto_id: prod, cantidad: 4 }], p_metodo_pago: 'fiado', p_cliente_id: pedro });
    expect(await deuda(d, pedro)).toBe(20);

    // Pago parcial: la deuda baja y el pago queda en el historial
    const { data, error } = await d.client.rpc('registrar_pago_fiado', { p_cliente_id: pedro, p_monto: 7.5, p_metodo_pago: 'yape' });
    expect(error).toBeNull();
    expect(Number(data.deuda)).toBe(12.5);
    expect(await deuda(d, pedro)).toBe(12.5);
    const { data: pagos } = await d.client.from('pagos_fiado').select('monto, metodo_pago').eq('cliente_id', pedro);
    expect(pagos).toEqual([{ monto: 7.5, metodo_pago: 'yape' }]);
    const { data: fiados } = await d.client.from('ventas').select('total').eq('cliente_id', pedro);
    expect(fiados).toEqual([{ total: 20 }]);

    // No se puede pagar más de lo que debe, ni montos inválidos, ni desde la cuenta del ayudante
    const demas = await d.client.rpc('registrar_pago_fiado', { p_cliente_id: pedro, p_monto: 12.51 });
    expect(demas.error?.hint).toBe('PAGO_MAYOR_A_DEUDA');
    const cero = await d.client.rpc('registrar_pago_fiado', { p_cliente_id: pedro, p_monto: 0 });
    expect(cero.error?.hint).toBe('PAGO_INVALIDO');
    const delAyudante = await a.client.rpc('registrar_pago_fiado', { p_cliente_id: pedro, p_monto: 1 });
    expect(delAyudante.error?.code).toBe('42501');
    // Tampoco se puede insertar un pago directo en la tabla
    const directo = await d.client.from('pagos_fiado').insert({ bodega_id: d.bodegaId, cliente_id: pedro, monto: 1, usuario_id: d.userId });
    expect(directo.error).not.toBeNull();

    // Paga el resto y queda al día
    await d.client.rpc('registrar_pago_fiado', { p_cliente_id: pedro, p_monto: 12.5 });
    expect(await deuda(d, pedro)).toBe(0);
  });
});

describe('HU12 · Celular para el recordatorio', () => {
  it('CP26, CP27 El celular es opcional y, si se registra, debe ser válido', async () => {
    const d = await crearDueno();
    const conCel = await crearCliente(d, 'Carmen Rojas', '987654321');
    const sinCel = await crearCliente(d, 'Pedro Huamán');
    const { data } = await d.client.from('v_clientes').select('id, celular').order('id');
    expect(data).toEqual([{ id: conCel, celular: '987654321' }, { id: sinCel, celular: null }]);

    const invalido = await d.client.from('clientes').insert({ nombre: 'Luis', celular: '12345' });
    expect(invalido.error?.code).toBe('23514');
    const duplicado = await d.client.from('clientes').insert({ nombre: ' carmen rojas ' });
    expect(duplicado.error?.code).toBe('23505');

    // Se le puede registrar el celular después
    const { error } = await d.client.from('clientes').update({ celular: '912345678' }).eq('id', sinCel);
    expect(error).toBeNull();
    const { data: ahora } = await admin.from('clientes').select('celular').eq('id', sinCel).single();
    expect(ahora!.celular).toBe('912345678');
  });
});
