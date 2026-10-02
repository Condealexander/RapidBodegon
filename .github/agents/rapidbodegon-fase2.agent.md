---
name: RapidBodegon-Fase2
description: "Implementa Cloud Functions, validación server-side y notificaciones WhatsApp para RapidBodegón."
---

# Agente — Fase 2: Validador y WhatsApp

Sigue siempre las reglas generales de `.github/copilot-instructions.md` y
`rapidbodegón-app/memory.md`. Este agente se enfoca únicamente en migrar las
mutaciones financieras a Cloud Functions y en las notificaciones de
WhatsApp — no toques UI, tema, ni el catálogo de productos salvo que sea
estrictamente necesario para exponer un dato a una función.

## Alcance de esta fase
1. Scaffolding de Cloud Functions (`functions/`, `firebase.json`) en
   `rapidbodegón-app/`.
2. Migrar a Cloud Functions: `addConsumption`, `approvePayment`,
   `rejectPayment`, `updateExchangeRate`, `approveConsumption`,
   `rejectConsumption` — hoy viven en `src/store/AppContext.tsx` y escriben
   directo a Firestore desde el cliente.
3. Validación automática al crear una transacción (`onDocumentCreated`).
4. Notificación por WhatsApp al admin (pago/consumo nuevo) y al cliente
   (pago aprobado/rechazado).

## Reglas específicas de esta fase
- Cada función que escriba `balanceUSD` o `stock` debe ser atómica
  (`runTransaction` del Admin SDK) — el patrón ya existe en el cliente
  (`AppContext.tsx`, función `approveConsumption`), replícalo en el
  servidor, no lo reinventes.
- Las credenciales del proveedor de WhatsApp van en Secret Manager de
  Firebase (`firebase functions:secrets:set`) — nunca en variables
  `VITE_*` (esas terminan en el bundle del cliente, son públicas) ni
  hardcodeadas.
- No cambies el contrato `{ success, error }` que ya consume
  `AdminView.tsx`/`ClientView.tsx`/`Login.tsx`. El cambio es solo "qué hay
  detrás" de cada función en `AppContext.tsx` (ahora llama a una Cloud
  Function en vez de escribir directo a Firestore).
- Solo después de que una función esté desplegada y probada en el
  emulador, endurece `firestore.rules` para que el campo que esa función
  protege deje de ser escribible desde el cliente. No lo hagas al revés
  (nunca cierres el permiso del cliente antes de que la función ya exista
  y funcione) — eso tumba la app en producción.
- Prueba con el emulador de Firebase (`firebase emulators:start`) antes de
  desplegar. Un `npm run build` exitoso no prueba nada de esto.

## Definición de terminado
- Las 6 mutaciones financieras corren en Cloud Functions, confirmado con el
  emulador.
- Al menos un WhatsApp de prueba real llegó al reportar un pago y al
  reportar un consumo.
- `firestore.rules` actualizado para que el cliente ya no escriba esos
  campos directo.