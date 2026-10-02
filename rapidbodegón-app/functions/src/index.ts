import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const db = getFirestore();
const callmebotApiKey = defineSecret('CALLMEBOT_API_KEY');
const callmebotPhone = defineSecret('CALLMEBOT_PHONE');
const DUPLICATE_REFERENCE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_IMPORT_ROWS = 400;

interface CallableRequest<T> {
  data: T;
  auth?: { uid: string } | null;
}

interface ProductImportRow {
  name: string;
  stock: number;
  priceUSD?: number;
}

function requireUid(request: CallableRequest<unknown>): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  return uid;
}

async function requireAdmin(request: CallableRequest<unknown>): Promise<string> {
  const uid = requireUid(request);
  const user = await db.doc(`users/${uid}`).get();
  if (!user.exists || user.get('role') !== 'ADMIN') {
    throw new HttpsError('permission-denied', 'Se requieren permisos de administrador.');
  }
  return uid;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpsError('invalid-argument', `${field} es obligatorio.`);
  }
  return value.trim();
}

function requirePositiveNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new HttpsError('invalid-argument', `${field} debe ser mayor que cero.`);
  }
  return value;
}

function requireQuantity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 50) {
    throw new HttpsError('invalid-argument', 'La cantidad debe ser un entero entre 1 y 50.');
  }
  return value;
}

function amountFor(price: unknown, quantity: number): number {
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
    throw new HttpsError('failed-precondition', 'El precio del producto no es válido.');
  }
  return Math.round(price * quantity * 100) / 100;
}

async function loadPendingTransaction(
  transactionId: unknown,
  expectedType: 'CONSUMPTION' | 'PAYMENT'
) {
  const id = requireString(transactionId, 'transactionId');
  const ref = db.doc(`transactions/${id}`);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'La transacción ya no existe.');
  const data = snapshot.data()!;
  if (data.type !== expectedType || data.status !== 'PENDING') {
    throw new HttpsError('failed-precondition', 'La transacción ya fue procesada o no es válida.');
  }
  return { ref, data };
}

export const requestConsumption = onCall(async (request) => {
  const uid = requireUid(request);
  const productId = requireString(request.data?.productId, 'productId');
  const quantity = requireQuantity(request.data?.quantity);
  const product = await db.doc(`products/${productId}`).get();
  if (!product.exists) throw new HttpsError('not-found', 'Ese producto ya no existe.');

  const transactionRef = db.collection('transactions').doc();
  const now = new Date().toISOString();
  await transactionRef.create({
    id: transactionRef.id,
    userId: uid,
    type: 'CONSUMPTION',
    amountUSD: amountFor(product.get('priceUSD'), quantity),
    date: now,
    status: 'PENDING',
    productId,
    quantity,
  });
  return { success: true };
});

export const reportPayment = onCall(async (request) => {
  const uid = requireUid(request);
  const amountUSD = requirePositiveNumber(request.data?.amountUSD, 'El monto');
  const reference = requireString(request.data?.reference, 'La referencia');
  if (!/^\d{4,12}$/.test(reference) || amountUSD < 0.1) {
    throw new HttpsError('invalid-argument', 'El monto o la referencia del pago no son válidos.');
  }

  const transactionRef = db.collection('transactions').doc();
  await transactionRef.create({
    id: transactionRef.id,
    userId: uid,
    type: 'PAYMENT',
    amountUSD,
    date: new Date().toISOString(),
    status: 'PENDING',
    reference,
  });
  return { success: true };
});

export const addConsumption = onCall(async (request) => {
  await requireAdmin(request);
  const userId = requireString(request.data?.userId, 'userId');
  const productId = requireString(request.data?.productId, 'productId');
  const quantity = requireQuantity(request.data?.quantity);
  const userRef = db.doc(`users/${userId}`);
  const productRef = db.doc(`products/${productId}`);
  const transactionRef = db.collection('transactions').doc();

  await db.runTransaction(async (transaction) => {
    const [user, product] = await Promise.all([
      transaction.get(userRef),
      transaction.get(productRef),
    ]);
    if (!user.exists) throw new HttpsError('not-found', 'El cliente ya no existe.');
    if (!product.exists) throw new HttpsError('not-found', 'El producto ya no existe.');
    const stock = product.get('stock');
    if (typeof stock !== 'number' || !Number.isInteger(stock) || stock < quantity) {
      throw new HttpsError('failed-precondition', `Stock insuficiente de "${product.get('name')}".`);
    }
    const amountUSD = amountFor(product.get('priceUSD'), quantity);
    transaction.create(transactionRef, {
      id: transactionRef.id,
      userId,
      type: 'CONSUMPTION',
      amountUSD,
      date: new Date().toISOString(),
      status: 'COMPLETED',
      productId,
      quantity,
    });
    transaction.update(userRef, { balanceUSD: FieldValue.increment(amountUSD) });
    transaction.update(productRef, { stock: FieldValue.increment(-quantity) });
  });
  return { success: true };
});

