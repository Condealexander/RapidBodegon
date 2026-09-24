#!/usr/bin/env node
/**
 * Siembra (seed) las colecciones `products` y `config/global` en Firestore
 * a partir de los datos que antes vivían solo en src/data/mock.ts.
 *
 * Corre esto UNA SOLA VEZ para inicializar la base de datos real. Si un
 * producto con el mismo id ya existe, se sobreescribe (merge: true), así
 * que también es seguro re-correrlo si agregas productos nuevos al array
 * de abajo más adelante.
 *
 * Uso (con Application Default Credentials, igual que create-admin.mjs):
 *   node scripts/seed-data.mjs --project=rapidbodegon
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const rawArgs = process.argv.slice(2);
let projectId = null;
for (const arg of rawArgs) {
  if (arg.startsWith('--project=')) projectId = arg.slice('--project='.length);
}

if (!projectId) {
  console.error('Uso: node scripts/seed-data.mjs --project=<project-id>');
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

// Mismos datos que src/data/mock.ts — mantenlos sincronizados si agregas
// productos nuevos al catálogo real.
const products = [
  { id: 'p1', name: 'CHESSTRISS', priceUSD: 1.50, stock: 20 },
  { id: 'p2', name: 'GOLPE', priceUSD: 1.00, stock: 15 },
  { id: 'p3', name: 'DORITO', priceUSD: 1.50, stock: 10 },
  { id: 'p4', name: 'CLUB SOCIAL', priceUSD: 0.50, stock: 50 },
  { id: 'p5', name: 'MARIA', priceUSD: 0.40, stock: 30 },
  { id: 'p6', name: 'PIRULIN', priceUSD: 8.00, stock: 5 },
  { id: 'p7', name: 'COCOSETTE', priceUSD: 1.50, stock: 25 },
  { id: 'p8', name: 'FLIPS', priceUSD: 2.50, stock: 12 },
];

const config = {
  exchangeRate: 45.30,
  cutoffDays: 5,
  bankDetails: {
    bank: 'Banco Mercantil',
    owner: 'MICHAEL YANEZ',
    idCard: 'V-25033043',
    phone: '04242404388'
  }
};

async function main() {
  const batch = db.batch();

  for (const product of products) {
    const ref = db.collection('products').doc(product.id);
    batch.set(ref, product, { merge: true });
  }

  const configRef = db.collection('config').doc('global');
  batch.set(configRef, config, { merge: true });

  await batch.commit();

  console.log(`Sembrados ${products.length} productos y config/global en el proyecto "${projectId}".`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error al sembrar datos:', err);
  process.exit(1);
});