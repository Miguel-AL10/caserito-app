-- =====================================================================
-- Caserito · Sprint 3 · HU11 y HU12 (RF06)
-- HU11 CA1: una venta al fiado aumenta la deuda del cliente en el total de la venta
-- HU11 CA2: un pago disminuye la deuda y queda en el historial del cliente
-- HU12: el celular del cliente permite enviarle el recordatorio por WhatsApp
-- =====================================================================

create table public.clientes (
  id          bigint generated always as identity primary key,
  bodega_id   uuid not null default public.mi_bodega() references public.bodegas (id) on delete cascade,
  nombre      text not null check (char_length(btrim(nombre)) between 2 and 100),
  celular     text check (celular ~ '^9[0-9]{8}$'),
  created_at  timestamptz not null default now(),
  unique (id, bodega_id)
);
create unique index clientes_nombre_unico on public.clientes (bodega_id, lower(btrim(nombre)));
comment on table public.clientes is 'Clientes del cuaderno de fiados (HU11). El celular es opcional (HU12).';

-- Las ventas al fiado llevan el cliente que queda debiendo
alter table public.ventas drop constraint ventas_metodo_pago_check;
alter table public.ventas
  add constraint ventas_metodo_pago_check check (metodo_pago in ('efectivo', 'yape', 'plin', 'tarjeta', 'otro', 'fiado'));
alter table public.ventas add column cliente_id bigint;
alter table public.ventas
  add constraint ventas_cliente_fk foreign key (cliente_id, bodega_id) references public.clientes (id, bodega_id);
alter table public.ventas
  add constraint ventas_fiado_con_cliente check ((metodo_pago = 'fiado') = (cliente_id is not null));
create index ventas_cliente_idx on public.ventas (cliente_id) where cliente_id is not null;

create table public.pagos_fiado (
  id           bigint generated always as identity primary key,
  bodega_id    uuid not null references public.bodegas (id) on delete cascade,
  cliente_id   bigint not null,
  monto        numeric(12, 2) not null check (monto > 0),
  metodo_pago  text not null default 'efectivo' check (metodo_pago in ('efectivo', 'yape', 'plin', 'tarjeta', 'otro')),
  usuario_id   uuid not null references public.perfiles (id),
  created_at   timestamptz not null default now(),
  foreign key (cliente_id, bodega_id) references public.clientes (id, bodega_id)
);
create index pagos_fiado_cliente_idx on public.pagos_fiado (cliente_id, created_at desc);
comment on table public.pagos_fiado is 'Pagos de deudas de fiado (HU11 CA2).';

-- Deuda de un cliente: ventas al fiado menos pagos
create or replace function public.deuda_cliente(p_cliente_id bigint)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select sum(total) from public.ventas where cliente_id = p_cliente_id and metodo_pago = 'fiado'), 0)
       - coalesce((select sum(monto) from public.pagos_fiado where cliente_id = p_cliente_id), 0)
$$;

-- Vista del cuaderno: solo el dueño ve a sus clientes y lo que deben
-- (deuda_cliente no se expone: con un id ajeno revelaría la deuda de otra bodega)
create view public.v_clientes as
select c.id,
       c.bodega_id,
       c.nombre,
       c.celular,
       c.created_at,
       -- se calcula aquí (no con deuda_cliente) porque esa función es interna de las RPC
       coalesce((select sum(v.total) from public.ventas v where v.cliente_id = c.id and v.metodo_pago = 'fiado'), 0)
     - coalesce((select sum(p.monto) from public.pagos_fiado p where p.cliente_id = c.id), 0) as deuda,
       greatest(
         (select max(v.created_at) from public.ventas v where v.cliente_id = c.id),
         (select max(p.created_at) from public.pagos_fiado p where p.cliente_id = c.id)
       ) as ultimo_movimiento
from public.clientes c
where c.bodega_id = public.mi_bodega() and public.es_dueno();

-- ---------------------------------------------------------------------
-- Seguridad
-- ---------------------------------------------------------------------
alter table public.clientes    enable row level security;
alter table public.pagos_fiado enable row level security;

create policy "dueno ve clientes" on public.clientes
  for select to authenticated
  using (bodega_id = (select public.mi_bodega()) and (select public.es_dueno()));
