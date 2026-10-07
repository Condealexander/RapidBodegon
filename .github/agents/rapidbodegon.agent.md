---
name: RapidBodegon
description: "Asistente para desarrollar y mantener la aplicación RapidBodegón."
---

# Pautas de trabajo para RapidBodegón

Consulta `rapidbodegón-app/memory.md` cuando necesites contexto de arquitectura, modelo de datos, comandos o convenciones. Sigue también las instrucciones generales de `.github/copilot-instructions.md`.

## Antes de modificar
- Localiza el componente, función o regla que realmente controla el comportamiento y revisa sus llamadas y tipos cercanos.
- Mantén los cambios acotados y respeta las APIs y convenciones existentes.
- Trata `rapidbodegón-app/README.md` como orientación y confirma en el código si una función o pendiente sigue vigente.
- Actualiza obligatoriamente `rapidbodegón-app/README.md` en la misma tarea por cada cambio del repositorio, sea propio o solicitado por una persona. Documenta funciones y flujos en su sección y registra cambios técnicos o de agentes en el historial.
- Antes de solicitar o dar autorización para un commit, compara el diff completo con el README; señala si ya cubre el cambio o actualízalo antes de continuar. No crees el commit hasta completar esta validación.

## Reglas del dominio
- No debilites `rapidbodegón-app/firestore.rules` para resolver problemas de UI o permisos.
- Mantén autorización y validaciones tanto en `src/store/AppContext.tsx` como en Firestore Rules.
- No crees cuentas ADMIN desde código ejecutado en el cliente ni expongas credenciales del Admin SDK.
- En operaciones financieras o de inventario, preserva atomicidad, estados de transacción y cálculos de saldo/stock. No sobrescribas cierres de ciclo ya existentes.

## Interfaz y tema
- Reutiliza componentes de `rapidbodegón-app/src/components/` y sigue la estructura de vistas existente.
- El tema compartido usa `useTheme.ts` y `data-theme`; antes de agregar controles en `Login`, `ClientView` o `AdminView`, conserva el almacenamiento `rb_theme` y las clases scoped de su vista en `rapidbodegón-app/src/theme-overrides.css`.
- Login, ClientView y AdminView comparten una identidad de azul profundo con acentos ámbar y verde. Al agregar funcionalidades al AdminView, utiliza las superficies de tarjeta existentes, botones principales ámbar, variantes semánticas verde/rojo para confirmar/rechazar, y estados de foco visibles; evita reintroducir gradientes morados/azules solo decorativos.
- Toda clase Tailwind nueva debe revisarse en ambos temas; no asumas que se adapta automáticamente al modo claro. Actualiza los overrides de la vista correspondiente y comprueba contraste de textos, placeholders, inputs, gráficos, alertas y estados visibles.
- Respeta `prefers-reduced-motion` para nuevas animaciones y transiciones.

## Validación
- Ejecuta `npm run build` desde `rapidbodegón-app/` para validar la compilación.
- El proyecto no declara un script de pruebas automatizadas; indica claramente cuando un flujo de Firebase o una interacción visual no se pudo probar en vivo.
- Después de cambios a reglas o datos, comprueba el comportamiento con los roles y documentos afectados; un build exitoso no valida reglas de Firestore.
- No afirmes que producción está actualizada solo porque el cambio compila o existe un commit; el despliegue debe completarse y verificarse por separado.