export const confirmConsumption = onCall(async (request) => {
  await requireAdmin(request);
  const { ref: txRef } = await loadPendingTransaction(request.data?.transactionId, 'CONSUMPTION');

  await db.runTransaction(async (transaction) => {
    const tx = await transaction.get(txRef);
    if (!tx.exists || tx.get('status') !== 'PENDING' || tx.get('type') !== 'CONSUMPTION') {
      throw new HttpsError('failed-precondition', 'Esa solicitud ya no está pendiente.');
    }
    const userId = requireString(tx.get('userId'), 'userId');
    const productId = requireString(tx.get('productId'), 'productId');
    const quantity = requireQuantity(tx.get('quantity'));
    const userRef = db.doc(`users/${userId}`);
    const productRef = db.doc(`products/${productId}`);
    const [user, product] = await Promise.all([
      transaction.get(userRef),
      transaction.get(productRef),
    ]);
    if (!user.exists) throw new HttpsError('not-found', 'El cliente ya no existe.');
    if (!product.exists) throw new HttpsError('not-found', 'El producto ya no existe.');
    const stock = product.get('stock');
    if (typeof stock !== 'number' || !Number.isInteger(stock) || stock < quantity) {
      throw new HttpsError('failed-precondition', `Stock insuficiente de "${product.get('name')}".`);
    }
    const amountUSD = amountFor(product.get('priceUSD'), quantity);
    transaction.update(txRef, { status: 'COMPLETED', amountUSD });
    transaction.update(userRef, { balanceUSD: FieldValue.increment(amountUSD) });
    transaction.update(productRef, { stock: FieldValue.increment(-quantity) });
  });
  return { success: true };
});

export const rejectConsumption = onCall(async (request) => {
  await requireAdmin(request);
  const { ref } = await loadPendingTransaction(request.data?.transactionId, 'CONSUMPTION');
  await db.runTransaction(async (transaction) => {
    const tx = await transaction.get(ref);
    if (!tx.exists || tx.get('status') !== 'PENDING' || tx.get('type') !== 'CONSUMPTION') {
      throw new HttpsError('failed-precondition', 'Esa solicitud ya no está pendiente.');
    }
    transaction.update(ref, { status: 'REJECTED' });
  });
  return { success: true };
});

export const confirmPayment = onCall(async (request) => {
  await requireAdmin(request);
  const { ref: txRef } = await loadPendingTransaction(request.data?.transactionId, 'PAYMENT');
  await db.runTransaction(async (transaction) => {
    const tx = await transaction.get(txRef);
    if (!tx.exists || tx.get('status') !== 'PENDING' || tx.get('type') !== 'PAYMENT') {
      throw new HttpsError('failed-precondition', 'Ese pago ya fue procesado.');
    }
    const userId = requireString(tx.get('userId'), 'userId');
    const amountUSD = requirePositiveNumber(tx.get('amountUSD'), 'El monto');
    const reference = requireString(tx.get('reference'), 'La referencia');
    if (!/^\d{4,12}$/.test(reference)) {
      throw new HttpsError('failed-precondition', 'La referencia del pago no es válida.');
    }
    const userRef = db.doc(`users/${userId}`);
    const user = await transaction.get(userRef);
    if (!user.exists) throw new HttpsError('not-found', 'El cliente ya no existe.');
    transaction.update(txRef, { status: 'COMPLETED' });
    transaction.update(userRef, { balanceUSD: FieldValue.increment(-amountUSD) });
  });
  return { success: true };
});

