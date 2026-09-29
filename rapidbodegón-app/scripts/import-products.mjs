#!/usr/bin/env node
/**
 * Fase 1 — Importa el catálogo REAL de 42 productos (extraído de tu Google
 * Sheet "CONTROL") a la colección `products` de Firestore, y borra los 8
 * productos de prueba viejos (p1..p8) que ya no existen en tu inventario
 * real.
 *
 * Es seguro re-correrlo: los productos se sobrescriben (merge: true) por id,
 * así que si corriges un precio aquí abajo y vuelves a correr el script, se
 * actualiza sin duplicar nada.
 *
 * IMPORTANTE: el stock de cada producto se importa en 100 unidades por
 * defecto (tu hoja no tenía existencias reales, solo unidades vendidas del
 * corte). Ajusta las cantidades reales después desde el panel Admin →
 * Inventario.
 *
 * Uso (con Application Default Credentials, igual que create-admin.mjs):
 *   node scripts/import-products.mjs --project=rapidbodegon
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const rawArgs = process.argv.slice(2);
let projectId = null;
for (const arg of rawArgs) {
  if (arg.startsWith('--project=')) projectId = arg.slice('--project='.length);
}

if (!projectId) {
  console.error('Uso: node scripts/import-products.mjs --project=<project-id>');
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

// Productos de prueba (Fase 0) que se reemplazan por el catálogo real.
const oldPlaceholderIds = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

// Catálogo real — mismos datos que src/data/mock.ts (mantenlos sincronizados
// si agregas o quitas productos más adelante).
const products = [
  { id: 'chesstriss', name: 'CHESSTRISS', priceUSD: 1.5, stock: 100 },
  { id: 'tom', name: 'TOM', priceUSD: 1.5, stock: 100 },
  { id: 'pepito', name: 'PEPITO', priceUSD: 1.0, stock: 100 },
  { id: 'golpe', name: 'GOLPE', priceUSD: 1.0, stock: 100 },
  { id: 'de-todito', name: 'DE TODITO', priceUSD: 1.5, stock: 100 },
  { id: 'dorito', name: 'DORITO', priceUSD: 1.5, stock: 100 },
  { id: 'chiskesitos', name: 'CHISKESITOS', priceUSD: 1.0, stock: 100 },
  { id: 'papas-limon', name: 'PAPAS LIMON', priceUSD: 5.0, stock: 100 },
  { id: 'tostones-limon', name: 'TOSTONES LIMON', priceUSD: 6.0, stock: 100 },
  { id: 'club-social', name: 'CLUB SOCIAL', priceUSD: 0.5, stock: 100 },
  { id: 'oreo', name: 'OREO', priceUSD: 1.0, stock: 100 },
  { id: 'honny', name: 'HONNY', priceUSD: 0.5, stock: 100 },
  { id: 'maria', name: 'MARIA', priceUSD: 0.4, stock: 100 },
  { id: 'chocolate-stadium', name: 'CHOCOLATE STADIUM', priceUSD: 1.0, stock: 100 },
  { id: 'chocolate-savoy', name: 'CHOCOLATE SAVOY', priceUSD: 1.5, stock: 100 },
  { id: 'cocosette', name: 'COCOSETTE', priceUSD: 1.5, stock: 100 },
  { id: 'flips', name: 'FLIPS', priceUSD: 1.0, stock: 100 },
  { id: 'pringles', name: 'PRINGLES', priceUSD: 2.5, stock: 100 },
  { id: 'flaquito', name: 'FLAQUITO', priceUSD: 1.0, stock: 100 },
  { id: 'palitos', name: 'PALITOS', priceUSD: 1.0, stock: 100 },
  { id: 'miramar', name: 'MIRAMAR', priceUSD: 3.0, stock: 100 },
  { id: 'merey', name: 'MEREY', priceUSD: 6.0, stock: 100 },
  { id: 'pirulin', name: 'PIRULIN', priceUSD: 8.0, stock: 100 },
  { id: 'torontos', name: 'TORONTOS', priceUSD: 0.7, stock: 100 },
  { id: 'pirulin-bites', name: 'PIRULIN BITES', priceUSD: 9.0, stock: 100 },
  { id: 'chicharron', name: 'CHICHARRON', priceUSD: 6.0, stock: 100 },
  { id: 'polvorones', name: 'POLVORONES', priceUSD: 1.0, stock: 100 },
  { id: 'ponquesito-once', name: 'PONQUESITO ONCE', priceUSD: 1.5, stock: 100 },
  { id: 'papas-del-valle', name: 'PAPAS DEL VALLE', priceUSD: 10.0, stock: 100 },
  { id: 'pistachos', name: 'PISTACHOS', priceUSD: 8.0, stock: 100 },
  { id: 'papatanitos', name: 'PAPATANITOS', priceUSD: 3.0, stock: 100 },
  { id: 'torta-de-manzana', name: 'TORTA DE MANZANA', priceUSD: 2.5, stock: 100 },
  { id: 'ponquesito-normal', name: 'PONQUESITO NORMAL', priceUSD: 1.0, stock: 100 },
  { id: 'mani', name: 'MANI', priceUSD: 3.0, stock: 100 },
  { id: 'milka', name: 'MILKA', priceUSD: 5.2, stock: 100 },
  { id: 'chupeta', name: 'CHUPETA', priceUSD: 0.25, stock: 100 },
  { id: 'dulce-de-platano', name: 'DULCE DE PLATANO', priceUSD: 0.4, stock: 100 },
  { id: 'piruli-grande', name: 'PIRULI GRANDE', priceUSD: 16.0, stock: 100 },
  { id: 'mini-tronkolate', name: 'MINI TRONKOLATE', priceUSD: 0.4, stock: 100 },
  { id: 'katy', name: 'KATY', priceUSD: 1.0, stock: 100 },
  { id: 'pop-crouch', name: 'POP CROUCH', priceUSD: 1.0, stock: 100 },
  { id: 'croissant', name: 'CROISSANT', priceUSD: 1.0, stock: 100 },
];

async function main() {
  const batch = db.batch();

  for (const oldId of oldPlaceholderIds) {
    const ref = db.collection('products').doc(oldId);
    batch.delete(ref);
  }

  for (const product of products) {
    const ref = db.collection('products').doc(product.id);
    batch.set(ref, product, { merge: true });
  }

  await batch.commit();

  console.log(`Listo: ${products.length} productos reales importados y ${oldPlaceholderIds.length} productos de prueba eliminados en "${projectId}".`);
  console.log('Recuerda ajustar el stock real de cada producto desde Admin → Inventario (se importó todo en 100 por defecto).');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error al importar productos:', err);
  process.exit(1);
});
