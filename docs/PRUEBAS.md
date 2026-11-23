# Registro de pruebas · Sprints 1 a 3

Casos de prueba (CP) de la matriz de trazabilidad del informe, con la prueba automática que los verifica.

- **API**: Vitest contra Supabase (Auth + PostgREST + PostgreSQL). Prueba las reglas en la base de datos: RLS, triggers y la función de venta.
- **E2E**: Playwright en Chromium, con el flujo real del usuario en la interfaz. Guarda capturas en `docs/capturas/`.

Ejecución del 12/10/2026 (Sprint 1): **38/38 pruebas unitarias y de API aprobadas** y **12/12 pruebas e2e aprobadas**.

Ejecución del 20/11/2026 (Sprint 3, con HU13, HU11, HU12 y HU09): **85/85 pruebas unitarias y de API aprobadas** y **19/19 pruebas e2e aprobadas**.

Ejecución del 22/11/2026 (Sprint 3, HU09 con IA, HU16 y HU10): **105/105 pruebas unitarias y de API aprobadas** y **22/22 pruebas e2e aprobadas**.

| CP | Historia | Caso de prueba | Prueba de API (`tests/api`) | Prueba e2e (`tests/e2e`) | Resultado |
|---|---|---|---|---|---|
| CHK-01 | HT01 | Checklist de configuración del entorno | — | — | Ver checklist abajo |
| CP01 | HU01 | Registro exitoso de bodega y dueño | `rf01-acceso` · CP01 | CP01 | Aprobado |
| CP02 | HU01 | Registro con correo duplicado | `rf01-acceso` · CP02 | CP02 | Aprobado |
| CP03 | HU02 | Inicio de sesión válido | `rf01-acceso` · CP03 | CP03 | Aprobado |
| CP04 | HU02 | Inicio de sesión con credenciales inválidas | `rf01-acceso` · CP04 | CP04 | Aprobado |
| CP05 | HU02 | Acceso a página interna sin sesión | `rf01-acceso` · CP05 | CP05 | Aprobado |
| CP06 | HU03 | Registro de ayudante por el dueño | `rf01-acceso` · CP06 | CP06 | Aprobado |
| CP07 | HU03 | Restricciones del rol ayudante | `rf01-acceso` · CP07 | CP07 | Aprobado |
| CP08 | HU03 | Aislamiento de datos entre bodegas | `rf01-acceso` · CP08 | — | Aprobado |
| CP09 | HU04 | Registro de producto válido | `rf02-inventario` · CP09 | CP09 | Aprobado |
| CP10 | HU04 | Producto duplicado o con precio inválido | `rf02-inventario` · CP10 | CP10 | Aprobado |
| CP11 | HU05 | Registro de lote válido | `rf02-inventario` · CP11 | CP11 | Aprobado |
| CP12 | HU05 | Registro de lote con fecha vencida | `rf02-inventario` · CP12 | CP12 | Aprobado |
| CP13 | HU06 | Consulta de stock con detalle de lotes | `rf02-inventario` · CP13 | CP13 | Aprobado |
| CP14 | HU07 | Venta con stock suficiente | `rf03-ventas` · CP14 | CP14 | Aprobado |
| CP15 | HU07 | Descuento de stock por criterio FEFO | `rf03-ventas` · CP15 | CP15 | Aprobado |
| CP16 | HU07 | Venta con stock insuficiente | `rf03-ventas` · CP16 | CP16 | Aprobado |
| CP17 | HU07 | Atomicidad de la venta ante un error | `rf03-ventas` · CP17 y CP17b | — | Aprobado |
| CP14c | HU07 | Redondeo a favor del cliente en efectivo | `rf03-ventas` · CP14c | CP14c | Aprobado |
| CP18 | HU08 | Listado de ventas del día | `rf03-historial` · CP18 | CP18 | Aprobado |
| CP19 | HU08 | Total vendido del día | `rf03-historial` · CP19 | CP19 | Aprobado |
| CP20 | HU09 | Interpretación de venta dictada (venta propuesta; nada se registra sin confirmar) | Prueba unitaria `voz` · CA1 | CP20 | Aprobado |
| CP21 | HU09 | Producto no reconocido en el dictado (se elige a mano) | Prueba unitaria `voz` · CA2 | CP21 | Aprobado |
| CP20b | HU09 | Nombre coloquial resuelto por la IA ("gaseosa amarilla" → Inca Kola) y lo que la IA no reconoce queda para elegir a mano | Pruebas unitarias `ia-sugerencias` e `ia-gemini` | CP20b | Aprobado |
| CP22 | HU10 | Lectura de la factura desde la foto: lista de productos, cantidades y costos para revisar | Prueba unitaria `ia-factura` (CP22) | CP22, CP23 | Aprobado |
| CP23 | HU10 | Solo se registran los ítems confirmados, cada uno con fecha de vencimiento; todos o ninguno | `rf05-factura` · CP23 y prueba unitaria `ia-factura` | CP22, CP23 | Aprobado |
| CP34 | HU16 | "¿Quién me debe más?" responde con el dato correcto de la bodega del usuario; la IA solo usa funciones predefinidas y nunca ve datos de otra bodega | `rf09-asistente` · CP34 y CA2; prueba unitaria `ia-asistente` | CP34 | Aprobado |
| CP24 | HU11 | Registro de venta al fiado (deuda exacta, sin redondeo; solo el dueño) | `rf06-fiados` · CP24 | CP24 | Aprobado |
| CP25 | HU11 | Registro de pago de deuda e historial del cliente | `rf06-fiados` · CP25 | CP25 | Aprobado |
| CP26 | HU12 | Recordatorio por WhatsApp con el número y el monto | `rf06-fiados` · CP26 y prueba unitaria `whatsapp` | CP26 | Aprobado |
| CP27 | HU12 | Cliente sin celular: botón deshabilitado y celular válido | `rf06-fiados` · CP27 | CP27 | Aprobado |
| CP28 | HU13 | Alerta de lotes por vencer (días configurables) | `rf07-vencimientos` · CP28 | CP28 | Aprobado |
| CP29 | HU13 | Registro de lote vencido como merma | `rf07-vencimientos` · CP29 | CP29 | Aprobado |
| CP30 | HU14 | Configuración de stock mínimo | `rf07-alertas` · CP30 | CP30 | Aprobado |
| CP31 | HU14 | Alerta de stock bajo | `rf07-alertas` · CP31 | CP31 | Aprobado |

