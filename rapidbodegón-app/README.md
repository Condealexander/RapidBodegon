# RapidBodegón

Sistema interno de gestión de crédito, pagos, inventario y cobranza para
clientes y administradores. La aplicación permite consultar saldos, registrar
pagos, aprobar consumos, revisar ciclos de cobro, gestionar stock y operar
desde navegador o como app instalable en dispositivos.

**Aplicación web:** https://rapid-bodegon-alexyanez1993-5085.vercel.app

## Estado actual de la app

La solución ya incluye varias mejoras y preparativos de producto que no estaban
en la versión inicial:

- PWA instalable con soporte offline y actualización automática.
- Empaquetado nativo para Android e iOS con Capacitor.
- Separación de bundles para optimizar carga inicial (Firebase, Recharts, XLSX).
- Preparación de Cloud Functions (Node 22) para backend server-side, sin
  conectarlas aún al cliente ni desplegarlas en producción.
- Soporte para temas claro/oscuro, importación de inventario y cierre de ciclos.
- Scripts de administración con Firebase Admin SDK para crear usuarios y
  mantener datos sensibles fuera del navegador.

## Stack

- React 19 + TypeScript + Vite 6.
- Tailwind CSS 4 para la interfaz.
- Firebase Authentication + Cloud Firestore.
- Recharts para dashboards y métricas administrativas.
- SheetJS (`xlsx`) para importación de inventario desde Excel/CSV.
- Vite PWA + Capacitor para app instalable y packaging nativo.
- Vercel para hosting de la web app.

La lógica de negocio central vive en `src/store/AppContext.tsx`; las vistas en
`src/views/`, los componentes reutilizables en `src/components/`, los tipos en
`src/types/` y la autorización en `firestore.rules`.

## Flujo principal

### Cliente

- Inicia sesión con nombre y PIN; la app normaliza el nombre y genera un correo
  sintético para Firebase Authentication. Ejemplo: `JUAN PEREZ` →
  `JUANPEREZ@rapidbodegon.local`.
- Consulta saldo pendiente en USD, su conversión a bolívares según la tasa
  global y el estado de cuenta.
- Revisa el próximo corte y los movimientos de su cuenta.
- Consulta datos bancarios de pago móvil/transferencia, con copia individual o
  copia masiva de todos los campos relevantes.
- Reporta pagos con monto y referencia; esos reportes quedan `PENDING` hasta
  su aprobación por parte del administrador.
- Consulta historial de pagos y consumos, y recibe onboarding y aviso de
  privacidad.
- Visualiza precios y productos disponibles, ocultando items sin stock.
- Puede alternar entre tema claro y oscuro.
- La app se comporta como PWA y puede instalarse en el escritorio o móvil.

El flujo para reportar consumo propio existe en código, pero hoy está
desactivado con `ENABLE_CONSUMPTION_REPORT = false` en `src/views/ClientView.tsx`.

### Administrador

- Revisa el crédito global por cobrar, la recaudación del ciclo actual y el
  estado de clientes.
- Busca clientes por nombre y revisa gráficos de ventas diarias.
- Registra consumos a crédito. La operación actualiza transacción, saldo del
  cliente y stock mediante una transacción de Firestore.
- Aprueba o rechaza pagos y solicitudes de consumo pendientes.
- Ajusta stock manualmente o importa `.xlsx`, `.xls` y `.csv` con columnas
  `PRODUCTO` y `STOCK`, y una columna opcional `PRECIO`.
- Actualiza la tasa de cambio, revisa histórico de ciclos y cierra períodos de
  cobro.
- Puede cambiar el tema visual y operar desde la misma experiencia web o la
  versión instalada como app.

## Ciclos de cobro

Los cortes se calculan en días fijos del mes y la app detecta el próximo corte
junto con días restantes. Cuando un administrador abre la vista de
administración, la aplicación revisa ciclos vencidos pendientes y consolida
pagos y consumos completados en el período.

La lógica espera los snapshots iniciales confirmados por el servidor y crea cada
cierre en una transacción solo si aún no existe. No es una tarea automatizada
por servidor; un administrador debe abrir la app después de un corte para
ponerla al día. La revisión se hace hasta 12 ciclos consecutivos, y se detiene
al encontrar uno ya cerrado.

## PWA y empaquetado nativo

### PWA

- `vite-plugin-pwa` configura la app como instalable y con actualización
  automática.
- Se registra un service worker con cache de recursos estáticos y cache Network
  First para llamadas de Firebase.
- La aplicación se puede instalar en escritorio y dispositivos móviles sin usar
  un store.

### Capacitor

- El proyecto está configurado para packaging nativo en Android e iOS.
- `capacitor.config.ts` define el identificador de la app y el directorio de
  salida web (`dist`).
