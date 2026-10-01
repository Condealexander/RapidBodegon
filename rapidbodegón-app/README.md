# RapidBodegón
Sistema interno de gestión de crédito, pagos, inventario y cobranza. Los
clientes consultan su cuenta y reportan pagos; el administrador gestiona
consumos, conciliación, productos, tasa de cambio y cierres de ciclo.

**Aplicación:** https://rapid-bodegon-alexyanez1993-5085.vercel.app

## Stack

- React 19 y TypeScript, compilados con Vite 6.
- Tailwind CSS 4.
- Firebase Authentication y Cloud Firestore; no hay servidor propio.
- Recharts para los gráficos administrativos.
- SheetJS (`xlsx`) para importar inventario.
- Vercel para hosting; `main` está configurada como rama de producción.

La lógica compartida de negocio está principalmente en
`src/store/AppContext.tsx`. Las vistas viven en `src/views/`, los componentes
comunes en `src/components/`, los tipos en `src/types/` y la autorización de
Firestore en `firestore.rules`.

## Acceso y roles

El usuario inicia sesión con nombre y PIN; no necesita un correo real. La app
normaliza el nombre y deriva un correo sintético para Firebase Authentication.
Por ejemplo, `JUAN PEREZ` se convierte en `JUANPEREZ@rapidbodegon.local`. El
registro de clientes requiere un PIN de al menos 8 caracteres. Las cuentas
`ADMIN` se crean o actualizan mediante un script con Firebase Admin SDK, nunca
desde el código cliente.

### Cliente

- Consulta el saldo pendiente en USD y su conversión a bolívares según la tasa
  configurada; ve el estado de cuenta y el próximo corte.
- Consulta los datos de pago móvil/transferencia, copia campos individuales o
  copia todos los datos bancarios juntos.
- Reporta pagos con monto y referencia bancaria. Los reportes quedan pendientes
  hasta que el administrador los valide.
- Consulta el historial de pagos y consumos, y recibe un onboarding inicial y
  un aviso de privacidad.
- Ve los precios de productos disponibles; los productos con stock menor o
  igual a cero no aparecen.
- Puede cambiar entre tema claro y oscuro.

El flujo para que el cliente reporte su propio consumo existe en el código,
pero está desactivado por `ENABLE_CONSUMPTION_REPORT = false` en
`src/views/ClientView.tsx`.

### Administrador

- Consulta el crédito global por cobrar, la recaudación del ciclo actual y el
  estado de clientes; puede buscar clientes por nombre.
- Revisa gráficos de ventas diarias y los cinco clientes con mayor consumo.
- Registra consumos a crédito. La operación actualiza transacción, saldo del
  cliente y stock mediante una transacción de Firestore.
- Aprueba o rechaza pagos y solicitudes de consumo pendientes.
- Ajusta stock manualmente o importa `.xlsx`, `.xls` y `.csv` con las columnas
  `PRODUCTO` y `STOCK`, y una columna opcional `PRECIO`.
- Actualiza la tasa de cambio y consulta el historial de ciclos de cobro.
- Puede cambiar entre tema claro y oscuro.

## Ciclos de cobro

Los cortes ocurren los días 3, 10, 17 y 25 de cada mes. La app calcula el
próximo corte y los días restantes. Al abrir el panel administrativo, busca
ciclos vencidos que falten y calcula los pagos y consumos completados dentro
del período. El proceso espera los snapshots iniciales confirmados por el
servidor y crea cada cierre en una transacción únicamente si todavía no existe.

No es una tarea de servidor programada: para ponerse al día, un administrador
debe abrir la aplicación después de un corte. Se revisan hasta 12 ciclos
anteriores consecutivos y se detiene el recorrido al encontrar uno ya cerrado.

## Datos de Firestore

| Colección | Campos principales |
|---|---|
| `users/{uid}` | `id`, `name`, `role` (`ADMIN` o `CLIENT`), `balanceUSD` |
| `products/{id}` | `id`, `name`, `priceUSD`, `stock` |
| `transactions/{id}` | `userId`, `type` (`CONSUMPTION` o `PAYMENT`), `amountUSD`, `date`, `status` (`PENDING`, `COMPLETED` o `REJECTED`), `productId?`, `quantity?`, `reference?` |
| `config/global` | `exchangeRate`, `cutoffDays`, `bankDetails` |
| `cycles/{id}` | `periodStart`, `periodEnd`, `totalCollected`, `totalConsumption`, `closedAt` |

## Seguridad: limitación actual

`firestore.rules` restringe por rol el acceso a perfiles, productos,
configuración y ciclos. **La regla actual `allow create` de `transactions` es
más permisiva que el flujo esperado:** las condiciones que limitan al cliente
a crear solo transacciones propias y con estado `PENDING` están comentadas.
Tal como está escrita, cualquier usuario autenticado puede crear documentos
de transacción que la interfaz no permitiría.

La validación de la interfaz no sustituye las reglas de Firestore. Antes de
confiar en esta restricción en producción, corrige la regla para validar UID,
tipo, estado y campos permitidos, y prueba el acceso con los roles cliente y
administrador. Esta documentación no modifica las reglas.

## Scripts administrativos

Los scripts de `scripts/` usan Firebase Admin SDK, que evita las reglas de
Firestore. Ejecútalos solo desde una máquina o Codespace autorizado, nunca
desde el navegador. Para Application Default Credentials:

```bash
gcloud auth application-default login
```

| Script | Uso |
|---|---|
| `create-admin.mjs` | Crear cuenta admin o actualizar su PIN: `node scripts/create-admin.mjs "ADMINISTRADOR" "pinSeguro" --project=rapidbodegon` |
| `reset-pin.mjs` | Cambiar el PIN de un cliente sin alterar su perfil o saldo: `node scripts/reset-pin.mjs "JUAN PEREZ" "nuevoPinDe8Digitos" --project=rapidbodegon` |
| `seed-data.mjs` | Cargar productos iniciales de ejemplo y `config/global`: `node scripts/seed-data.mjs --project=rapidbodegon` |
| `import-products.mjs` | Eliminar los productos de prueba `p1` a `p8` e importar el catálogo del script: `node scripts/import-products.mjs --project=rapidbodegon` |

El importador asigna stock inicial de 100 unidades. Revisa los cambios que
hará cada script y actualiza las existencias reales desde el panel de
inventario antes de operar.

## Desarrollo local

Requiere Node.js, Firebase Authentication (Email/Password) y Firestore. La
configuración de Firebase se importa desde `firebase-applet-config.json` a
través de `src/firebase.ts`; apunta el archivo al proyecto correcto y no
incluyas credenciales de Firebase Admin en el cliente.

```bash
npm install
npm run dev
npm run build
npm run analyze
```

El build de producción se genera en `dist/`. Vite separa Recharts y SheetJS
en chunks propios. `package.json` no define actualmente un script de pruebas
automatizadas. `npm run analyze` genera `dist/stats.html` con el detalle de
composición y tamaño de cada bundle; no forma parte del build normal.

## Despliegue

Vercel despliega desde la rama `main` según la configuración del proyecto.
Un push inicia el despliegue, pero verifica su estado antes de considerar el
cambio disponible en producción. El dominio documentado es
`rapid-bodegon-alexyanez1993-5085.vercel.app`.

## Documentación adicional

- `memory.md`: contexto técnico y arquitectura del repositorio.
- `agent.md`: pautas de trabajo para futuras modificaciones; es documentación
  normal, no un agente personalizado seleccionable en VS Code.

## Licencia

Apache-2.0