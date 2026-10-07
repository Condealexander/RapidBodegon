#!/usr/bin/env node
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectArg = process.argv.slice(2).find(arg => arg.startsWith('--project='));
const projectId = projectArg?.slice('--project='.length);

if (!projectId) {
  console.error('Uso: node scripts/migrate-financials.mjs --project=<project-id>');
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const sumCompletedPayments = async () => {
  let total = 0;
  const payments = db.collection('transactions').where('type', '==', 'PAYMENT').stream();
  for await (const document of payments) {
    const payment = document.data();
    if (payment.status !== 'COMPLETED') continue;
    if (typeof payment.amountUSD !== 'number' || !Number.isFinite(payment.amountUSD) || payment.amountUSD <= 0) {
      throw new Error(`El pago completado ${document.id} tiene un monto inválido.`);
    }
    total += payment.amountUSD;
  }
  return total;
};

const sumExpenses = async () => {
  let total = 0;
  const expenses = db.collection('expenses').stream();
  for await (const document of expenses) {
    const expense = document.data();
    if (typeof expense.amountUSD !== 'number' || !Number.isFinite(expense.amountUSD) || expense.amountUSD <= 0) {
      throw new Error(`El egreso ${document.id} tiene un monto inválido.`);
    }
    total += expense.amountUSD;
  }
  return total;
};

async function main() {
  const [totalCollectedUSD, totalExpensesUSD] = await Promise.all([
    sumCompletedPayments(),
    sumExpenses(),
  ]);
  const financialRef = db.doc('financials/global');

  await db.runTransaction(async transaction => {
    const existing = await transaction.get(financialRef);
    if (existing.exists && existing.get('initialized') === true) {
      throw new Error('La cuenta global ya está inicializada; no se modificó ningún dato.');
    }
    transaction.set(financialRef, {
      initialized: true,
      totalCollectedUSD,
      totalExpensesUSD,
      updatedAt: new Date().toISOString(),
    });
  });

  console.log(
    `Cuenta global inicializada en "${projectId}": ` +
    `${totalCollectedUSD.toFixed(2)} USD recaudados, ` +
    `${totalExpensesUSD.toFixed(2)} USD en egresos.`
  );
}

main().catch(error => {
  console.error('No se pudo inicializar la cuenta global:', error);
  process.exitCode = 1;
});