- Los directorios `android/` e `ios/` ya existen y están listos para sincronizar
  y compilar con Capacitor.
- Los comandos principales son:

```bash
npm run build
npx cap sync
```

La app aún no está publicada en tiendas ni conectada a un flujo de distribución
nativo completo; esto queda como siguiente paso operativo.

## Cloud Functions y backend

Hay un scaffold de Cloud Functions en `functions/` preparado con Node.js 22 y
Firebase Functions v7. El código incluye validaciones de UID y acceso de admin,
pero la aplicación sigue operando con Firestore y la lógica del cliente actual
hasta que el backend se despliegue y valide en producción.

Este estado es intencional:

- No se conectan Callable Functions desde el cliente.
- No se despliegan reglas que dependan del backend antes de migrar y probar la
  experiencia completa.
- La notificación externa por CallMeBot queda aplazada y no se ejecuta en este
  repositorio.

## Datos de Firestore

| Colección | Campos principales |
|---|---|
| `users/{uid}` | `id`, `name`, `role` (`ADMIN` o `CLIENT`), `balanceUSD` |
| `products/{id}` | `id`, `name`, `priceUSD`, `stock` |
| `transactions/{id}` | `userId`, `type` (`CONSUMPTION` o `PAYMENT`), `amountUSD`, `date`, `status` (`PENDING`, `COMPLETED` o `REJECTED`), `productId?`, `quantity?`, `reference?` |
| `config/global` | `exchangeRate`, `cutoffDays`, `bankDetails` |
| `cycles/{id}` | `periodStart`, `periodEnd`, `totalCollected`, `totalConsumption`, `closedAt` |

## Seguridad y limitaciones actuales

`firestore.rules` restringe por rol el acceso a perfiles, productos,
configuración y ciclos. La documentación refleja el comportamiento que la app
espera y el estado operativo actual, pero la validación de la interfaz no
sustituye las reglas de Firestore.

Antes de confiar en producción:

- validar UID, tipo y estado en las reglas para transacciones;
- comprobar permisos de cliente y administrador con datos reales;
- confirmar que los scripts de Admin SDK solo se ejecutan en entorno autorizado.

La app no crea cuentas `ADMIN` desde el cliente; ese proceso se hace con scripts
server-side y credenciales de Application Default Credentials.

## Scripts administrativos

Los scripts de `scripts/` usan Firebase Admin SDK y se ejecutan fuera del
navegador. Para configurarlos, se recomienda:

```bash
gcloud auth application-default login
```

| Script | Uso |
|---|---|
| `create-admin.mjs` | Crear o actualizar cuenta admin y PIN: `node scripts/create-admin.mjs "ADMINISTRADOR" "pinSeguro" --project=rapidbodegon` |
| `reset-pin.mjs` | Cambiar PIN de un cliente sin tocar perfil ni saldo: `node scripts/reset-pin.mjs "JUAN PEREZ" "nuevoPinDe8Digitos" --project=rapidbodegon` |
| `seed-data.mjs` | Cargar productos iniciales y `config/global`: `node scripts/seed-data.mjs --project=rapidbodegon` |
| `import-products.mjs` | Reemplazar productos de prueba `p1` a `p8` con catálogo del script: `node scripts/import-products.mjs --project=rapidbodegon` |

El importador asigna un stock inicial de 100 unidades. Revisa los cambios antes
de operar y ajusta existencias desde el panel de inventario si se requiere
contenido real del negocio.

## Desarrollo local

Requiere Node.js, Firebase Auth (Email/Password) y Firestore. La configuración
se carga desde `firebase-applet-config.json` a través de `src/firebase.ts` y
debe apuntar al proyecto correcto.

```bash
npm install
npm run dev
npm run build
npm run analyze
```

### Scripts disponibles

- `npm run dev`: arranque del entorno de desarrollo.
- `npm run build`: build de producción de la app.
- `npm run analyze`: genera `dist/stats.html` para revisar tamaño y chunks.
- `npm run cap:sync`: compila y sincroniza cambios con Capacitor.
- `npm --prefix functions run build`: compila Cloud Functions.

El build de producción se genera en `dist/`. Vite separa en chunks Firebase,
Recharts y XLSX para reducir el peso inicial de la carga.

## Despliegue

- La web app está configurada para despliegue en Vercel desde la rama `main`.
- Un push inicia despliegue, pero se debe verificar el estado real antes de
  asumir que la versión está en producción.
- El dominio documentado sigue siendo `rapid-bodegon-alexyanez1993-5085.vercel.app`.
- La parte nativa Android/iOS queda lista para sincronizarse y compilarse, pero
  no implica publicación automática en stores.

## Documentación adicional

- `memory.md`: contexto técnico, stack y arquitectura del repositorio.
- `agent.md`: pautas internas de trabajo para futuras modificaciones.

## Licencia

Apache-2.0