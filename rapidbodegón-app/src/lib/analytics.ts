export type AnalyticsConsent = 'granted' | 'denied';
export type AnalyticsView = 'login' | 'client' | 'admin';

type ConsentReadResult = {
  consent: AnalyticsConsent | null;
  error: Error | null;
};

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
  }
}

const MEASUREMENT_ID = 'G-B48VQSBTR4';
const CONSENT_STORAGE_KEY = 'rb_analytics_consent';
const SCRIPT_ID = 'google-analytics-script';
let analyticsInitialized = false;
let lastTrackedView: AnalyticsView | null = null;

export const readAnalyticsConsent = (): ConsentReadResult => {
  try {
    const storedConsent = window.localStorage.getItem(CONSENT_STORAGE_KEY);

    return {
      consent: storedConsent === 'granted' || storedConsent === 'denied' ? storedConsent : null,
      error: null,
    };
  } catch (error) {
    return {
      consent: null,
      error: error instanceof Error ? error : new Error('No se pudo leer el consentimiento de Analytics.'),
    };
  }
};

export const saveAnalyticsConsent = (consent: AnalyticsConsent) => {
  window.localStorage.setItem(CONSENT_STORAGE_KEY, consent);
};

const setAnalyticsDisabled = (disabled: boolean) => {
  Reflect.set(window, `ga-disable-${MEASUREMENT_ID}`, disabled);
};

export const disableGoogleAnalytics = () => {
  setAnalyticsDisabled(true);
  window.gtag?.('consent', 'update', { analytics_storage: 'denied' });
  lastTrackedView = null;
};

const startGoogleAnalytics = () => {
  setAnalyticsDisabled(false);

  if (!analyticsInitialized) {
    window.dataLayer = window.dataLayer ?? [];
    window.gtag ??= (...args: unknown[]) => {
      window.dataLayer?.push(args);
    };

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;

    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    document.head.appendChild(script);
    analyticsInitialized = true;
    return;
  }

  setAnalyticsDisabled(false);
  window.gtag?.('consent', 'update', { analytics_storage: 'granted' });
};

export const trackAnalyticsView = (view: AnalyticsView) => {
  const { consent } = readAnalyticsConsent();
  if (consent !== 'granted') return;
  if (lastTrackedView === view) return;

  startGoogleAnalytics();
  const pageReferrer = document.referrer ? new URL(document.referrer).origin : '';
  window.gtag?.('event', 'page_view', {
    page_title: `RapidBodegón - ${view}`,
    page_path: `/${view}`,
    page_location: `${window.location.origin}/${view}`,
    page_referrer: pageReferrer,
  });
  lastTrackedView = view;
};
