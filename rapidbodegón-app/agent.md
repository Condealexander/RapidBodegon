---
name: RapidBodegon
description: "Asistente para desarrollar y mantener la aplicación RapidBodegón."
---
# Pautas de trabajo para el agente

Estas pautas documentan cómo realizar cambios en RapidBodegón. Para detalles del stack y el modelo, consultar también `memory.md`.

## Antes de modificar
- Localizar el componente, función o regla que realmente controla el comportamiento y revisar sus llamadas y tipos cercanos.
- Mantener los cambios acotados y respetar las APIs y convenciones ya existentes.
- Tratar `README.md` como orientación; confirmar en el código si una función o pendiente sigue vigente.

## Reglas del dominio
- No debilitar `firestore.rules` para resolver problemas de UI o permisos.
- Mantener autorización y validaciones tanto en las operaciones de `AppContext.tsx` como en Firestore Rules.
- No crear cuentas ADMIN desde código ejecutado en el cliente ni exponer credenciales del Admin SDK.
- En operaciones financieras o de inventario, preservar atomicidad, estados de transacción y cálculos de saldo/stock. No sobrescribir cierres de ciclo ya existentes.

## Interfaz y tema
- Reutilizar componentes de `src/components/` y seguir la estructura de vistas existente.
- El tema se implementa con `data-theme` y `src/theme-overrides.css`; no asumir que una clase Tailwind nueva se adapta automáticamente al tema claro.
- Comprobar contraste de texto, placeholders, inputs y estados visibles en tema claro y oscuro.

## Validación
- Ejecutar `npm run build` desde la raíz de esta app para validar la compilación.
- El proyecto no declara un script de pruebas automatizadas; indicar claramente cuando un flujo de Firebase o una interacción visual no se pudo probar en vivo.
- Después de cambios a reglas o datos, comprobar también el comportamiento con los roles y documentos afectados; un build exitoso no valida reglas de Firestore.
- No afirmar que producción está actualizada solo porque el cambio compila o existe un commit; el despliegue debe completarse y verificarse por separado.

## Cloud Functions
- Las funciones de segunda generación están preparadas en `functions/` (Node.js 22), pero no están conectadas al cliente ni desplegadas. Compilar con `npm --prefix functions run build`.
- La aplicación continúa usando sus operaciones Firestore existentes hasta que se pueda desplegar y verificar un backend. No conectar las Callable Functions ni desplegar reglas que las requieran antes de migrar y probar el cliente.
- CallMeBot está aplazado: no hay llamadas externas ni secretos de CallMeBot en el código. Retomar notificaciones cuando se elija backend y canal, y guardar credenciales solo en el gestor de secretos de ese backend.
- El despliegue de Functions requiere un proyecto Firebase habilitado para facturación Blaze. Antes de desplegar, migrar el cliente, validar reglas con el emulador y confirmar el backend elegido. Un build local no acredita un despliegue.
