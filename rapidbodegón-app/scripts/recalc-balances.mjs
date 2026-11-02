#!/usr/bin/env node
/**
 * Verifica (y opcionalmente corrige) los números guardados en Firestore
 * contra el historial de transacciones. NO filtra por ciclo ni por fecha:
 * cuenta TODAS las transacciones completadas desde siempre.
 *
 *   saldo correcto de un cliente = consumos completados - pagos completados
 *   totalCollectedUSD            = suma de pagos completados
 *   totalExpensesUSD             = suma de egresos
 *
 * Por defecto es un SIMULACRO (no escribe nada). Con --apply corrige.
 * Antes de escribir guarda un respaldo JSON en tu carpeta home (fuera del
 * repo: es público y el archivo trae nombres y saldos).
 *
 * --skip="NOMBRE UNO,NOMBRE DOS"  clientes que NO se tocan (por ejemplo, los
 *                                 que arrastran deuda de un ciclo anterior
 *                                 cargada a mano, sin transacción detrás).
 *
 * Uso:
 *   node scripts/recalc-balances.mjs --project=rapidbodegon
 *   node scripts/recalc-balances.mjs --project=rapidbodegon --skip="ANA PEREZ"
 *   node scripts/recalc-balances.mjs --project=rapidbodegon --skip="ANA PEREZ" --apply
 *
 * Requiere haber corrido antes: gcloud auth application-default login
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

let projectId = null;
let apply = false;
let skipNames = new Set();
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--project=')) projectId = arg.slice('--project='.length);
  else if (arg === '--apply') apply = true;
  else if (arg.startsWith('--skip=')) {
    skipNames = new Set(
      arg.slice('--skip='.length).split(',').map((n) => n.trim().toUpperCase()).filter(Boolean)
    );
  }
}
if (!projectId) {
  console.error('Uso: node scripts/recalc-balances.mjs --project=<project-id> [--skip="A,B"] [--apply]');
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const round2 = (n) => Math.round(n * 100) / 100;

async function main() {
  const [usersSnap, txSnap, expensesSnap, financialSnap] = await Promise.all([
    db.collection('users').get(),
    db.collection('transactions').where('status', '==', 'COMPLETED').get(),
    db.collection('expenses').get(),
    db.doc('financials/global').get(),
  ]);

  const expected = new Map();
  let paymentsTotal = 0;
  txSnap.forEach((d) => {
    const t = d.data();
    const amount = Number(t.amountUSD || 0);
    const sign = t.type === 'CONSUMPTION' ? 1 : t.type === 'PAYMENT' ? -1 : 0;
    expected.set(t.userId, (expected.get(t.userId) ?? 0) + sign * amount);
    if (t.type === 'PAYMENT') paymentsTotal += amount;
  });
  let expensesTotal = 0;
  expensesSnap.forEach((d) => { expensesTotal += Number(d.data().amountUSD || 0); });

  const diffs = [];
  const skipped = [];
  let storedTotal = 0;
  let expectedTotal = 0;
  usersSnap.forEach((d) => {
    const u = d.data();
    if (u.role !== 'CLIENT') return;
    const stored = round2(Number(u.balanceUSD || 0));
    const correct = round2(expected.get(d.id) ?? 0);
    storedTotal += stored;
    expectedTotal += correct;
    if (Math.abs(stored - correct) <= 0.005) return;
    const row = { id: d.id, name: u.name, guardado: stored, correcto: correct, diferencia: round2(stored - correct) };
    if (skipNames.has(String(u.name).trim().toUpperCase())) skipped.push(row);
    else diffs.push(row);
  });

  console.log('== Saldos de clientes ==');
  console.log(`Total guardado:  $${round2(storedTotal)}`);
  console.log(`Total según historial: $${round2(expectedTotal)}`);
  if (diffs.length) {
    console.log(`\nSe corregirían (${diffs.length}):`);
    console.table(diffs.map(({ id, ...rest }) => rest));
  } else {
    console.log('Sin diferencias por corregir.');
  }
  if (skipped.length) {
    console.log(`\nOmitidos con --skip (no se tocan) (${skipped.length}):`);
    console.table(skipped.map(({ id, ...rest }) => rest));
  }

  const fin = financialSnap.exists ? financialSnap.data() : null;
  const finStoredCollected = round2(Number(fin?.totalCollectedUSD ?? 0));
  const finStoredExpenses = round2(Number(fin?.totalExpensesUSD ?? 0));
  const finCollected = round2(paymentsTotal);
  const finExpenses = round2(expensesTotal);
  const finDiffers =
    !fin || Math.abs(finStoredCollected - finCollected) > 0.005 || Math.abs(finStoredExpenses - finExpenses) > 0.005;
  console.log('\n== Cuenta global (financials/global) ==');
  console.table([
    { campo: 'totalCollectedUSD', guardado: finStoredCollected, segunHistorial: finCollected },
    { campo: 'totalExpensesUSD', guardado: finStoredExpenses, segunHistorial: finExpenses },
  ]);

  if (diffs.length === 0 && !finDiffers) {
    console.log('\nTodo coincide con el historial. Nada que corregir.');
    return;
  }
  if (!apply) {
    console.log('\nSIMULACRO: no se escribió nada. Revisa las tablas y, si todo es correcto, corre con --apply.');
    return;
  }

  const backupPath = join(homedir(), `financial-backup-${Date.now()}.json`);
  writeFileSync(backupPath, JSON.stringify({ clientes: diffs, financials: fin }, null, 2));
  console.log(`\nRespaldo guardado en: ${backupPath}`);

  const batch = db.batch();
  for (const x of diffs) batch.update(db.collection('users').doc(x.id), { balanceUSD: x.correcto });
  if (finDiffers) {
    batch.set(
      db.doc('financials/global'),
      { initialized: true, totalCollectedUSD: finCollected, totalExpensesUSD: finExpenses, updatedAt: new Date().toISOString() },
      { merge: true }
    );
  }
  await batch.commit();
  console.log(`Corregidos ${diffs.length} saldos${finDiffers ? ' y la cuenta global' : ''}.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });