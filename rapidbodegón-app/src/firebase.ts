import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

const recaptchaSiteKey = (import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined) ?? '';

if (recaptchaSiteKey) {
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
