# Instrucciones para trabajar en RapidBodegón

Para tareas relacionadas con la aplicación, consulta `rapidbodegón-app/memory.md` cuando necesites contexto sobre arquitectura, datos, comandos o convenciones del repositorio.

Estas instrucciones aplican a cualquier agente que modifique este repositorio (Copilot coding agent, Claude Code, u otro), y también a la revisión de cualquier Pull Request, sin importar quién lo haya abierto.

## Arquitectura y límites activos
- La aplicación está en `rapidbodegón-app/`; ejecuta desde allí los comandos de npm de la app. `App.tsx` monta `AppProvider` y selecciona Login, ClientView o AdminView según la sesión y el rol; las vistas autenticadas se cargan de forma diferida.
- `src/store/AppContext.tsx` concentra autenticación, suscripciones a Firestore y operaciones de negocio compartidas. `src/types/` define los modelos; `src/utils/` contiene lógica reutilizable como fechas de ciclos.
- El cliente aún realiza las operaciones directamente en Firestore. `firestore.rules` es la autorización efectiva; `functions/` es un scaffold separado y no está conectado al cliente ni desplegado. No migres un flujo a Functions ni dependas de sus reglas sin migrar y validar el flujo completo.
- Mantén juntos en una transacción de Firestore los cambios de saldo, stock, transacción y acumulados financieros que formen parte de una misma operación. Relee precio y stock desde Firestore en esa transacción; no tomes como autoritativos valores calculados en el cliente.
- La PWA y los bundles web se configuran en `vite.config.ts`; `src/main.tsx` registra el service worker y `capacitor.config.ts` enlaza el build web con Android/iOS. Un cambio de arranque, assets o caché puede afectar tanto web como los paquetes nativos.
- El tema se inicializa en `src/components/useTheme.ts` mediante `data-theme`; los ajustes del tema claro están en `src/theme-overrides.css`. Para estilos de AdminView, conserva el scope `.admin-view`.
- `.vscode/mcp.json` configura Playwright MCP para validación visual y flujos en navegador cuando esté disponible; no sustituye la validación de reglas y permisos de Firestore.

## Comandos
Desde `rapidbodegón-app/`:

```bash
npm run dev
npm run build
npm run analyze
npm run cap:sync
npm --prefix functions run build
```

`npm run build` valida el frontend; el comando de Functions compila su TypeScript por separado. No hay scripts de lint ni un runner/archivo de pruebas del proyecto, así que no existe un comando de suite ni de prueba individual. No indiques que un build valida Firestore Rules, interacciones en vivo o un despliegue.

## Antes de modificar
- Localiza el componente, función o regla que realmente controla el comportamiento y revisa sus llamadas y tipos cercanos.
- Mantén los cambios acotados y respeta las APIs y convenciones existentes.
- **Scripts administrativos protegidos:** no edites, formatees, muevas, renombres ni elimines archivos bajo `rapidbodegón-app/scripts/`, incluido `recalc-balances.mjs`, salvo autorización explícita del usuario/mantenedor para cambiar esos scripts. Una petición general de arreglar, revisar o documentar no es autorización para alterarlos. Si el cambio está autorizado, conserva el alcance exacto solicitado y exige revisión del CODEOWNER y la aprobación CI configurada para esa ruta.
- Trata `rapidbodegón-app/README.md` como orientación y confirma en el código si una función o pendiente sigue vigente.
- Es obligatorio actualizar `rapidbodegón-app/README.md` en la misma tarea por cada cambio del repositorio, lo haga una persona o un agente. Documenta los cambios funcionales en su sección y registra los cambios técnicos, de mantenimiento o de agentes en el historial, sin inventar efectos de producto.
- Antes de solicitar o dar autorización para crear un commit, revisa el diff completo y valida explícitamente si el README ya documenta cada cambio o si hacen falta entradas nuevas (en especial para funciones, flujos y validaciones). Actualiza primero lo que falte y no crees el commit hasta cerrar esta comprobación.

## Reglas del dominio
- No debilites `rapidbodegón-app/firestore.rules` para resolver problemas de UI o permisos.
- Mantén autorización y validaciones tanto en `src/store/AppContext.tsx` como en Firestore Rules.
- No crees cuentas ADMIN desde código ejecutado en el cliente ni expongas credenciales del Admin SDK.
- En operaciones financieras o de inventario, preserva atomicidad, estados de transacción y cálculos de saldo/stock. No sobrescribas cierres de ciclo ya existentes.
- Cualquier función que modifique `balanceUSD` o `stock` fuera de un `runTransaction` de Firestore es sospechosa — justifícalo explícitamente o corrígelo.
- No confíes en un monto o cantidad que vino directo del cliente sin recalcularlo con el precio/stock real leído de Firestore en ese momento.

## Secretos y dependencias
- Ningún archivo de credenciales (`service-account.json`, `.env` con valores reales, claves privadas) debe aparecer en un diff.
- Cualquier variable con prefijo `VITE_` es pública (termina en el bundle del navegador) — nunca pongas ahí algo que deba ser secreto.
- Los scripts en `scripts/*.mjs` (Admin SDK) nunca deben importarse desde código bajo `src/`.
- Antes de agregar o actualizar una dependencia para "arreglar una vulnerabilidad", confirma que la versión final no sea un downgrade silencioso de algo crítico (ej. Firebase) sin mencionarlo explícitamente. Señala cualquier script `postinstall`/`preinstall` nuevo en una dependencia agregada.

## Interfaz y tema
- Reutiliza componentes de `rapidbodegón-app/src/components/` y sigue la estructura de vistas existente.
- El tema se implementa con `data-theme` y `rapidbodegón-app/src/theme-overrides.css`; no asumas que una clase Tailwind nueva se adapta automáticamente al tema claro.
- Comprueba contraste de texto, placeholders, inputs y estados visibles en tema claro y oscuro.

## Validación
- Ejecuta `npm run build` desde `rapidbodegón-app/` para validar la compilación.
- El proyecto no declara un script de pruebas automatizadas; indica claramente cuando un flujo de Firebase o una interacción visual no se pudo probar en vivo.
- Después de cambios a reglas o datos, comprueba el comportamiento con los roles y documentos afectados; un build exitoso no valida reglas de Firestore.
- No afirmes que producción está actualizada solo porque el cambio compila o existe un commit; el despliegue debe completarse y verificarse por separado.

## Al revisar un Pull Request (de cualquier autor, incluido otro agente)
- Señala cualquier `allow read/write` de `firestore.rules` que se haya vuelto más permisivo.
- Señala cualquier uso nuevo de `dangerouslySetInnerHTML`, `eval(`, `innerHTML =` o `document.write`.
- Si el PR toca `addConsumption`, `approvePayment`, `rejectPayment`, `approveConsumption`, `rejectConsumption`, `updateExchangeRate` o `updateProductStock`: exige que el autor explique cómo probó el caso de doble clic / ejecución concurrente.
- Si no encuentras nada de lo anterior, dilo explícitamente en el resumen en vez de quedarte en silencio sobre esas categorías.