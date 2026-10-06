import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';

const recaptchaSiteKey = (import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined) ?? '';

// TEMPORALMENTE DESACTIVADO: el script de reCAPTCHA no carga en producción
// y tumba Firestore entero. App Check no está en "Enforced" todavía, así
// que esto no quita ninguna protección activa.
const APP_CHECK_ENABLED = false;

if (APP_CHECK_ENABLED && recaptchaSiteKey && !useEmulators) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    console.warn('Firebase App Check init skipped:', error);
  }
}

// firestoreDatabaseId is optional — only present if you created a
// non-default named Firestore database. Cast to allow reading it safely
// whether or not the JSON includes that field.
const firestoreDatabaseId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;

export const db = firestoreDatabaseId && firestoreDatabaseId !== '(default)'
  ? getFirestore(app, firestoreDatabaseId)
  : getFirestore(app);

export const auth = getAuth(app);

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
