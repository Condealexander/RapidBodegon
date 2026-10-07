# Instrucciones para trabajar en RapidBodegón

Para tareas relacionadas con la aplicación, consulta `rapidbodegón-app/memory.md` cuando necesites contexto sobre arquitectura, datos, comandos o convenciones del repositorio.

Estas instrucciones aplican a cualquier agente que modifique este repositorio (Copilot coding agent, Claude Code, u otro), y también a la revisión de cualquier Pull Request, sin importar quién lo haya abierto.

## Antes de modificar
- Localiza el componente, función o regla que realmente controla el comportamiento y revisa sus llamadas y tipos cercanos.
- Mantén los cambios acotados y respeta las APIs y convenciones existentes.
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