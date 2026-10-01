# Memoria del repositorio

## Stack y comandos
- React 19, TypeScript, Vite 6 y Tailwind CSS 4.
- Firebase Authentication y Cloud Firestore; no hay servidor propio.
- Vercel publica producción desde `main` (confirmar el estado del despliegue antes de asumir que un push ya está disponible).
- Desarrollo: `npm run dev`.
- Build de producción: `npm run build`.
- `package.json` no define un script de pruebas automatizadas.

## Arquitectura
- `src/store/AppContext.tsx` concentra estado compartido, autenticación y operaciones de negocio de Firestore.
- `src/views/` contiene las vistas de cliente, administración e inicio de sesión.
- `src/components/index.tsx` exporta los componentes UI compartidos; componentes especializados están en `src/components/`.
- `src/types/index.ts` define usuarios, productos, transacciones y configuración.
- `firestore.rules` es la fuente de autorización del cliente; el acceso administrativo de scripts usa Firebase Admin SDK.

## Dominio y datos
- Los roles son `ADMIN` y `CLIENT`; el cliente entra con nombre y PIN. `AppContext.tsx` normaliza el nombre para generar un correo sintético de Firebase Auth.
- Colecciones principales: `users/{uid}`, `products/{id}`, `transactions/{id}`, `config/global` y `cycles/{id}`.
- Pagos reportados comienzan como `PENDING`; solo un administrador debe aprobarlos o rechazarlos.
- Los consumos y pagos afectan saldos y stock. Mantener estas operaciones coherentes con las reglas de Firestore y las transacciones atómicas que ya usa el contexto.
- Los cierres de ciclos se ponen al día cuando un administrador abre la app; esperan snapshots iniciales del servidor y se crean con transacción solo si el documento del ciclo no existe.

## Tema visual
- `ThemeToggle.tsx` establece `data-theme` en `<html>` y persiste la preferencia en `localStorage`.
- `main.tsx` importa `theme-overrides.css`; actualmente el tema claro adapta las clases Tailwind existentes mediante overrides CSS.
- Al añadir estilos de texto, fondos o controles, comprobar ambos temas y actualizar los overrides necesarios. Los inputs requieren contraste tanto para el texto escrito como para el placeholder.

## Mantenimiento
- `README.md` describe el producto y el modelo general, pero su sección de pendientes puede quedar desactualizada. Verificar siempre la implementación actual antes de basar cambios en esa sección.
- No exponer credenciales de Firebase Admin ni incluir secretos en el bundle del cliente.
