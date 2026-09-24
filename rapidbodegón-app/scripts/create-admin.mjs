#!/usr/bin/env node
/**
 * Crea (o rota el PIN de) la cuenta ADMIN directamente con el Firebase Admin
 * SDK — corre server-side, nunca en el navegador, así que el PIN nunca
 * termina en el JS público.
 *
 * CORRE ESTO UNA SOLA VEZ (o cada vez que quieras rotar el PIN del admin),
 * DESDE TU CODESPACE O MÁQUINA. Nunca lo despliegues ni lo llames desde el
 * cliente.
 *
 * Uso (con Application Default Credentials, recomendado tras
 * `gcloud auth application-default login`):
 *   node scripts/create-admin.mjs "ADMINISTRADOR" "unPinNuevoBienSecreto" --project=tu-project-id
 *
 * Uso (con archivo de service account):
 *   node scripts/create-admin.mjs "ADMINISTRADOR" "unPinNuevoBienSecreto" ./service-account.json
 *
 * Si omites ambos, usa la variable de entorno GOOGLE_APPLICATION_CREDENTIALS
 * (debe apuntar a un archivo JSON de service account).
 *
 * Cómo conseguir el service account (alternativa a ADC):
 *   Firebase Console → engranaje (Configuración del proyecto) →
 *   Cuentas de servicio → "Generar nueva clave privada". Descarga el JSON,
 *   guárdalo en la raíz de rapidbodegón-app como service-account.json —
 *   YA ESTÁ en .gitignore, pero confirma que nunca aparezca en `git status`.
 */
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const rawArgs = process.argv.slice(2);

let projectId = null;
const positional = [];
for (const arg of rawArgs) {
  if (arg.startsWith('--project=')) {
    projectId = arg.slice('--project='.length);
  } else if (arg === '--project') {
    // soporta también "--project valor" separado por espacio
    projectId = '__NEXT__';
  } else if (projectId === '__NEXT__') {
    projectId = arg;
  } else {
    positional.push(arg);
  }
}

const [rawName, pin, serviceAccountPathArg] = positional;

if (!rawName || !pin) {
  console.error('Uso: node scripts/create-admin.mjs "<NOMBRE>" "<PIN>" [ruta-service-account.json | --project=<project-id>]');
  process.exit(1);
}

if (pin.length < 6) {
  console.error('El PIN debe tener al menos 6 caracteres.');
  process.exit(1);
}

let appOptions;

if (serviceAccountPathArg) {
  // Modo service account JSON explícito
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPathArg, 'utf8'));
  appOptions = { credential: cert(serviceAccount) };
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !projectId) {
  // Modo variable de entorno apuntando a un service account JSON
  const serviceAccount = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  appOptions = { credential: cert(serviceAccount) };
} else if (projectId) {
  // Modo Application Default Credentials (gcloud auth application-default login)
  appOptions = { credential: applicationDefault(), projectId };
} else {
  console.error('Falta la ruta al service account JSON, o --project=<project-id> junto con ADC (gcloud auth application-default login), o la variable GOOGLE_APPLICATION_CREDENTIALS.');
  process.exit(1);
}

initializeApp(appOptions);

const auth = getAuth();
const db = getFirestore();

const normalizeName = (name) =>
  name.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const emailForName = (name) =>
  `${normalizeName(name).replace(/[^A-Z0-9]/g, '')}@rapidbodegon.local`;

const cleanName = normalizeName(rawName);
const email = emailForName(rawName);

async function main() {
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
    console.log(`Ya existe una cuenta para ${cleanName} (uid: ${userRecord.uid}). Actualizando el PIN...`);
    await auth.updateUser(userRecord.uid, { password: pin });
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      userRecord = await auth.createUser({ email, password: pin });
      console.log(`Cuenta creada para ${cleanName} (uid: ${userRecord.uid}).`);
    } else {
      throw e;
    }
  }

  // Admin SDK bypasses firestore.rules, así que este write funciona
  // sin importar las reglas del cliente.
  await db.collection('users').doc(userRecord.uid).set({
    id: userRecord.uid,
    name: cleanName,
    role: 'ADMIN',
    balanceUSD: 0
  }, { merge: true });

  console.log(`Listo. "${cleanName}" es ADMIN. Inicia sesión en la app con ese nombre y el PIN que acabas de usar.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