export const rejectPayment = onCall(async (request) => {
  await requireAdmin(request);
  const { ref } = await loadPendingTransaction(request.data?.transactionId, 'PAYMENT');
  await db.runTransaction(async (transaction) => {
    const tx = await transaction.get(ref);
    if (!tx.exists || tx.get('status') !== 'PENDING' || tx.get('type') !== 'PAYMENT') {
      throw new HttpsError('failed-precondition', 'Ese pago ya fue procesado.');
    }
    transaction.update(ref, { status: 'REJECTED' });
  });
  return { success: true };
});

export const setExchangeRate = onCall(async (request) => {
  await requireAdmin(request);
  const rate = requirePositiveNumber(request.data?.rate, 'La tasa de cambio');
  await db.doc('config/global').set({ exchangeRate: rate }, { merge: true });
  return { success: true };
});

export const updateProductStock = onCall(async (request) => {
  await requireAdmin(request);
  const productId = requireString(request.data?.productId, 'productId');
  const stock = request.data?.stock;
  if (typeof stock !== 'number' || !Number.isInteger(stock) || stock < 0) {
    throw new HttpsError('invalid-argument', 'El stock debe ser un entero igual o mayor a cero.');
  }
  const productRef = db.doc(`products/${productId}`);
  await db.runTransaction(async (transaction) => {
    const product = await transaction.get(productRef);
    if (!product.exists) throw new HttpsError('not-found', 'El producto no existe.');
    transaction.update(productRef, { stock });
  });
  return { success: true };
});

export const importProducts = onCall(async (request) => {
  await requireAdmin(request);
  const rows = request.data?.rows;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_IMPORT_ROWS) {
    throw new HttpsError('invalid-argument', `El archivo debe contener entre 1 y ${MAX_IMPORT_ROWS} productos.`);
  }

  const normalizedRows = rows.map((row: ProductImportRow) => {
    if (typeof row?.name !== 'string' || !row.name.trim()
      || !Number.isInteger(row.stock) || row.stock < 0
      || (row.priceUSD !== undefined && (typeof row.priceUSD !== 'number'
        || !Number.isFinite(row.priceUSD) || row.priceUSD < 0))) {
      throw new HttpsError('invalid-argument', 'El archivo contiene productos con datos inválidos.');
    }
    return {
      name: row.name.trim().toUpperCase(),
      stock: row.stock,
      priceUSD: row.priceUSD,
    };
  });
  if (new Set(normalizedRows.map((row) => row.name)).size !== normalizedRows.length) {
    throw new HttpsError('invalid-argument', 'El archivo contiene nombres de producto repetidos.');
  }

  const counts = await db.runTransaction(async (transaction) => {
    let updated = 0;
    let created = 0;
    const productsSnapshot = await transaction.get(db.collection('products'));
    const byName = new Map(productsSnapshot.docs.map((product) => [
      String(product.get('name') ?? '').trim().toUpperCase(),
      product,
    ]));
    const usedIds = new Set(productsSnapshot.docs.map((product) => product.id));

    for (const row of normalizedRows) {
      const existing = byName.get(row.name);
      if (existing) {
        const patch: Record<string, number> = { stock: row.stock };
        if (row.priceUSD !== undefined) patch.priceUSD = row.priceUSD;
        transaction.update(existing.ref, patch);
        updated++;
      } else {
        const baseId = row.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'producto';
        let id = baseId;
        let suffix = 2;
        while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
        usedIds.add(id);
        transaction.create(db.doc(`products/${id}`), {
          id,
          name: row.name,
          priceUSD: row.priceUSD ?? 0,
          stock: row.stock,
        });
        created++;
      }
    }
    return { updated, created };
  });
  return counts;
});

async function sendWhatsApp(message: string): Promise<void> {
  const url = new URL('https://api.callmebot.com/whatsapp.php');
  url.searchParams.set('phone', callmebotPhone.value());
  url.searchParams.set('text', message);
  url.searchParams.set('apikey', callmebotApiKey.value());
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    throw new Error(`CallMeBot devolvió HTTP ${response.status}.`);
  }
}

