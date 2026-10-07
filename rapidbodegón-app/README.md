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
- Carga diferida de las vistas de cliente y administración; gráficos y XLSX se
  descargan con el panel, y XLSX solo al solicitar una importación.
- Registro del service worker después de la carga inicial de la página para
  reducir trabajo durante el arranque, manteniendo la precarga PWA para uso offline.
- Actualización diaria de la tasa de cobro desde DolarApi al abrir el panel
  administrativo, con opción de ajuste manual y registro de origen/hora.
- Preparación de Cloud Functions (Node 22) para backend server-side, sin
  conectarlas aún al cliente ni desplegarlas en producción.
- Soporte para temas claro/oscuro, importación de inventario y cierre de ciclos.
- Selección del tema claro/oscuro disponible desde el inicio de sesión; la
  preferencia guardada se conserva al entrar en la vista de cliente o admin.
- El panel administrativo comparte la identidad visual del inicio de sesión y
  ClientView, con adaptaciones para modo claro, gráficos y estados.
- Scripts de administración con Firebase Admin SDK para crear usuarios y
  mantener datos sensibles fuera del navegador.
- Aviso visible de conexión offline y de día de corte para clientes con saldo
  pendiente; el inicio incluye una animación temática de productos de bodega.

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
  su aprobación por parte del administrador. La referencia acepta de 4 a 6
  dígitos y no se puede reutilizar mientras otro reporte con esa referencia no
  esté rechazado.
- Consulta historial de pagos y consumos, y recibe onboarding y aviso de
  privacidad.
- Visualiza precios y productos disponibles, ocultando items sin stock.
- Puede alternar entre tema claro y oscuro.
- Elige tema claro u oscuro desde Login; la selección se guarda en el navegador
  y se mantiene al entrar a ClientView. Si aún no ha elegido, se usa el tema
  oscuro.
- La app se comporta como PWA y puede instalarse en el escritorio o móvil.
- En un día de corte, si mantiene saldo pendiente, ve un aviso con el monto y
  un acceso directo al formulario para reportar el pago.
- Si el navegador informa que no hay conexión, ve un aviso de modo offline.

El flujo para reportar consumo propio existe en código, pero hoy está
desactivado con `ENABLE_CONSUMPTION_REPORT = false` en `src/views/ClientView.tsx`.

### Administrador

- Revisa el crédito global por cobrar, la recaudación del ciclo actual y el
  estado de clientes.
- Al seleccionar un cliente desde el directorio, consulta sus consumos
  completados del ciclo vigente con fecha, producto, cantidad e importe.
- Registra egresos administrativos en USD con descripción, consulta los últimos
  50 movimientos y ve el recaudado neto del ciclo y el disponible global
  acumulado, con su equivalente en Bs. Los egresos no modifican el inventario.
- Busca clientes por nombre y revisa gráficos de ventas diarias.
- Registra consumos a crédito. La operación actualiza transacción, saldo del
  cliente y stock mediante una transacción de Firestore.
- Aprueba o rechaza pagos y solicitudes de consumo pendientes.
- Ajusta varios stocks manualmente y guarda los cambios juntos con un solo
  botón, o importa `.xlsx`, `.xls` y `.csv` con columnas `PRODUCTO` y `STOCK`,
  y una columna opcional `PRECIO`.
- La tasa se consulta automáticamente como máximo una vez por día de Venezuela
  al abrir el panel. Se usa el promedio de las tasas oficial y paralela de
  DolarApi cuando ambas están disponibles; si solo hay una, se usa esa. El
  administrador también puede actualizarla manualmente. La pantalla muestra
  origen y hora de la última actualización; si falla la consulta automática, se
  conserva la tasa guardada.
- Revisa el histórico de ciclos y cierra períodos de cobro.
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
- El registro del service worker se difiere hasta que termina la carga inicial
  de la página, con una espera breve adicional.
- Se registra un service worker con cache de recursos estáticos y cache Network
  First para llamadas de Firebase.
- La aplicación se puede instalar en escritorio y dispositivos móviles sin usar
  un store.
- Las vistas de cliente y administración se cargan bajo demanda. Los chunks
  diferidos siguen incluidos en la precarga offline del service worker.

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
| `expenses/{id}` | `description`, `amountUSD`, `date`, `createdBy`; registros administrativos inmutables |
| `financials/global` | `initialized`, `totalCollectedUSD`, `totalExpensesUSD`, `updatedAt`; acumulados financieros actualizados junto con pagos aprobados y egresos |

