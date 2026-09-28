#!/usr/bin/env node
/**
 * Resetea el PIN de un CLIENTE que lo olvidó.
 *
 * Solo modifica Firebase Auth. NO toca Firestore, así que el rol y el saldo
 * del cliente quedan intactos. (No uses create-admin.mjs para esto: ese
 * script convierte la cuenta en ADMIN y pone el saldo en 0.)
 *
 * Uso:
 *   node scripts/reset-pin.mjs "JUAN PEREZ" "nuevoPinDe8Digitos" --project=rapidbodegon
 *
 * Requiere haber corrido antes: gcloud auth application-default login
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const rawArgs = process.argv.slice(2);
let projectId = null;
const positional = [];
for (const arg of rawArgs) {
  if (arg.startsWith('--project=')) projectId = arg.slice('--project='.length);
  else positional.push(arg);
}

const [rawName, newPin] = positional;

if (!rawName || !newPin || !projectId) {
  console.error('Uso: node scripts/reset-pin.mjs "<NOMBRE>" "<NUEVO_PIN>" --project=<project-id>');
  process.exit(1);
}

if (newPin.length < 8) {
  console.error('El PIN debe tener al menos 8 caracteres.');
  process.exit(1);
}

// Misma normalización que usa la app para armar el correo sintético.
const normalizeName = (name) =>
  name.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const emailForName = (name) =>
  `${normalizeName(name).replace(/[^A-Z0-9]/g, '')}@rapidbodegon.local`;

initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth();

async function main() {
  const email = emailForName(rawName);
  try {
    const user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password: newPin });
    console.log(`Listo. PIN actualizado para ${normalizeName(rawName)} (uid: ${user.uid}).`);
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      console.error(`No existe ninguna cuenta para "${normalizeName(rawName)}". Revisa el nombre.`);
    } else {
      console.error('Error:', e);
    }
    process.exit(1);
  }
  process.exit(0);
}

main();