async function sendOnce(eventId: string, message: string): Promise<void> {
  const eventRef = db.doc(`functionEvents/${eventId}`);
  const now = Date.now();
  const leaseUntil = now + 60_000;
  const claimed = await db.runTransaction(async (transaction) => {
    const event = await transaction.get(eventRef);
    if (event.get('status') === 'sent' || event.get('status') === 'skipped') return false;
    const currentLease = event.get('leaseUntil');
    if (typeof currentLease === 'number' && currentLease > now) {
      throw new Error('La notificación de este evento ya está en curso.');
    }
    transaction.set(eventRef, { status: 'processing', leaseUntil });
    return true;
  });
  if (!claimed) return;

  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    await eventRef.set({ status: 'skipped', skippedAt: new Date().toISOString() }, { merge: true });
    console.info('WhatsApp delivery skipped in the Firebase Emulator.');
    return;
  }

  await sendWhatsApp(message);
  await eventRef.set({ status: 'sent', sentAt: new Date().toISOString() }, { merge: true });
}

const transactionTriggerOptions = process.env.FUNCTIONS_EMULATOR === 'true'
  ? { document: 'transactions/{transactionId}', retry: true }
  : {
      document: 'transactions/{transactionId}',
      secrets: [callmebotApiKey, callmebotPhone],
      retry: true,
    };

export const validateAndNotifyTransaction = onDocumentCreated(
  transactionTriggerOptions,
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const tx = snapshot.data();
    const reviewReasons: string[] = [];

    if (tx.type === 'PAYMENT') {
      if (typeof tx.amountUSD !== 'number' || !Number.isFinite(tx.amountUSD) || tx.amountUSD <= 0) {
        reviewReasons.push('invalid_amount');
      }
      if (typeof tx.reference === 'string' && typeof tx.userId === 'string') {
        const since = new Date(Date.now() - DUPLICATE_REFERENCE_WINDOW_MS).toISOString();
        const duplicates = await db.collection('transactions')
          .where('userId', '==', tx.userId)
          .where('type', '==', 'PAYMENT')
          .where('reference', '==', tx.reference)
          .where('date', '>=', since)
          .limit(2)
          .get();
        if (duplicates.docs.some((doc) => doc.id !== snapshot.id)) {
          reviewReasons.push('duplicate_reference');
        }
      }
    } else if (tx.type === 'CONSUMPTION') {
      if (typeof tx.productId !== 'string' || !tx.productId.trim()
        || typeof tx.quantity !== 'number' || !Number.isInteger(tx.quantity)
        || tx.quantity < 1 || tx.quantity > 50
        || typeof tx.amountUSD !== 'number' || !Number.isFinite(tx.amountUSD)) {
        reviewReasons.push('invalid_consumption');
      } else {
        const productId = tx.productId.trim();
        const quantity = tx.quantity;
        const product = await db.doc(`products/${productId}`).get();
        if (!product.exists
          || Math.abs(amountFor(product.get('priceUSD'), quantity) - tx.amountUSD) > 0.001) {
          reviewReasons.push('amount_mismatch');
        }
      }
    }

    if (reviewReasons.length > 0) {
      await snapshot.ref.update({ needsReview: true, reviewReasons });
    }

    if (tx.type === 'PAYMENT' || tx.type === 'CONSUMPTION') {
      const userSnapshot = typeof tx.userId === 'string'
        ? await db.doc(`users/${tx.userId}`).get()
        : null;
      const clientName = userSnapshot?.get('name') ?? 'Cliente';
      let message: string;
      if (tx.type === 'PAYMENT') {
        message = `💰 Pago reportado: ${clientName} reportó $${tx.amountUSD} (Ref: ${tx.reference ?? 'sin referencia'}). Pendiente de validar.`;
      } else {
        const product = typeof tx.productId === 'string'
          ? await db.doc(`products/${tx.productId}`).get()
          : null;
        const productName = product?.get('name') ?? 'Producto';
        if (tx.status === 'COMPLETED') {
          const userBalance = userSnapshot?.get('balanceUSD');
          const balanceText = typeof userBalance === 'number' ? `$${userBalance}` : 'no disponible';
          message = `🧾 Nuevo consumo: ${clientName} cargó ${productName} x${tx.quantity ?? 0} = $${tx.amountUSD}. Saldo actualizado: ${balanceText}.`;
        } else {
          message = `🧾 Consumo reportado: ${clientName} solicitó ${productName} x${tx.quantity ?? 0} = $${tx.amountUSD}. Pendiente de confirmar.`;
        }
      }
      await sendOnce(event.id, message);
    }
  }
);