## Seguridad y limitaciones actuales

`firestore.rules` restringe por rol el acceso a perfiles, productos,
configuración y ciclos. La documentación refleja el comportamiento que la app
espera y el estado operativo actual, pero la validación de la interfaz no
sustituye las reglas de Firestore.

El disponible global se calcula a partir del acumulado persistente de pagos
aprobados menos egresos, no de la lista del panel que limita el historial de
transacciones a 1.000 documentos. Antes de habilitar esta versión en un
proyecto existente, inicializa una sola vez los acumulados con credenciales
autorizadas de Firebase Admin. Coordina una breve ventana sin aprobaciones:
publica primero las reglas que exigen la actualización atómica del agregado,
ejecuta la migración y luego habilita el cliente actualizado.

```bash
npm run migrate-financials -- --project=rapidbodegon
```

El script suma todos los pagos completados existentes y egresos ya registrados,
crea `financials/global` y se niega a sobrescribir un acumulado inicializado.
Desde entonces, aprobar un pago o registrar un egreso actualiza su movimiento y
el acumulado correspondiente en una misma transacción de Firestore. Las reglas
permiten lectura de estos datos solo a ADMIN; los egresos no se pueden editar ni
borrar desde el cliente.

El neto del ciclo vigente es la suma de pagos completados desde el último corte
menos los egresos del mismo período. El disponible global es acumulado entre
ciclos y no se reinicia al corte. En el panel, el historial del cliente lista
solo sus consumos completados desde el corte vigente.

La inicialización de Firebase App Check está temporalmente desactivada en el
cliente: la carga de reCAPTCHA fallaba en producción e impedía usar Firestore.
App Check no está actualmente en modo `Enforced`; antes de habilitarlo o
endurecerlo, hay que corregir y verificar su inicialización en producción.

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
| `migrate-financials.mjs` | Inicializar una sola vez `financials/global` desde pagos y egresos existentes: `npm run migrate-financials -- --project=rapidbodegon` |

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
- En VS Code, ejecuta la tarea `RapidBodegón: Vite dev server` desde el workspace raíz para iniciar Vite en el puerto 5173.
- `npm run build`: build de producción de la app.
- `npm run analyze`: genera `dist/stats.html` para revisar tamaño y chunks.
- `npm run cap:sync`: compila y sincroniza cambios con Capacitor.
- `npm --prefix functions run build`: compila Cloud Functions.

El build de producción se genera en `dist/`. Vite separa en chunks Firebase,
el panel administrativo (incluidos sus gráficos) y XLSX. El parser XLSX se
solicita al elegir un archivo. El service worker mantiene la precarga de todos
los recursos de producción para conservar los flujos offline.

### Medición local de carga

Medición del build con `npm run analyze` el 5 de octubre de 2026, comparando la
referencia antes de optimizar con el mismo entorno después del cambio. Los
tamaños son los de Vite con gzip; el total inicial suma los scripts vinculados
por `index.html`, no incluye CSS ni representa una medición de red real.

| Scripts vinculados al inicio | Antes | Después |
|---|---:|---:|
| App (`index`) | 86.54 kB | 90.33 kB |
| Firebase (app, auth, Firestore y dependencias) | 172.67 kB | 172.67 kB |
| Recharts | 112.09 kB | diferido con el panel admin |
| **Total inicial aproximado** | **371.30 kB** | **263.00 kB** |

El grafo inicial del HTML ya no descarga Recharts: reducción aproximada de
108.30 kB (29 %) en JavaScript vinculado al inicio. Al entrar como admin, el
chunk del panel incluye Recharts. XLSX se descarga al solicitar una importación,
no al abrir el panel.

La PWA conserva la precarga offline de todos los chunks, también los diferidos;
por eso este cambio reduce los scripts vinculados al arranque de la página,
pero no el volumen total de una instalación/actualización inicial del service
worker. El informe `dist/stats.html` se excluye de esa precarga: es un artefacto
de análisis, no un recurso de la aplicación. Los logs anteriores de `npm run
analyze` incluían ese informe y no permiten comparar correctamente el tamaño de
la precarga entre builds; el build normal posterior registró 18 entradas
(1835.23 KiB), incluidos los chunks diferidos para uso offline.

No se midieron LCP, INP o CLS ni la respuesta visual con datos representativos:
no había navegador automatizado ni dispositivo disponible en el entorno. Estos
tamaños de build no deben presentarse como Web Vitals ni como validación de
producción.

## Despliegue

