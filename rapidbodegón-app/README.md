# RapidBodegón

Sistema de gestión de crédito y cobranza para un bodegón interno. Los clientes
consumen a crédito, reportan sus pagos, y el administrador concilia todo desde
un panel central.

**App en producción:** https://rapid-bodegon-alexyanez1993-5085.vercel.app

---

## Stack

- **Frontend:** React + TypeScript, empaquetado con Vite
- **Estilos:** Tailwind CSS
- **Backend:** Firebase (Authentication + Firestore), sin servidor propio
- **Gráficos:** Recharts (solo en el panel de admin)
- **Importación de inventario:** SheetJS (`xlsx`)
- **Hosting:** Vercel

No hay backend propio: toda la lógica de negocio vive en el cliente
(`src/store/AppContext.tsx`) y se apoya en las reglas de seguridad de
Firestore para que cada usuario solo pueda hacer lo que le corresponde.

---

## Cómo iniciar sesión

No se usa email real. Cada persona se identifica con **Nombre + PIN**, y por
debajo eso se traduce a un correo sintético para Firebase Auth:

```
JUAN PEREZ  →  JUANPEREZ@rapidbodegon.local
```

El PIN mínimo es de **8 caracteres**. La cuenta `ADMIN` nunca se crea desde
la app — se crea y se rota con un script server-side (ver más abajo).

---

## Roles

### CLIENTE
- Ve su saldo pendiente en USD y en bolívares (según la tasa del día).
- Ve los datos de pago móvil / transferencia del negocio.
- Reporta un pago (queda `PENDING` hasta que el admin lo valida).
- Ve el historial de sus propios consumos y de sus pagos reportados.

### ADMIN
- Ve el crédito global por cobrar, lo recaudado, y el estado de todos los clientes.
- Gráficos de ventas diarias y top 5 clientes por consumo.
- Carga el consumo de un cliente (descuenta stock, suma su deuda).
- Aprueba o rechaza pagos reportados.
- Ajusta el stock manualmente o lo importa desde un Excel/CSV.
- Ajusta la tasa de cambio.

La cuenta `ADMIN` se crea una sola vez con `scripts/create-admin.mjs` y nunca
a través del cliente — así su contraseña nunca viaja en el bundle de JS que
descarga el navegador.

---

## Modelo de datos (Firestore)

| Colección | Descripción |
|---|---|
| `users/{uid}` | `{ id, name, role: 'ADMIN'\|'CLIENT', balanceUSD }` |
| `products/{id}` | `{ id, name, priceUSD, stock }` |
| `transactions/{id}` | `{ id, userId, type: 'CONSUMPTION'\|'PAYMENT', amountUSD, date, status: 'PENDING'\|'COMPLETED'\|'REJECTED', productId?, quantity?, reference? }` |
| `config/global` | `{ exchangeRate, cutoffDays, bankDetails }` |

**Reglas de seguridad** (`firestore.rules`), resumidas:
- Un cliente solo puede leer y escribir su propio documento en `users`.
- Un cliente puede crear un `PAYMENT` propio en `PENDING`, nunca marcarlo `COMPLETED`.
- Solo el admin puede aprobar/rechazar transacciones, escribir en `products` y `config`.
- Todo lo que no está explícitamente permitido, se deniega por defecto.

---

## Scripts administrativos

Viven en `scripts/`, usan el **Firebase Admin SDK** (bypasean las reglas de
Firestore) y corren desde tu máquina o Codespace, nunca desde el navegador.
Requieren haber corrido antes:

```bash
gcloud auth application-default login
```

| Script | Uso |
|---|---|
| `create-admin.mjs` | Crea la cuenta ADMIN o rota su PIN. `node scripts/create-admin.mjs "ADMINISTRADOR" "unPinDe8Digitos" --project=rapidbodegon` |
| `reset-pin.mjs` | Resetea el PIN de un **cliente** que lo olvidó, sin tocar su rol ni su saldo. `node scripts/reset-pin.mjs "JUAN PEREZ" "nuevoPinDe8Digitos" --project=rapidbodegon` |
| `seed-data.mjs` | Siembra el catálogo inicial de productos y `config/global`. `node scripts/seed-data.mjs --project=rapidbodegon` |

---

## Desarrollo local

```bash
npm install
npm run dev
```

Necesitas un archivo de configuración de Firebase (`src/firebase.ts`) apuntando
a tu propio proyecto de Firebase, con Authentication (Email/Password) y
Firestore habilitados.

### Build de producción

```bash
npm run build
```

`vite.config.ts` separa `recharts` y `xlsx` en chunks aparte (`manualChunks`),
así un cliente normal —que nunca entra al panel de admin— no los descarga.

---

## Deploy

Desplegado en Vercel, rama `main` → producción automática. En **Settings →
Deployment Protection** está en modo **Standard Protection** (protege las
URLs de preview/deployment individuales, pero deja abierto el dominio de
producción para que los clientes puedan entrar sin loguearse en Vercel).

Dominio de producción actual: `rapid-bodegon-alexyanez1993-5085.vercel.app`
(el sufijo viene del team de Vercel; se puede reemplazar por un dominio
propio más adelante conectándolo en el mismo proyecto).

---

## Estado actual / pendientes conocidos

- **Reporte de consumo por el cliente:** el código existe completo
  (`requestConsumption` en `AppContext.tsx`, tarjeta "Reportar lo que tomé"
  en `ClientView.tsx`, tarjeta "Consumos por Confirmar" en `AdminView.tsx`),
  pero está **desactivado a propósito** detrás de un flag mientras se decide
  darle más control al flujo:
  ```typescript
  // src/views/ClientView.tsx
  const ENABLE_CONSUMPTION_REPORT = false;
  ```
  Para reactivarlo: poner el flag en `true` y volver a permitir `CONSUMPTION`
  en el `allow create` de `transactions` en `firestore.rules` (ver el
  historial de commits para la regla exacta).
- **"Próximo corte de cobro"** (`config.cutoffDays`) es un número fijo, no
  una fecha real — siempre muestra el mismo valor, no cuenta regresiva de
  verdad. Falta un campo tipo `nextCutoffDate` para que sea funcional.
- **"Recaudado (Ciclo Actual)"** en el panel de admin suma *todos* los pagos
  históricos, no solo los del ciclo actual — no hay todavía un concepto de
  cierre de ciclo.
- **Sin recuperación de PIN por el cliente mismo** (usa `reset-pin.mjs`, a
  pedido, hasta que exista un flujo propio).
- **Sin backups automáticos de Firestore** configurados todavía.
- **Sin dominio propio** — usando el subdominio gratuito de Vercel.

---

## Licencia

Apache-2.0