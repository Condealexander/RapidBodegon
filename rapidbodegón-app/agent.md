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
- Las funciones de segunda generación están en `functions/` (Node.js 22). Compilar con `npm --prefix functions run build`.
- Probar localmente con `firebase emulators:start --only functions,firestore,auth --project=rapidbodegon` desde la raíz de la app y `VITE_USE_FIREBASE_EMULATORS=true` en el entorno del cliente.
- Configurar los secretos antes del despliegue: `firebase functions:secrets:set CALLMEBOT_API_KEY --project=rapidbodegon` y `firebase functions:secrets:set CALLMEBOT_PHONE --project=rapidbodegon`. No guardar sus valores en archivos ni en el cliente.
- Para emular las notificaciones, proporcionar esos mismos parámetros en `functions/.secret.local` (ignorado por Git); no añadir ese archivo al repositorio.
- El emulador omite deliberadamente los envíos a WhatsApp para no contactar al proveedor ni transmitir datos de prueba; valida la entrega en un entorno controlado con credenciales de prueba antes de producción.
- Desplegar con `firebase deploy --only functions,firestore:rules,firestore:indexes --project=rapidbodegon`. Las reglas retiran todas las escrituras del cliente a transacciones, saldos, tasa de cambio y stock; probar con el emulador antes de producción.
- Configurar los secretos y verificar el envío en un entorno controlado antes de esperar notificaciones de WhatsApp. El despliegue de Functions requiere acceso al proyecto Firebase; un build local no acredita que se hayan desplegado.