- La web app está configurada para despliegue en Vercel desde la rama `main`.
- Un push inicia despliegue, pero se debe verificar el estado real antes de
  asumir que la versión está en producción.
- El dominio documentado sigue siendo `rapid-bodegon-alexyanez1993-5085.vercel.app`.
- La parte nativa Android/iOS queda lista para sincronizarse y compilarse, pero
  no implica publicación automática en stores.

## Documentación adicional

- `memory.md`: contexto técnico, stack y arquitectura del repositorio.
- `agent.md` y `.github/copilot-instructions.md`: pautas generales de trabajo.
- `.github/agents/*.agent.md`: instrucciones de los agentes especializados.

## Tema visual

Login, ClientView y AdminView comparten la paleta de azul profundo con acentos
ámbar y verde. ClientView y AdminView aplican fondos y estados con variantes
legibles en tema claro, incluidos textos de saldo, pagos, inventario, alertas y
errores. AdminView adapta también los ejes, cuadrículas y tooltips de sus
gráficos.

Al agregar funciones a AdminView, mantenerlas dentro del scope `.admin-view` y
reutilizar tarjetas y controles compartidos. Usar el acento ámbar para acciones
principales; reservar verde para confirmar/aprobar y rojo para rechazar o
errores. Comprobar ambos temas, estados hover/focus/disabled y el contraste de
textos, formularios y gráficos. Las transiciones de botones respetan
`prefers-reduced-motion`.

ClientView y AdminView conservan interacciones suaves de foco, hover y pulsación;
se desactivan las transiciones y transformaciones cuando el dispositivo solicita
movimiento reducido.

El tema se aplica al iniciar la app a partir de `rb_theme` en `localStorage`,
antes de renderizar la interfaz para evitar un destello de tema incorrecto. La
misma preferencia la usan el selector de Login y el toggle de las vistas
autenticadas. Sin valor guardado o si el almacenamiento no está disponible, el
tema predeterminado es oscuro.

## Política obligatoria de documentación

Cada cambio en el repositorio debe actualizar este README en la misma tarea,
tanto si lo realiza una persona como si lo realiza un agente. Esto incluye
cambios de funcionalidad, interfaz, reglas, datos, scripts, dependencias,
configuración y pautas de agentes. Documenta el comportamiento nuevo en la
sección correspondiente y registra también los cambios de mantenimiento o de
agentes que no alteren la aplicación, sin atribuirles efectos funcionales.

Antes de solicitar o dar autorización para crear un commit, revisa el diff
completo contra este README. Toda función nueva, cambio de flujo, validación,
operación o limitación debe estar descrita donde corresponda; si falta, actualiza
el README primero. La revisión de commit debe indicar explícitamente si la
documentación ya cubre el cambio o qué se añadió. No crear el commit sin cerrar
esa comprobación.

## Historial de actualizaciones recientes

- **2026-10-06:** se agregó la actualización diaria de la tasa desde DolarApi
  (promedio oficial/paralelo cuando ambas fuentes están disponibles), el aviso
  de día de corte con saldo pendiente y los controles de formato y duplicados
  para referencias de pago; también se difirió la carga de vistas y del service
  worker. App Check quedó temporalmente desactivado porque reCAPTCHA bloqueaba
  Firestore en producción.
- **2026-10-06 a 2026-10-07:** se mejoró la presentación de inicio de sesión con
  animación temática y se ajustó el texto de sus mensajes. También se añadió el
  agente especializado UX Expert y se incorporó su alcance a la documentación
  de agentes.
- **2026-10-07:** se establece como requisito actualizar este README ante cada
  cambio del repositorio y comprobar la cobertura documental antes de autorizar
  un commit.
- **2026-10-07:** se añade selección de tema en Login, se comparte la preferencia
  `rb_theme` al entrar a ClientView y se alinean sus colores, controles y estados
  con la paleta del inicio de sesión, con overrides legibles en modo claro y
  respeto por `prefers-reduced-motion`.
- **2026-10-07:** se extiende la misma identidad visual a AdminView, incluidos
  gráficos, controles y estados de modo claro. Se documentan convenciones para
  que nuevas funciones administrativas mantengan la paleta y accesibilidad.
- **2026-10-07:** AdminView permite revisar consumos completados del cliente en
  el ciclo vigente y registrar egresos en USD. Los egresos se descuentan del
  recaudado neto del ciclo y del disponible global acumulado; se agregan el
  ledger financiero y su inicialización única con Admin SDK.

## Licencia

Apache-2.0