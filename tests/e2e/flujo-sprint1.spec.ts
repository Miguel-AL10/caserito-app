// Prueba de punta a punta del Sprint 1 (RF01, RF02 y RF03) en el navegador.
// Además guarda capturas en docs/capturas para el informe.
import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });

const id = randomUUID().slice(0, 6);
const DUENO = { nombre: 'Rosa Quispe', email: `rosa_${id}@prueba.pe`, password: 'Bodega_Rosa_2026' };
const AYUDANTE = { nombre: 'Luis Huamán', email: `luis_${id}@prueba.pe`, password: 'Ayudante_2026' };
const BODEGA = `Bodega Doña Rosa ${id}`;

function enDias(n: number): string {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
  const [y, m, d] = hoy.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const aviso = (page: Page) => page.locator('[role=alert]:not(#__next-route-announcer__)');
const captura = (page: Page, nombre: string) => page.screenshot({ path: `docs/capturas/${nombre}.png` });

async function ingresar(page: Page, email: string, password: string, esperarPanel = true) {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  if (esperarPanel) await expect(page).toHaveURL(/\/app$/);
}

async function salir(page: Page) {
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test.describe.serial('Sprint 1 · flujo completo', () => {
  test('CP05 Una página interna sin sesión redirige al inicio de sesión', async ({ page }) => {
    await page.goto('/app/vender');
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fvender/);
    await captura(page, '01-inicio-sesion');
  });

  test('CP01 Registro de bodega y dueño', async ({ page }) => {
    await page.goto('/registro');
    await page.getByLabel('Nombre de la bodega').fill(BODEGA);
    await page.getByLabel('Dirección').fill('Av. Los Próceres 123, San Juan de Lurigancho');
    await page.getByLabel('Tu nombre').fill(DUENO.nombre);
    await page.getByLabel('Correo').fill(DUENO.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(DUENO.password);
    await page.getByLabel('Repite la contraseña').fill(DUENO.password);
    await captura(page, '02-registro');
    await page.getByRole('button', { name: 'Crear mi bodega' }).click();

    await expect(page).toHaveURL(/\/app\?bienvenida=1/);
    await expect(page.getByTestId('bodega-nombre')).toHaveText(BODEGA);
    await expect(page.getByTestId('usuario-rol')).toHaveText('Dueño');
    await captura(page, '03-panel-dueno');
  });

  test('CP02 Registro con correo duplicado', async ({ page }) => {
    await page.goto('/registro');
    await page.getByLabel('Nombre de la bodega').fill('Otra bodega');
    await page.getByLabel('Dirección').fill('Calle 1');
    await page.getByLabel('Tu nombre').fill('Otra persona');
    await page.getByLabel('Correo').fill(DUENO.email);
    await page.getByLabel('Contraseña', { exact: true }).fill('OtraClave_123');
    await page.getByLabel('Repite la contraseña').fill('OtraClave_123');
    await page.getByRole('button', { name: 'Crear mi bodega' }).click();
    await expect(aviso(page)).toHaveText('El correo ya está registrado');
    // Los datos escritos no se pierden
    await expect(page.getByLabel('Nombre de la bodega')).toHaveValue('Otra bodega');
  });

  test('CP04 Inicio de sesión con credenciales inválidas', async ({ page }) => {
    await ingresar(page, DUENO.email, 'clave_equivocada', false);
    await expect(aviso(page)).toHaveText('Correo o contraseña incorrectos');
    await captura(page, '04-login-invalido');
  });

  test('CP03, CP09, CP10 Inicio de sesión y catálogo de productos', async ({ page }) => {
    await ingresar(page, DUENO.email, DUENO.password);
    await expect(page).toHaveURL(/\/app$/);

    const productos = [
      { nombre: 'Inca Kola 500 ml', categoria: 'Bebidas', unidad: 'botella', precio: '3.50' },
      { nombre: 'Galletas Soda Field', categoria: 'Snacks y golosinas', unidad: 'paquete', precio: '1,20' },
      { nombre: 'Yogurt Gloria fresa 1 L', categoria: 'Lácteos', unidad: 'botella', precio: '6.90' },
      { nombre: 'Arroz Costeño a granel', categoria: 'Abarrotes', unidad: 'kg', precio: '4.20' },
    ];
    for (const p of productos) {
      await page.goto('/app/productos/nuevo');
      await page.getByLabel('Nombre del producto').fill(p.nombre);
      await page.getByLabel('Categoría').selectOption({ label: p.categoria });
      await page.getByLabel('Se vende por').selectOption(p.unidad);
      await page.getByLabel('Precio de venta (S/)').fill(p.precio);
      await page.getByRole('button', { name: 'Guardar producto' }).click();
      await expect(page.getByText('Producto registrado.')).toBeVisible();
    }
    await expect(page.getByTestId('lista-productos').getByRole('listitem')).toHaveCount(4);
    await captura(page, '05-productos');

    // CP10: nombre duplicado y precio inválido
    await page.goto('/app/productos/nuevo');
    await page.getByLabel('Nombre del producto').fill('inca kola 500 ML');
    await page.getByLabel('Categoría').selectOption({ label: 'Bebidas' });
    await page.getByLabel('Precio de venta (S/)').fill('0');
    await page.getByRole('button', { name: 'Guardar producto' }).click();
    await expect(page.getByText('El precio debe ser mayor a cero.')).toBeVisible();
    await page.getByLabel('Precio de venta (S/)').fill('3.50');
    await page.getByRole('button', { name: 'Guardar producto' }).click();
    await expect(aviso(page)).toHaveText('Ya existe un producto con ese nombre en tu bodega.');
    await captura(page, '06-producto-duplicado');
  });

  test('CP11, CP12 Ingreso de mercadería por lotes', async ({ page }) => {
    await ingresar(page, DUENO.email, DUENO.password);
    await page.goto('/app/mercaderia');

    const lotes = [
      { producto: 'Inca Kola 500 ml', unidad: 'botella', cantidad: '24', costo: '2.10', vence: 60 },
      { producto: 'Inca Kola 500 ml', unidad: 'botella', cantidad: '6', costo: '2.00', vence: 4 },
      { producto: 'Galletas Soda Field', unidad: 'paquete', cantidad: '30', costo: '0.80', vence: 90 },
      { producto: 'Yogurt Gloria fresa 1 L', unidad: 'botella', cantidad: '6', costo: '5.40', vence: 3 },
      { producto: 'Arroz Costeño a granel', unidad: 'kg', cantidad: '25,5', costo: '3.30', vence: 200 },
    ];
    for (const [i, l] of lotes.entries()) {
      await page.getByLabel('Producto').selectOption({ label: `${l.producto} (por ${l.unidad})` });
      await page.getByLabel(/^Cantidad/).fill(l.cantidad);
      await page.getByLabel('Costo por unidad (S/)').fill(l.costo);
      await page.getByLabel('Fecha de vencimiento').fill(enDias(l.vence));
      await page.getByRole('button', { name: 'Agregar al inventario' }).click();
      await expect(page.getByTestId('ultimos-lotes').getByRole('listitem')).toHaveCount(i + 1);
      await expect(page.getByRole('status')).toContainText(`de "${l.producto}" al inventario`);
    }

    // CP12: fecha anterior a hoy
    await page.getByLabel('Producto').selectOption({ index: 1 });
    await page.getByLabel(/^Cantidad/).fill('5');
    await page.getByLabel('Costo por unidad (S/)').fill('1');
    await page.getByLabel('Fecha de vencimiento').fill(enDias(-1));
    await page.getByRole('button', { name: 'Agregar al inventario' }).click();
    await expect(page.getByText('La fecha de vencimiento no puede ser anterior a hoy.')).toBeVisible();
    await expect(page.getByTestId('ultimos-lotes').getByRole('listitem')).toHaveCount(5);
    await captura(page, '07-mercaderia');
  });

  test('CP13 Consulta de stock con detalle de lotes', async ({ page }) => {
    await ingresar(page, DUENO.email, DUENO.password);
    await page.goto('/app/stock');
    const inca = page.getByRole('listitem').filter({ hasText: 'Inca Kola 500 ml' });
    await expect(inca.getByTestId('stock-total')).toHaveText('30');
    await inca.getByRole('button').click();
    const filas = inca.getByTestId('tabla-lotes').locator('tbody tr');
    await expect(filas).toHaveCount(2);
    await expect(filas.nth(0)).toContainText('6');   // vence en 4 días: primero
    await expect(filas.nth(0)).toContainText('en 4 días');
    await expect(filas.nth(1)).toContainText('24');
    await captura(page, '08-stock-lotes');
  });

  test('CP14, CP15 Venta con descuento FEFO', async ({ page }) => {
    await ingresar(page, DUENO.email, DUENO.password);
    await page.goto('/app/vender');
    const agregar = (n: string) => page.getByRole('button', { name: `Agregar ${n}`, exact: true }).click();
    await agregar('Inca Kola 500 ml');
    await agregar('Inca Kola 500 ml');
    await agregar('Galletas Soda Field');
    await agregar('Arroz Costeño a granel');
    await page.getByLabel('Cantidad de Arroz Costeño a granel').fill('1,5');
    await page.getByLabel('Método de pago').selectOption('yape');
    // 2 × 3,50 + 1 × 1,20 + 1,5 × 4,20 = 14,50
    await expect(page.getByTestId('venta-total')).toHaveText(/14\.50/);
    await captura(page, '09-venta-carrito');
    await page.getByRole('button', { name: 'Confirmar venta' }).click();
    await expect(page.getByTestId('venta-ok')).toContainText('Cobrado S/');
    await expect(page.getByTestId('venta-ok')).toContainText('14.50');
    await captura(page, '10-venta-registrada');

    // FEFO: las 2 Inca Kola salieron del lote que vence en 4 días (6 → 4); el de 60 días sigue en 24
    await page.goto('/app/stock');
    const inca = page.getByRole('listitem').filter({ hasText: 'Inca Kola 500 ml' });
    await expect(inca.getByTestId('stock-total')).toHaveText('28');
    await inca.getByRole('button').click();
    const filas = inca.getByTestId('tabla-lotes').locator('tbody tr');
    await expect(filas.nth(0)).toContainText('4 de 6');
    await expect(filas.nth(1)).toContainText('24 de 24');
    const arroz = page.getByRole('listitem').filter({ hasText: 'Arroz Costeño a granel' });
    await expect(arroz.getByTestId('stock-total')).toHaveText('24');
  });

  test('CP14c Redondeo a favor del cliente en efectivo', async ({ page }) => {
    await ingresar(page, DUENO.email, DUENO.password);
    await page.goto('/app/vender');
    await page.getByRole('button', { name: 'Agregar Arroz Costeño a granel', exact: true }).click();
    await page.getByLabel('Cantidad de Arroz Costeño a granel').fill('1,24');
    // 1,24 × 4,20 = 5,208 → 5,21; en efectivo se cobra 5,20
    await expect(page.getByTestId('venta-subtotal')).toHaveText(/5\.21/);
    await expect(page.getByTestId('venta-redondeo')).toHaveText(/0\.01/);
    await expect(page.getByTestId('venta-total')).toHaveText(/5\.20/);
    await captura(page, '11b-redondeo-efectivo');
    // Con Yape no hay redondeo
    await page.getByLabel('Método de pago').selectOption('yape');
    await expect(page.getByTestId('venta-redondeo')).toHaveCount(0);
    await expect(page.getByTestId('venta-total')).toHaveText(/5\.21/);
    await page.getByLabel('Método de pago').selectOption('efectivo');
    await page.getByRole('button', { name: 'Confirmar venta' }).click();
    await expect(page.getByTestId('venta-ok')).toContainText('Cobrado S/');
    await expect(page.getByTestId('venta-ok')).toContainText('5.20');
  });

  test('CP30, CP31 Alerta de stock mínimo (HU14)', async ({ page }) => {
    await ingresar(page, DUENO.email, DUENO.password);
    // Galletas: 30 ingresadas y 1 vendida = 29. Con un mínimo de 30 debe pedir reposición.
    await page.goto('/app/productos');
    await page.getByRole('link', { name: /Galletas Soda Field/ }).click();
    await page.getByLabel('Stock mínimo (opcional)').fill('30');
    await page.getByRole('button', { name: 'Guardar producto' }).click();
    await expect(page.getByText('Producto actualizado.')).toBeVisible();

    await page.goto('/app');
    await page.getByRole('link', { name: /por reponer/ }).click();
    await expect(page).toHaveURL(/\/app\/stock\?filtro=stock-bajo/);
    const lista = page.getByTestId('lista-stock').getByRole('listitem');
    await expect(lista).toHaveCount(1);
    await expect(lista.first()).toContainText('Galletas Soda Field');
    await expect(lista.first().getByTestId('alertas-producto')).toContainText('Stock bajo · mínimo 30');
    await captura(page, '17-stock-minimo');
  });

  test('CP16 La interfaz no deja vender más que el stock', async ({ page }) => {
    await ingresar(page, DUENO.email, DUENO.password);
    await page.goto('/app/vender');
    await page.getByRole('button', { name: 'Agregar Yogurt Gloria fresa 1 L', exact: true }).click();
    await page.getByLabel('Cantidad de Yogurt Gloria fresa 1 L').fill('9');
    await expect(page.getByText('Solo hay 6 disponibles.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirmar venta' })).toBeDisabled();
    await captura(page, '11-venta-stock-insuficiente');
  });

  test('Alertas de vencimiento visibles desde el inicio', async ({ page }) => {
    // Se simula que el lote de yogurt ya venció (retrocediendo su fecha con la clave de servicio)
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const { data: bodega } = await admin.from('bodegas').select('id').eq('nombre', BODEGA).single();
    const { data: yogurt } = await admin.from('productos').select('id').eq('bodega_id', bodega!.id).eq('nombre', 'Yogurt Gloria fresa 1 L').single();
    const { error } = await admin.from('lotes').update({ fecha_vencimiento: enDias(-1) }).eq('producto_id', yogurt!.id);
    expect(error).toBeNull();

    await ingresar(page, DUENO.email, DUENO.password);
    await page.getByRole('link', { name: /con lotes vencidos/ }).click();
    await expect(page).toHaveURL(/\/app\/stock\?filtro=vencidos/);

    // Solo aparece el producto vencido, con su lote ya abierto y marcado
    const lista = page.getByTestId('lista-stock').getByRole('listitem');
    await expect(lista).toHaveCount(1);
    await expect(lista.first()).toContainText('Yogurt Gloria fresa 1 L');
    await expect(lista.first().getByTestId('alertas-producto')).toContainText('vencido');
    await expect(lista.first().getByTestId('tabla-lotes')).toContainText('Vencido · no se vende');
    await captura(page, '08b-stock-vencidos');

    // Por vencer: la Inca Kola cuyo lote vence en 4 días
    await page.getByRole('button', { name: /Por vencer/ }).click();
    await expect(lista.filter({ hasText: 'Inca Kola 500 ml' })).toHaveCount(1);
    await expect(lista.filter({ hasText: 'Inca Kola 500 ml' }).getByTestId('alertas-producto')).toContainText('vence en 4 días');
  });

  test('CP28, CP29 Vencimientos y mermas (HU13)', async ({ page }) => {
    await ingresar(page, DUENO.email, DUENO.password);
    await page.getByRole('link', { name: /Vencimientos y mermas/ }).click();
    await expect(page).toHaveURL(/\/app\/vencimientos$/);

    // CP28: con el aviso por defecto (7 días) aparece el lote de Inca Kola que vence en 4 días
    const porVencer = page.getByTestId('lotes-por-vencer').getByRole('listitem');
    await expect(porVencer.filter({ hasText: 'Inca Kola 500 ml' })).toHaveCount(1);
    await expect(porVencer.filter({ hasText: 'Inca Kola 500 ml' })).toContainText('en 4 días');

    // Con 3 días de aviso ya no aparece; se vuelve a 7
    const dias = page.getByLabel('Avisarme con estos días de anticipación');
    await dias.fill('3');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('verás los lotes que vencen en los próximos 3 días')).toBeVisible();
    await expect(page.getByText('Ningún lote vence en los próximos 3 días.')).toBeVisible();
    await dias.fill('7');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(porVencer.filter({ hasText: 'Inca Kola 500 ml' })).toHaveCount(1);

    // CP29: el lote de yogurt vencido se registra como merma
    const vencidos = page.getByTestId('lotes-vencidos').getByRole('listitem');
    await expect(vencidos).toHaveCount(1);
    await expect(vencidos.first()).toContainText('Yogurt Gloria fresa 1 L');
    await page.screenshot({ path: 'docs/capturas/19-vencimientos.png', fullPage: true });
    await vencidos.first().getByRole('button', { name: /Registrar merma/ }).click();
    await expect(page.getByText(/Merma registrada: 6 de "Yogurt Gloria fresa 1 L"/)).toBeVisible();
    await expect(page.getByText('No hay lotes vencidos con unidades. ¡Todo en orden!')).toBeVisible();
    await expect(page.getByTestId('mermas')).toContainText('Yogurt Gloria fresa 1 L');
    await expect(page.getByTestId('perdida-mermas')).toHaveText(/32\.40/);
    await page.screenshot({ path: 'docs/capturas/20-mermas.png', fullPage: true });
  });

  test('CP06 Registro de ayudante por el dueño', async ({ page }) => {
    await ingresar(page, DUENO.email, DUENO.password);
    await page.goto('/app/equipo');
    await page.getByLabel('Nombre').fill(AYUDANTE.nombre);
    await page.getByLabel('Correo').fill(AYUDANTE.email);
    await page.getByLabel('Contraseña temporal').fill(AYUDANTE.password);
    await page.getByRole('button', { name: 'Crear cuenta de ayudante' }).click();
    await expect(page.getByRole('status')).toContainText(`${AYUDANTE.nombre} ya puede ingresar`);
    await expect(page.getByTestId('lista-equipo')).toContainText('Ayudante');
    await captura(page, '12-equipo');
    await salir(page);
  });

  test('CP07 Restricciones del rol ayudante', async ({ page }) => {
    await ingresar(page, AYUDANTE.email, AYUDANTE.password);
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByTestId('usuario-rol')).toHaveText('Ayudante');
    await expect(page.getByTestId('bodega-nombre')).toHaveText(BODEGA);

    const menu = page.getByRole('navigation', { name: 'Menú principal' }).first();
    await expect(menu.getByRole('link', { name: 'Vender' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Stock' })).toBeVisible();
    for (const oculto of ['Productos', 'Mercadería', 'Equipo', 'Ventas', 'Vencimientos', 'Fiados', 'Asistente']) await expect(menu.getByRole('link', { name: oculto })).toHaveCount(0);
    await captura(page, '13-panel-ayudante');

    // Escribir la dirección a mano tampoco abre las pantallas del dueño
    for (const ruta of ['/app/productos', '/app/productos/nuevo', '/app/mercaderia', '/app/equipo', '/app/ventas', '/app/vencimientos', '/app/fiados', '/app/fiados/1', '/app/asistente']) {
      await page.goto(ruta);
      await expect(page).toHaveURL(/\/app\?restringido=1/);
    }
    await expect(page.getByText('Esa opción solo está disponible para el dueño de la bodega.')).toBeVisible();

    // Sí puede vender, pero no al fiado (HU11: solo el dueño fía)
    await page.goto('/app/vender');
    await expect(page.getByLabel('Método de pago').locator('option[value="fiado"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Agregar Galletas Soda Field', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar venta' }).click();
    await expect(page.getByTestId('venta-ok')).toBeVisible();
    await salir(page);
  });

  test('CP18, CP19 Historial de ventas del día (HU08)', async ({ page }) => {
    await ingresar(page, DUENO.email, DUENO.password);
    await page.getByRole('link', { name: /Ventas del día/ }).click();
    await expect(page).toHaveURL(/\/app\/ventas$/);
    // Ventas del flujo: 14,50 (Yape, dueño) + 5,20 (efectivo, dueño) + 1,20 (efectivo, ayudante)
    const lista = page.getByTestId('lista-ventas').getByRole('listitem');
    await expect(lista).toHaveCount(3);
    await expect(lista.first()).toContainText(AYUDANTE.nombre); // la más reciente arriba
    await expect(lista.first()).toContainText('1 × Galletas Soda Field');
    await expect(page.getByTestId('total-dia')).toHaveText(/20\.90/);
    await expect(page.getByTestId('cantidad-ventas')).toContainText('3 ventas');
    await expect(page.getByTestId('por-metodo')).toContainText('Yape');
    await captura(page, '18-historial-ventas');

    // El día anterior no tiene ventas
    await page.getByRole('link', { name: '← Día anterior' }).click();
    await expect(page.getByText('No hay ventas registradas este día.')).toBeVisible();
  });

  test('CP24, CP25, CP26, CP27 Cuaderno de fiados y recordatorio por WhatsApp (HU11, HU12)', async ({ page }) => {
    await ingresar(page, DUENO.email, DUENO.password);
    await page.getByRole('link', { name: /Cuaderno de fiados/ }).click();
    await expect(page).toHaveURL(/\/app\/fiados$/);

    // Clientes del cuaderno: uno con celular y otro sin celular
    for (const c of [{ nombre: 'Carmen Rojas', celular: '987 654 321' }, { nombre: 'Pedro Huamán', celular: '' }]) {
      await page.getByLabel('Nombre').fill(c.nombre);
      await page.getByLabel('Celular (opcional)').fill(c.celular);
      await page.getByRole('button', { name: 'Agregar cliente' }).click();
      await expect(page.getByText(`${c.nombre} ya está en tu cuaderno de fiados.`)).toBeVisible();
    }
    await page.getByLabel('Nombre').fill('carmen rojas');
    await page.getByRole('button', { name: 'Agregar cliente' }).click();
    await expect(page.getByText('Ya tienes un cliente con ese nombre.')).toBeVisible();

    // CP24: venta al fiado de 2 Inca Kola + 1 galleta = 8,20 (sin redondeo)
    await page.goto('/app/vender');
    await page.getByRole('button', { name: 'Agregar Inca Kola 500 ml', exact: true }).click();
    await page.getByRole('button', { name: 'Agregar Inca Kola 500 ml', exact: true }).click();
    await page.getByRole('button', { name: 'Agregar Galletas Soda Field', exact: true }).click();
    await page.getByLabel('Método de pago').selectOption('fiado');
    await expect(page.getByRole('button', { name: 'Confirmar venta' })).toBeDisabled(); // falta elegir al cliente
    await page.getByLabel('Cliente').selectOption({ label: 'Carmen Rojas' });
    await expect(page.getByText('Total al fiado')).toBeVisible();
    await expect(page.getByTestId('venta-total')).toHaveText(/8\.20/);
    await captura(page, '21-venta-fiado');
    await page.getByRole('button', { name: 'Confirmar venta' }).click();
    await expect(page.getByTestId('venta-ok')).toContainText('Fiado a Carmen Rojas');
    await expect(page.getByTestId('venta-ok')).toContainText(/Ahora debe S\/\s8\.20/);

    // El cuaderno muestra quién debe y cuánto
    await page.goto('/app/fiados');
    await expect(page.getByTestId('total-por-cobrar')).toHaveText(/8\.20/);
    const filas = page.getByTestId('lista-clientes').getByRole('listitem');
    const carmen = filas.filter({ hasText: 'Carmen Rojas' });
    const pedro = filas.filter({ hasText: 'Pedro Huamán' });
    await expect(carmen.getByTestId('deuda-cliente')).toHaveText(/Debe S\/\s8\.20/);
    await expect(pedro.getByTestId('deuda-cliente')).toHaveText('Al día');

    // CP26: el botón abre WhatsApp con el número y el mensaje de la deuda ya escritos
    const recordar = carmen.getByRole('link', { name: 'Recordar a Carmen Rojas por WhatsApp' });
    const enlace = new URL((await recordar.getAttribute('href'))!);
    expect(enlace.origin + enlace.pathname).toBe('https://wa.me/51987654321');
    expect(enlace.searchParams.get('text')!.replace(/\s/g, ' ')).toContain('cuenta pendiente de S/ 8.20');
    await expect(recordar).toHaveAttribute('target', '_blank');
    // CP27: sin celular el botón está deshabilitado
    await expect(pedro.getByRole('button', { name: /Recordar a Pedro Huamán/ })).toBeDisabled();
    await page.screenshot({ path: 'docs/capturas/22-fiados.png', fullPage: true });

    // CP25: pago parcial de la deuda
    await carmen.getByRole('link', { name: /Carmen Rojas/ }).first().click();
    await expect(page).toHaveURL(/\/app\/fiados\/\d+$/);
    await expect(page.getByTestId('deuda-actual')).toHaveText(/8\.20/);
    await page.getByLabel('Monto que paga (S/)').fill('10');
    await page.getByRole('button', { name: 'Registrar pago' }).click();
    await expect(page.getByText('El pago no puede ser mayor que la deuda (S/ 8.20).')).toBeVisible();
    await page.getByLabel('Monto que paga (S/)').fill('5');
    await page.getByLabel('Cómo pagó').selectOption('yape');
    await page.getByRole('button', { name: 'Registrar pago' }).click();
    await expect(page.getByTestId('pago-ok')).toContainText(/Carmen Rojas aún debe S\/\s3\.20/);
    await expect(page.getByTestId('deuda-actual')).toHaveText(/3\.20/);
    const historial = page.getByTestId('historial-cliente').getByRole('listitem');
    await expect(historial).toHaveCount(2);
    await expect(historial.first()).toContainText('Pagó con Yape'); // lo más reciente arriba
    await expect(historial.last()).toContainText('2 × Inca Kola 500 ml');
    await page.screenshot({ path: 'docs/capturas/23-fiado-cliente.png', fullPage: true });

    // CP27: el celular, si se registra, debe ser válido
    await page.goto('/app/fiados');
    await pedro.getByRole('link', { name: /Pedro Huamán/ }).first().click();
    await page.getByLabel('Celular del cliente').fill('12345');
    await page.getByRole('button', { name: 'Guardar celular' }).click();
    await expect(page.getByText('El celular debe tener 9 dígitos y empezar con 9.')).toBeVisible();
    await page.getByLabel('Celular del cliente').fill('912 345 678');
    await page.getByRole('button', { name: 'Guardar celular' }).click();
    await expect(page.getByText('Celular guardado.')).toBeVisible();
    await expect(page.getByText('Celular 912345678')).toBeVisible();
  });

  test('CP20, CP21 Venta por voz (HU09)', async ({ page }) => {
    // El navegador de pruebas no tiene micrófono: se reemplaza el reconocedor de voz del navegador por uno
    // que "escucha" el texto de window.__dictado (igual que la Web Speech API: onresult y luego onend)
    await page.addInitScript(() => {
      type Evento = { resultIndex: number; results: unknown[] };
      const w = window as unknown as { __dictado?: string; __idioma?: string; SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
      class ReconocedorFalso {
        lang = '';
        interimResults = false;
        continuous = false;
        maxAlternatives = 1;
        onresult: ((e: Evento) => void) | null = null;
        onerror: ((e: { error: string }) => void) | null = null;
        onend: (() => void) | null = null;
        start() {
          w.__idioma = this.lang;
          setTimeout(() => {
            this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: w.__dictado ?? '' }], { isFinal: true })] });
            this.onend?.();
          }, 200);
        }
        stop() {}
        abort() {}
      }
      w.SpeechRecognition = ReconocedorFalso;
      w.webkitSpeechRecognition = ReconocedorFalso;
    });
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { data: bodega } = await admin.from('bodegas').select('id').eq('nombre', BODEGA).single();
    const contarVentas = async () => (await admin.from('ventas').select('id', { count: 'exact', head: true }).eq('bodega_id', bodega!.id)).count;
    const antes = await contarVentas();

    await ingresar(page, DUENO.email, DUENO.password);
    await page.goto('/app/vender');

    // CP20: "dos Inca Kola de medio litro y un paquete de galletas" → venta propuesta con productos del catálogo
    await page.evaluate(() => { (window as unknown as { __dictado: string }).__dictado = 'Dos Inca Kola de medio litro y un paquete de galletas'; });
    await page.getByRole('button', { name: 'Vender por voz' }).click();
    await expect(page.getByTestId('venta-voz')).toContainText('Escuché: «Dos Inca Kola de medio litro y un paquete de galletas»');
    await expect(page.getByTestId('venta-voz')).toContainText('Nada se registra hasta que confirmes');
    expect(await page.evaluate(() => (window as unknown as { __idioma: string }).__idioma)).toBe('es-PE');
    await expect(page.getByLabel('Cantidad de Inca Kola 500 ml')).toHaveValue('2');
    await expect(page.getByLabel('Cantidad de Galletas Soda Field')).toHaveValue('1');
    await expect(page.getByTestId('carrito').getByRole('listitem')).toHaveCount(2);
    await expect(page.getByTestId('venta-total')).toHaveText(/8\.20/);
    await captura(page, '24-venta-voz');
    expect(await contarVentas()).toBe(antes); // CA2: todavía no se registró nada
    await page.getByRole('button', { name: 'Confirmar venta' }).click();
    await expect(page.getByTestId('venta-ok')).toContainText(/Cobrado S\/\s8\.20 \(Efectivo\)/);
    expect(await contarVentas()).toBe(antes! + 1);

    // CP21: un producto que no se reconoce se elige a mano (aquí, escribiendo el pedido en lugar de dictarlo)
    await page.getByText('¿Sin micrófono? Escribe el pedido').click();
    await page.getByLabel('Escribe el pedido').fill('tres chizitos y medio kilo de arroz');
    await page.getByRole('button', { name: 'Interpretar' }).click();
    await expect(page.getByLabel('Cantidad de Arroz Costeño a granel')).toHaveValue('0.5');
    const elegir = page.getByLabel('¿Qué producto es «chizitos»? (3)');
    await expect(elegir).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirmar venta' })).toBeDisabled();
    await captura(page, '25-venta-voz-elegir');
    await elegir.selectOption({ label: 'Galletas Soda Field' });
    await expect(page.getByLabel('Cantidad de Galletas Soda Field')).toHaveValue('3');
    await expect(page.getByTestId('por-elegir')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Confirmar venta' })).toBeEnabled();

    // Si se arrepiente, se vacía la venta y no se registra nada
    await page.getByRole('button', { name: 'Vaciar la venta' }).click();
    await expect(page.getByText('Toca un producto para agregarlo o véndelo por voz.')).toBeVisible();
    expect(await contarVentas()).toBe(antes! + 1);
  });

  test('CP20b Venta por voz con IA: nombres coloquiales (HU09)', async ({ page }) => {
    await ingresar(page, DUENO.email, DUENO.password);
    await page.goto('/app/vender');
    await page.getByText('¿Sin micrófono? Escribe el pedido').click();
    // Las reglas no entienden "gaseosa amarilla" ni "chizitos": se le pregunta a la IA (Gemini simulado)
    await page.getByLabel('Escribe el pedido').fill('una gaseosa amarilla y dos chizitos');
    await page.getByRole('button', { name: 'Interpretar' }).click();
    await expect(page.getByTestId('sugerencias-ia')).toContainText('Interpreté «gaseosa amarilla» como Inca Kola 500 ml.');
    await expect(page.getByLabel('Cantidad de Inca Kola 500 ml')).toHaveValue('1');
    await expect(page.getByTestId('carrito').getByRole('listitem').filter({ hasText: 'Inca Kola 500 ml' })).toContainText('IA');
    // Lo que la IA tampoco reconoce se sigue eligiendo a mano (CA2)
    await expect(page.getByTestId('aviso-ia')).toContainText('La IA tampoco reconoció «chizitos»');
    await expect(page.getByLabel('¿Qué producto es «chizitos»? (2)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirmar venta' })).toBeDisabled();
    await captura(page, '26-venta-voz-ia');
    await page.getByTestId('por-elegir').getByRole('button', { name: 'Quitar' }).click();
    await expect(page.getByRole('button', { name: 'Confirmar venta' })).toBeEnabled();
    await page.getByRole('button', { name: 'Vaciar la venta' }).click();
    await expect(page.getByTestId('venta-voz')).toHaveCount(0);
  });

  test('CP34 Asistente de consultas con IA (HU16)', async ({ page }) => {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { data: bodega } = await admin.from('bodegas').select('id').eq('nombre', BODEGA).single();
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
    const { data: ventasHoy } = await admin.from('ventas').select('total_cobrado').eq('bodega_id', bodega!.id).gte('created_at', `${hoy}T00:00:00-05:00`);
    const totalHoy = (ventasHoy ?? []).reduce((s, v) => s + Number(v.total_cobrado), 0);

    await ingresar(page, DUENO.email, DUENO.password);
    await page.getByRole('link', { name: /Asistente con IA/ }).click();
    await expect(page).toHaveURL(/\/app\/asistente$/);

    // CA1: "¿Quién me debe más?" → la IA pide la función "deudores" y responde con el dato real (CP24 y CP25 dejaron a Carmen con S/ 3.20)
    await page.getByRole('button', { name: '¿Quién me debe más?' }).click();
    const respuestas = page.getByTestId('respuesta-asistente');
    await expect(respuestas.last()).toHaveText('Quien más te debe es Carmen Rojas, con S/ 3.20.');
    await expect(page.getByTestId('consultas-asistente').last()).toHaveText('Datos consultados: cuaderno de fiados');

    await page.getByLabel('Tu pregunta').fill('¿Cuánto vendí hoy?');
    await page.getByRole('button', { name: 'Preguntar' }).click();
    await expect(respuestas).toHaveCount(2);
    await expect(respuestas.last()).toHaveText(`Vendiste S/ ${totalHoy.toFixed(2)} en ${ventasHoy!.length} ventas.`);

    // Fuera de tema: no consulta nada
    await page.getByLabel('Tu pregunta').fill('¿Qué clima hará mañana?');
    await page.getByRole('button', { name: 'Preguntar' }).click();
    await expect(respuestas).toHaveCount(3);
    await expect(respuestas.last()).toContainText('Solo puedo responder preguntas sobre tu bodega');
    await expect(page.getByTestId('consultas-asistente')).toHaveCount(2);
    await page.screenshot({ path: 'docs/capturas/27-asistente.png', fullPage: true });
  });

  test('CP22, CP23 Carga de mercadería con foto de factura (HU10)', async ({ page }) => {
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { data: bodega } = await admin.from('bodegas').select('id').eq('nombre', BODEGA).single();
    const contarLotes = async () => (await admin.from('lotes').select('id', { count: 'exact', head: true }).eq('bodega_id', bodega!.id)).count!;
    const antes = await contarLotes();
    const enDias = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(Date.now() + n * 86_400_000));

    await ingresar(page, DUENO.email, DUENO.password);
    await page.goto('/app/mercaderia');
    await page.getByRole('link', { name: 'Cargar con foto de factura' }).click();
    await expect(page).toHaveURL(/\/app\/mercaderia\/factura$/);
    await page.getByLabel('Foto de la factura').setInputFiles('tests/fixtures/factura-ejemplo.jpg');
    await expect(page.getByAltText('Vista previa de la factura')).toBeVisible();
    await page.getByRole('button', { name: 'Leer factura con IA' }).click();

    // CA1: la lista leída (Gemini simulado) para revisar
    const filas = page.getByTestId('filas-factura').getByRole('listitem');
    await expect(filas).toHaveCount(3);
    await expect(page.getByLabel('Producto de «INCA KOLA 500ML PET»')).toHaveValue(/\d+/);
    await expect(page.getByLabel('Producto de «INCA KOLA 500ML PET»').locator('option:checked')).toHaveText('Inca Kola 500 ml');
    await expect(page.getByLabel('Cantidad de «INCA KOLA 500ML PET»')).toHaveValue('12');
    await expect(page.getByLabel('Costo unitario de «INCA KOLA 500ML PET»')).toHaveValue('2.1');
    await expect(page.getByLabel('Producto de «GALLETA SODA FIELD X6»').locator('option:checked')).toHaveText('Galletas Soda Field');
    // CA2: lo que no está en el catálogo empieza sin marcar; solo se registra lo marcado
    await expect(page.getByLabel('Agregar «PAPEL HIGIENICO ELITE»')).not.toBeChecked();
    await expect(filas.filter({ hasText: 'PAPEL HIGIENICO ELITE' })).toContainText('No está en tu catálogo');
    await page.screenshot({ path: 'docs/capturas/28-factura.png', fullPage: true });

    // CA2: cada lote necesita su fecha de vencimiento (la galleta no la trae)
    await page.getByRole('button', { name: 'Registrar 2 lotes' }).click();
    await expect(filas.filter({ hasText: 'GALLETA SODA FIELD X6' }).getByRole('alert')).toHaveText('Elige la fecha de vencimiento.');
    expect(await contarLotes()).toBe(antes); // no se guardó nada
    await page.getByLabel('Vencimiento de «GALLETA SODA FIELD X6»').fill(enDias(45));
    await page.getByRole('button', { name: 'Registrar 2 lotes' }).click();
    await expect(page.getByTestId('factura-ok')).toHaveText('Se agregaron 2 lotes al inventario.');
    expect(await contarLotes()).toBe(antes + 2);
    const { data: nuevos } = await admin.from('lotes').select('cantidad_inicial, costo_unitario, fecha_vencimiento').eq('bodega_id', bodega!.id).order('id', { ascending: false }).limit(2);
    expect(nuevos!.map((l) => [Number(l.cantidad_inicial), Number(l.costo_unitario)]).sort()).toEqual([[12, 2.1], [24, 0.55]]);
  });

  test('Vista móvil de la venta', async ({ browser }) => {
    const ctx = await browser.newContext({ ...{ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, locale: 'es-PE' });
    const page = await ctx.newPage();
    await ingresar(page, DUENO.email, DUENO.password);
    await expect(page).toHaveURL(/\/app$/);
    await page.screenshot({ path: 'docs/capturas/14-movil-inicio.png' });
    await page.getByRole('navigation', { name: 'Menú principal' }).last().getByRole('link', { name: 'Vender' }).click();
    await page.getByRole('button', { name: 'Agregar Inca Kola 500 ml', exact: true }).click();
    await page.getByRole('button', { name: 'Agregar Galletas Soda Field', exact: true }).click();
    await page.screenshot({ path: 'docs/capturas/15-movil-venta.png' });
    await page.getByRole('link', { name: /Ver venta/ }).click();
    await expect(page.getByRole('button', { name: 'Confirmar venta' })).toBeInViewport();
    await page.screenshot({ path: 'docs/capturas/16-movil-carrito.png' });
    await ctx.close();
  });
});
