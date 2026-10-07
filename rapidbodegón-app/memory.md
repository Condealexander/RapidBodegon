# Memoria del repositorio

## Stack y comandos
- React 19, TypeScript, Vite 6 y Tailwind CSS 4.
- Firebase Authentication y Cloud Firestore; la app se mantiene como frontend con lógica de negocio en cliente, sin backend operativo activo.
- Vercel publica producción desde `main` (confirmar el estado del despliegue antes de asumir que un push ya está disponible).
- PWA con `vite-plugin-pwa` para instalar la aplicación y usarla sin conexión.
- Capacitor para empaquetado nativo en Android e iOS.
- Desarrollo: `npm run dev`.
- Build de producción: `npm run build`.
- `npm run analyze` genera `dist/stats.html` con detalle de chunks y peso.
- `npm run cap:sync` compila y sincroniza la app con Capacitor.
- `package.json` no define un script de pruebas automatizadas.
- `functions/` tiene scaffolding de Cloud Functions Node 22 listo para backend server-side, pero no conectado al cliente ni desplegado.

## Arquitectura
- `src/store/AppContext.tsx` concentra estado compartido, autenticación y operaciones de negocio de Firestore.
- `src/views/` contiene las vistas de cliente, administración e inicio de sesión.
- `src/components/index.tsx` exporta los componentes UI compartidos; componentes especializados están en `src/components/`.
- `src/types/index.ts` define usuarios, productos, transacciones y configuración.
- `src/main.tsx` registra el service worker PWA y configura la app instalada.
- `vite.config.ts` incluye `VitePWA`, chunk splitting y optimización por bundle.
- `capacitor.config.ts` prepara el empaquetado nativo de la web app.
- `firestore.rules` es la fuente de autorización del cliente; el acceso administrativo de scripts usa Firebase Admin SDK.
- `functions/src/index.ts` está preparado para validar UID y permisos de admin, pero la app continua usando Firestore directamente hasta migrar al backend.

## Dominio y datos
- Los roles son `ADMIN` y `CLIENT`; el cliente entra con nombre y PIN. `AppContext.tsx` normaliza el nombre para generar un correo sintético de Firebase Auth.
- Colecciones principales: `users/{uid}`, `products/{id}`, `transactions/{id}`, `config/global` y `cycles/{id}`.
- Los pagos reportados comienzan como `PENDING`; solo un administrador debe aprobarlos o rechazarlos.
- Los consumos y pagos afectan saldos y stock. Mantener estas operaciones coherentes con las reglas de Firestore y las transacciones atómicas que ya usa el contexto.
- Los cierres de ciclos se ponen al día cuando un administrador abre la app; esperan snapshots iniciales del servidor y se crean con transacción solo si el documento del ciclo no existe.
- El historial de crédito y consumo se calcula en base a transacciones y cierres, con gestión de saldo y stock en la misma operación.
- La app soporta importación de inventario desde `.xlsx`, `.xls` y `.csv` en el panel administrativo.

## Tema visual
- `useTheme.ts` centraliza la preferencia `rb_theme`, la aplica en `data-theme` y la persiste en `localStorage`; `main.tsx` la inicializa antes del primer render. Login permite elegir el tema y `ThemeToggle.tsx` lo cambia en las vistas autenticadas.
- `main.tsx` importa `theme-overrides.css`; el tema claro adapta las clases Tailwind existentes mediante overrides CSS, incluidos los textos y estados de ClientView y AdminView.
- Login, ClientView y AdminView comparten una identidad visual de azul profundo con acentos ámbar y verde. AdminView usa estilos scoped `.admin-view` para superficies, botones, inputs, gráficas y feedback en tema claro; mantener esta convención al añadir nuevas funciones administrativas.
- Al añadir estilos de texto, fondos o controles, comprobar ambos temas y actualizar los overrides necesarios. Los inputs requieren contraste tanto para el texto escrito como para el placeholder.
- El comportamiento visual debe seguir funcionando tanto en la web PWA como en el empaquetado nativo.

## Seguridad y operaciones
- No exponer credenciales de Firebase Admin ni incluir secretos en el bundle del cliente.
- Los scripts administrativos con Firebase Admin SDK deben ejecutarse solo en entornos autorizados y nunca desde el navegador.
- Se debe mantener la autorización tanto en `AppContext.tsx` como en `firestore.rules`.
- Las cuentas `ADMIN` se crean o actualizan mediante scripts server-side; no desde código del cliente.
- El backend server-side de Firebase Functions está preparado, pero no conectado ni desplegado: no se debe activar cliente ni reglas dependientes antes de validar la migración.

## Mantenimiento
- `README.md` describe el producto y el modelo actual; validar siempre la implementación antes de tomar decisiones basadas en esa documentación.
- Los cambios de backend, PWA o nativo deben revisarse junto con la configuración de Vite, Capacitor y Firebase para no romper la app instalada o el despliegue web.
- Antes de asumir producción, verificar el estado real del despliegue y el comportamiento con roles y datos reales.