create policy "dueno registra clientes" on public.clientes
  for insert to authenticated
  with check (bodega_id = (select public.mi_bodega()) and (select public.es_dueno()));
create policy "dueno edita clientes" on public.clientes
  for update to authenticated
  using (bodega_id = (select public.mi_bodega()) and (select public.es_dueno()))
  with check (bodega_id = (select public.mi_bodega()));

-- Los pagos solo se leen; se escriben con registrar_pago_fiado()
create policy "dueno ve pagos de fiado" on public.pagos_fiado
  for select to authenticated
  using (bodega_id = (select public.mi_bodega()) and (select public.es_dueno()));

revoke all on public.clientes, public.pagos_fiado, public.v_clientes from anon;
revoke insert, update, delete on public.pagos_fiado from authenticated;
revoke all on public.v_clientes from authenticated;
grant select on public.v_clientes to authenticated;
revoke execute on function public.deuda_cliente(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- HU11 CA2: registrar el pago de una deuda
-- ---------------------------------------------------------------------
create or replace function public.registrar_pago_fiado(p_cliente_id bigint, p_monto numeric, p_metodo_pago text default 'efectivo')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bodega  uuid;
  v_deuda   numeric(12, 2);
  v_pago    bigint;
begin
  v_bodega := public.mi_bodega();
  if v_bodega is null or not public.es_dueno() then
    raise exception 'Solo el dueño puede registrar pagos de fiado' using errcode = '42501', hint = 'NO_AUTORIZADO';
  end if;

  perform 1 from public.clientes where id = p_cliente_id and bodega_id = v_bodega for update;
  if not found then
    raise exception 'El cliente no existe' using errcode = '22023', hint = 'CLIENTE_NO_EXISTE';
  end if;

  if p_monto is null or p_monto <= 0 or p_monto <> round(p_monto, 2) then
    raise exception 'El monto debe ser mayor a cero y tener como máximo dos decimales' using errcode = '22023', hint = 'PAGO_INVALIDO';
  end if;

  v_deuda := public.deuda_cliente(p_cliente_id);
  if p_monto > v_deuda then
    raise exception 'El pago no puede ser mayor que la deuda (S/ %)', to_char(v_deuda, 'FM999999990.00')
      using errcode = '22023', hint = 'PAGO_MAYOR_A_DEUDA';
  end if;

  insert into public.pagos_fiado (bodega_id, cliente_id, monto, metodo_pago, usuario_id)
  values (v_bodega, p_cliente_id, p_monto, coalesce(p_metodo_pago, 'efectivo'), auth.uid())
  returning id into v_pago;

  return jsonb_build_object('pago_id', v_pago, 'deuda', v_deuda - p_monto);
end $$;

revoke execute on function public.registrar_pago_fiado(bigint, numeric, text) from public, anon;
grant execute on function public.registrar_pago_fiado(bigint, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- HU07 + HU11 CA1: registrar_venta acepta ventas al fiado (solo el dueño).
-- Mismo cuerpo que la versión con redondeo; se agrega p_cliente_id.
-- ---------------------------------------------------------------------
drop function public.registrar_venta(jsonb, text);

create or replace function public.registrar_venta(p_items jsonb, p_metodo_pago text default 'efectivo', p_cliente_id bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bodega    uuid;
  v_venta     bigint;
  v_detalle   bigint;
  v_metodo    text := coalesce(p_metodo_pago, 'efectivo');
  v_cliente   bigint;
  v_total     numeric(12, 2) := 0;
  v_cobrado   numeric(12, 2);
  v_subtotal  numeric(12, 2);
  v_item      record;
  v_prod      record;
  v_lote      record;
  v_disp      numeric;
  v_restante  numeric;
  v_toma      numeric;
begin
  v_bodega := public.mi_bodega();
  if v_bodega is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos' using errcode = '22023', hint = 'VENTA_VACIA';
  end if;

  -- HU11: el fiado lo registra el dueño y siempre a nombre de un cliente de su bodega
  if v_metodo = 'fiado' then
    if not public.es_dueno() then
      raise exception 'Solo el dueño puede vender al fiado' using errcode = '42501', hint = 'NO_AUTORIZADO';
    end if;
    if p_cliente_id is null then
      raise exception 'Elige el cliente que se lleva al fiado' using errcode = '22023', hint = 'CLIENTE_REQUERIDO';
    end if;
    select id into v_cliente from public.clientes where id = p_cliente_id and bodega_id = v_bodega;
    if not found then
      raise exception 'El cliente no existe' using errcode = '22023', hint = 'CLIENTE_NO_EXISTE';
    end if;
  end if;

  insert into public.ventas (bodega_id, usuario_id, total, total_cobrado, metodo_pago, cliente_id)
  values (v_bodega, auth.uid(), 0, 0, v_metodo, v_cliente)
  returning id into v_venta;

  for v_item in
    select (e ->> 'producto_id')::bigint as producto_id,
           sum((e ->> 'cantidad')::numeric) as cantidad
    from jsonb_array_elements(p_items) as e
    group by 1
    order by 1
  loop
    if v_item.cantidad is null or v_item.cantidad <= 0 then
      raise exception 'La cantidad debe ser mayor a cero' using errcode = '22023', hint = 'CANTIDAD_INVALIDA';
    end if;

    select id, nombre, unidad, precio_venta into v_prod
    from public.productos
    where id = v_item.producto_id and bodega_id = v_bodega and activo;

    if not found then
      raise exception 'Producto no encontrado' using errcode = '22023', hint = 'PRODUCTO_NO_EXISTE';
    end if;

    if not public.unidad_fraccionable(v_prod.unidad) and v_item.cantidad <> trunc(v_item.cantidad) then
      raise exception 'La cantidad de "%" debe ser un número entero', v_prod.nombre
        using errcode = '22023', hint = 'CANTIDAD_NO_ENTERA';
    end if;

    perform 1 from public.lotes
    where producto_id = v_prod.id and bodega_id = v_bodega
      and cantidad_actual > 0 and fecha_vencimiento >= public.hoy()
    for update;

    select coalesce(sum(cantidad_actual), 0) into v_disp
    from public.lotes
    where producto_id = v_prod.id and bodega_id = v_bodega
      and cantidad_actual > 0 and fecha_vencimiento >= public.hoy();

    if v_disp < v_item.cantidad then
      raise exception 'Stock insuficiente para "%": disponible %', v_prod.nombre, trim_scale(v_disp)
        using errcode = 'P0001', hint = 'STOCK_INSUFICIENTE';
    end if;

    v_subtotal := round(v_item.cantidad * v_prod.precio_venta, 2);

    insert into public.venta_detalle (venta_id, bodega_id, producto_id, cantidad, precio_unitario, subtotal)
    values (v_venta, v_bodega, v_prod.id, v_item.cantidad, v_prod.precio_venta, v_subtotal)
    returning id into v_detalle;

    v_restante := v_item.cantidad;
    for v_lote in
      select id, cantidad_actual
      from public.lotes
      where producto_id = v_prod.id and bodega_id = v_bodega
        and cantidad_actual > 0 and fecha_vencimiento >= public.hoy()
      order by fecha_vencimiento, id
    loop
      exit when v_restante <= 0;
      v_toma := least(v_lote.cantidad_actual, v_restante);
      update public.lotes set cantidad_actual = cantidad_actual - v_toma where id = v_lote.id;
      insert into public.venta_detalle_lotes (detalle_id, lote_id, bodega_id, cantidad)
      values (v_detalle, v_lote.id, v_bodega, v_toma);
      v_restante := v_restante - v_toma;
    end loop;

    v_total := v_total + v_subtotal;
  end loop;

  -- Redondeo a favor del cliente solo en efectivo (art. 44, Ley 29571); el fiado se anota exacto
  v_cobrado := case when v_metodo = 'efectivo' then public.redondeo_efectivo(v_total) else v_total end;
  update public.ventas set total = v_total, total_cobrado = v_cobrado where id = v_venta;

  return jsonb_build_object(
    'venta_id', v_venta,
    'total', v_total,
    'total_cobrado', v_cobrado,
    'redondeo', v_total - v_cobrado,
    'deuda', case when v_metodo = 'fiado' then public.deuda_cliente(v_cliente) end
  );
end $$;

revoke execute on function public.registrar_venta(jsonb, text, bigint) from public, anon;
grant execute on function public.registrar_venta(jsonb, text, bigint) to authenticated;
