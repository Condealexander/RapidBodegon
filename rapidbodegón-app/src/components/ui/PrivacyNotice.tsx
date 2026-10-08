import React, { useState } from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { Card, CardContent, Button } from '../index';
import {
  disableGoogleAnalytics,
  readAnalyticsConsent,
  saveAnalyticsConsent,
  trackAnalyticsView,
  type AnalyticsConsent,
  type AnalyticsView,
} from '../../lib/analytics';

export const PrivacyNoticeLink = ({ currentScreen }: { currentScreen: AnalyticsView | null }) => {
  const [consentState, setConsentState] = useState(() => readAnalyticsConsent());
  const [open, setOpen] = useState(false);

  const saveConsent = (consent: AnalyticsConsent) => {
    try {
      saveAnalyticsConsent(consent);
      setConsentState({ consent, error: null });

      if (consent === 'granted') {
        if (currentScreen) trackAnalyticsView(currentScreen);
      } else {
        disableGoogleAnalytics();
      }
    } catch (error) {
      console.error('No se pudo guardar la preferencia de Google Analytics.', error);
      setConsentState({
        consent: consentState.consent,
        error: error instanceof Error ? error : new Error('No se pudo guardar la preferencia.'),
      });
    }
  };

  return (
    <>
      <aside className="fixed bottom-4 right-4 z-50 w-[min(24rem,calc(100vw-2rem))]">
        {consentState.consent === null ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-xl">
            <h2 className="font-semibold text-slate-100">Preferencias de privacidad</h2>
            <p className="mt-2 text-sm text-slate-300">
              ¿Permites medición básica del uso de la aplicación con Google Analytics?
              No se enviarán datos de cuenta ni movimientos financieros.
            </p>
            {consentState.error && (
              <p role="alert" className="mt-2 text-sm text-red-400">
                No se pudo guardar o leer tu preferencia. Analytics permanecerá desactivado.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => saveConsent('granted')}>Aceptar</Button>
              <Button variant="secondary" onClick={() => saveConsent('denied')}>Rechazar</Button>
              <button
                type="button"
                className="px-2 py-2 text-sm text-blue-400 underline underline-offset-2"
                onClick={() => setOpen(true)}
              >
                Más información
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 shadow-lg hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            onClick={() => setOpen(true)}
          >
            Privacidad
          </button>
        )}
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-md" role="dialog" aria-modal="true" aria-labelledby="privacy-title">
            <Card>
              <CardContent className="p-6">
                <div className="mb-4 flex items-start justify-between">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-600/20 text-blue-500">
                    <ShieldCheck size={20} />
                  </div>
                  <button
                    type="button"
                    className="text-slate-500 hover:text-slate-300"
                    onClick={() => setOpen(false)}
                    aria-label="Cerrar aviso de privacidad"
                  >
                    <X size={20} />
                  </button>
                </div>

                <h2 id="privacy-title" className="mb-3 text-lg font-semibold text-white">
                  Aviso de privacidad
                </h2>

                <div className="space-y-3 text-sm text-slate-400">
                  <p>
                    Usamos tu nombre, saldo de crédito y el historial de consumos y pagos reportados
                    para administrar tu cuenta en el bodegón. El acceso a esos datos se limita según
                    los permisos de la aplicación.
                  </p>
                  <p>
                    Si aceptas, Google Analytics recibe información técnica de navegación y uso
                    general y puede usar cookies o identificadores de analítica. No enviamos a
                    Analytics nombres, UID, PIN, saldos, referencias de pagos, consumos ni eventos
                    financieros; tampoco habilitamos Google Signals ni personalización publicitaria.
                  </p>
                  <p>
                    Puedes rechazar o retirar el consentimiento en cualquier momento desde este
                    control. Si rechazas antes de aceptar, el script de Google Analytics no se carga;
                    si retiras un consentimiento previo, se deshabilitan los eventos posteriores.
                  </p>
                  <p>
                    Para solicitar la eliminación de tu cuenta, escríbenos directamente. Google
                    procesa los datos técnicos enviados por Analytics conforme a sus propias
                    condiciones y políticas.
                  </p>
                </div>

                {consentState.error && (
                  <p role="alert" className="mt-4 text-sm text-red-400">
                    No se pudo guardar la preferencia. Google Analytics permanecerá desactivado
                    hasta que pueda registrarse tu decisión.
                  </p>
                )}

                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <Button variant="secondary" onClick={() => saveConsent('denied')}>
                    Rechazar analítica
                  </Button>
                  <Button onClick={() => saveConsent('granted')}>Aceptar analítica</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
};