Además, `tests/unit/validaciones.test.ts` tiene 25 pruebas unitarias de las reglas de los formularios (contraseña, precios, fechas en hora de Lima, cantidades enteras, mensajes de error, clientes y pagos de fiado); `tests/unit/alertas.test.ts` tiene 7 `tests/unit/whatsapp.test.ts` tiene 2 (enlace del recordatorio de HU12) y `tests/unit/voz.test.ts` tiene 10 (interpretación del dictado de HU09: presentaciones, cantidades a granel, productos ambiguos o no reconocidos). `tests/unit/ia-gemini.test.ts` (4) prueba el cliente de Gemini con `fetch` simulado (clave en la cabecera, esquema JSON, reintento sin esquema y mensajes de error) y `tests/unit/ia-sugerencias.test.ts` (4) que la respuesta de la IA se valide contra el catálogo.

**IA en las pruebas.** Las pruebas e2e y la CI no llaman a Gemini: `tests/e2e/gemini-simulado.mjs` simula la API (`generateContent`) con reglas fijas y exige lo mismo que la real (clave en `x-goog-api-key`, esquema JSON y la `thoughtSignature` en el historial de function calling). Así las pruebas no gastan cuota, no dependen de Internet y siempre dan el mismo resultado. La prueba con el Gemini real se hace a mano en la vista previa de Vercel.

En la prueba e2e de HU09 el navegador de pruebas no tiene micrófono, así que se reemplaza el reconocedor de voz del navegador (Web Speech API) por uno simulado que entrega el texto dictado; el resto del flujo es el real.

## Verificación de que las pruebas detectan errores

Para comprobar que las pruebas no pasan "por defecto", se introdujeron defectos a propósito y luego se revirtieron:

| Defecto introducido | Prueba que lo detectó |
|---|---|
| La venta descuenta del lote que vence **último** (FEFO invertido) | CP15 falló |
| La política RLS deja que el ayudante lea la tabla de lotes (con costos) | CP07 falló |
| La alerta de stock bajo compara con "menor que" en lugar de "menor o igual que" el mínimo (Sprint 2) | CP31 y la prueba unitaria de HU14 fallaron |
| El día del historial se calcula en hora UTC y no en hora de Lima (Sprint 2) | CP18, CP19 y la prueba unitaria de HU08 fallaron |
| La merma no descuenta el lote vencido (Sprint 3) | CP29 falló |
| La deuda del cliente no resta los pagos registrados (Sprint 3) | CP25 falló |
| El enlace de WhatsApp se arma sin el código de país 51 (Sprint 3) | Prueba unitaria de HU12 falló |
| El intérprete de voz no traduce "medio litro" a "500 ml" (Sprint 3) | 3 pruebas unitarias de HU09 fallaron |
| La venta por voz se puede confirmar con un producto sin elegir (Sprint 3) | e2e CP21 falló |
| El asistente no devuelve a Gemini el turno con la thoughtSignature (Sprint 3) | Prueba unitaria `ia-asistente` falló |
| Se acepta un producto_id de la factura que no está en el catálogo (Sprint 3) | Prueba unitaria `ia-factura` falló |

## Defectos encontrados durante el sprint

BUG-02 a BUG-04 están en el informe (pruebas manuales del Sprint 2).

| ID | Descripción | Detectado por | Estado |
|---|---|---|---|
| BUG-01 | En "Nuevo producto", si había un error de validación (por ejemplo, precio 0), la categoría elegida se borraba al volver a mostrar el formulario (comportamiento de React 19 con `<select>`). | e2e CP10 | Corregido: el formulario se vuelve a montar con los valores escritos (productos, mercadería y equipo). |
| BUG-05 | (Sprint 3) El cuaderno de fiados daba "permiso denegado" al dueño: la vista `v_clientes` llamaba a una función interna de la base de datos que no está expuesta a los usuarios. | API CP24 y CP25 | Corregido antes del commit: la deuda se calcula dentro de la vista y la función queda solo para uso interno (si se expusiera, con un id ajeno revelaría la deuda de otra bodega). |

## Checklist CHK-01 (HT01)

- [ ] Repositorio en GitHub con ramas `main` y `develop`.
- [ ] Reglas de protección: Pull Request con 1 aprobación y CI en verde para `main` y `develop`.
- [ ] Workflow de CI ejecutándose en GitHub Actions.
- [ ] Proyecto de Supabase con la migración aplicada.
- [ ] Despliegue en Vercel: `main` en producción y *previews* en cada Pull Request.
- [ ] Tablero Scrum en Jira con el Product Backlog y el Sprint 1.
