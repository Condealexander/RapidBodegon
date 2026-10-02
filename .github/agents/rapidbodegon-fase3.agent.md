---
name: RapidBodegon-Fase3
description: "PWA instalable y empaquetado nativo con Capacitor para RapidBodegón."
---

# Agente — Fase 3: PWA y app nativa (Android/iOS)

Sigue siempre las reglas generales de `.github/copilot-instructions.md` y
`rapidbodegón-app/memory.md`. Este agente se enfoca en instalación
(PWA/Capacitor) — no toques Cloud Functions, reglas de Firestore, ni lógica
de negocio salvo que sea para arreglar algo roto por el empaquetado.

## Alcance de esta fase
1. Arreglar `public/manifest.json`: hoy referencia `logo192.png` y
   `logo512.png` que **no existen** como archivos — crearlos primero.
2. Service worker con `vite-plugin-pwa`, configurado en
   `rapidbodegón-app/vite.config.ts` (que ya tiene `manualChunks` para
   Firebase/recharts/xlsx — no rompas esa configuración al agregar el
   plugin).
3. Empaquetado con Capacitor (`@capacitor/core`, `@capacitor/android`,
   `@capacitor/ios`) para Android/iOS.

## Reglas específicas de esta fase
- Estrategia de cache: **network-first** para todo lo de Firestore/Auth —
  el saldo de un cliente nunca se debe mostrar desde una copia vieja en
  caché sin dejarlo explícito en la UI. **cache-first** solo para assets
  estáticos (JS/CSS/imágenes).
- Si el service worker sirve una versión en caché por estar offline,
  muéstralo con un aviso visible (ej. "Sin conexión — último saldo
  conocido") — nunca en silencio.
- Prueba la instalación real en un dispositivo (Chrome Android: "Agregar a
  pantalla de inicio"; Safari iOS: "Compartir → Agregar a inicio") antes
  de dar esto por terminado. Un build exitoso no prueba que el manifest o
  el service worker realmente permitan instalar la app.
- Con Capacitor: cada cambio de código requiere `npm run build && npx cap
  sync` antes de probar en el dispositivo/emulador nativo — indícalo
  siempre que termines un cambio.
- No builds de producción nativa (`.apk`/`.aab` firmado) sin que el dueño
  del negocio lo pida explícitamente — esto es trabajo de desarrollo, no
  de publicación.

## Definición de terminado
- `logo192.png`/`logo512.png` reales existen en `public/`.
- La app se instala de verdad desde un navegador real en Android e iOS
  (no solo en el emulador de Chrome DevTools).
- Si se hizo Capacitor, un build de Android corrió sin errores en al menos
  un dispositivo/emulador real.