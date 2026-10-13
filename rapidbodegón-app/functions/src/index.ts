import { createHash } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const db = getFirestore();
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


/**
 * Receives a TPago notice relayed by the signed-in administrator's Android app.
 * A match is only a suggestion: it never approves a payment or changes a balance.
 */

/**
 * Re-evaluates a previously received bank event when a customer reports a payment
 * after the notification arrived. This keeps the reconciliation order-independent.
 */
async function reconcileStoredTpagoEvent(eventId: string): Promise<void> {
  const eventRef = db.collection('bankEvents').doc(eventId);
  const eventSnapshot = await eventRef.get();
  if (!eventSnapshot.exists) return;

  const event = eventSnapshot.data()!;
  if (event.status === 'already_processed' || event.status === 'needs_review') return;
  if (typeof event.reference !== 'string'
    || typeof event.amountUSDCents !== 'number'
    || !Number.isInteger(event.amountUSDCents)) return;

  const fullReference = event.reference;
  const referenceCandidates = [...new Set([
    fullReference,
    fullReference.slice(-4),
    fullReference.slice(-5),
    fullReference.slice(-6),
  ].filter((value) => value.length >= 4 && value.length <= 12))];

  const reportsSnapshot = await db.collection('transactions')
    .where('reference', 'in', referenceCandidates)
    .get();
  const referenceReports = reportsSnapshot.docs.filter((snapshot) => {
    const tx = snapshot.data();
    return tx.type === 'PAYMENT'
      && typeof tx.reference === 'string'
      && referenceCandidates.includes(tx.reference);
  });
  const pendingReports = referenceReports.filter((snapshot) => snapshot.get('status') === 'PENDING');
  const amountMatches = pendingReports.filter((snapshot) => {
    const amountUSD = snapshot.get('amountUSD');
    return typeof amountUSD === 'number'
      && Number.isFinite(amountUSD)
      && Math.round(amountUSD * 100) === event.amountUSDCents;
  });

  let nextStatus: string;
  let nextMatchedId: string | null = null;
  let reviewReason: string | null = null;

  if (amountMatches.length === 1) {
    nextStatus = 'candidate_match';
    nextMatchedId = amountMatches[0].id;
  } else if (amountMatches.length > 1) {
    nextStatus = 'ambiguous';
    reviewReason = 'multiple_payments_same_reference_and_amount';
  } else if (pendingReports.length > 0) {
    nextStatus = 'amount_mismatch';
    reviewReason = 'reference_suffix_matches_but_amount_does_not';
  } else if (referenceReports.some((snapshot) => snapshot.get('status') === 'COMPLETED')) {
    nextStatus = 'already_processed';
    reviewReason = 'reference_was_already_completed';
  } else {
    nextStatus = 'unmatched';
    reviewReason = 'no_pending_payment_with_reference_suffix';
  }

  await db.runTransaction(async (transaction) => {
    const currentEvent = await transaction.get(eventRef);
    if (!currentEvent.exists) return;
    const currentStatus = currentEvent.get('status');
    if (currentStatus === 'already_processed' || currentStatus === 'needs_review') return;

    const previousMatchId = typeof currentEvent.get('matchedTransactionId') === 'string'
      ? currentEvent.get('matchedTransactionId') as string
      : null;
    const previousMatch = previousMatchId
      ? await transaction.get(db.doc(`transactions/${previousMatchId}`))
      : undefined;
    const nextMatch = nextMatchedId
      ? (nextMatchedId === previousMatchId
        ? previousMatch
        : await transaction.get(db.doc(`transactions/${nextMatchedId}`)))
      : undefined;

    if (nextStatus === 'candidate_match' && nextMatchedId) {
      if (!nextMatch?.exists
        || nextMatch.get('type') !== 'PAYMENT'
        || nextMatch.get('status') !== 'PENDING'
        || typeof nextMatch.get('amountUSD') !== 'number'
        || Math.round(nextMatch.get('amountUSD') * 100) !== event.amountUSDCents) {
        nextStatus = 'needs_review';
        nextMatchedId = null;
        reviewReason = 'payment_changed_during_reconciliation';
      }
    }

    if (previousMatchId && previousMatchId !== nextMatchedId) {
      if (previousMatch?.exists && previousMatch.get('status') === 'PENDING') {
        transaction.update(db.doc(`transactions/${previousMatchId}`), {
          bankMatchStatus: FieldValue.delete(),
          bankMatchEventId: FieldValue.delete(),
          bankReference: FieldValue.delete(),
          bankAmountBsCents: FieldValue.delete(),
          bankAmountUSDCents: FieldValue.delete(),
          bankExchangeRate: FieldValue.delete(),
        });
      }
    }

    if (nextStatus === 'candidate_match' && nextMatchedId) {
      transaction.update(db.doc(`transactions/${nextMatchedId}`), {
        bankMatchStatus: 'CANDIDATE_MATCH',
        bankMatchEventId: eventId,
        bankReference: fullReference,
        bankAmountBsCents: event.amountBsCents,
        bankAmountUSDCents: event.amountUSDCents,
        bankExchangeRate: event.exchangeRate,
      });
    }

    transaction.update(eventRef, {
      status: nextStatus,
      matchedTransactionId: nextMatchedId,
      candidateTransactionIds: pendingReports.map((snapshot) => snapshot.id),
      reviewReason,
      reconciledAt: FieldValue.serverTimestamp(),
    });
  });
}

export const ingestMercantilTpago = onCall(async (request) => {
  const adminUid = await requireAdmin(request);
  const eventId = requireString(request.data?.eventId, 'eventId').toLowerCase();
  const reference = requireString(request.data?.reference, 'reference');
  const notificationDate = requireString(request.data?.notificationDate, 'notificationDate');
  const notificationTime = requireString(request.data?.notificationTime, 'notificationTime')
    .replace(/\s+/g, ' ').trim().toUpperCase();
  const amountBs = requirePositiveNumber(request.data?.amountBs, 'amountBs');
  const postedAtMs = request.data?.postedAtMs;

  if (!/^[a-f0-9]{64}$/.test(eventId)) {
    throw new HttpsError('invalid-argument', 'Identificador de evento inválido.');
  }
  if (!/^\d{4,12}$/.test(reference)) {
    throw new HttpsError('invalid-argument', 'La referencia TPago debe contener entre 4 y 12 dígitos.');
  }
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(notificationDate)
    || !/^\d{1,2}:\d{2}\s*[AP]M$/i.test(notificationTime)) {
    throw new HttpsError('invalid-argument', 'Fecha u hora de notificación inválida.');
  }
  if (typeof postedAtMs !== 'number' || !Number.isSafeInteger(postedAtMs) || postedAtMs <= 0) {
    throw new HttpsError('invalid-argument', 'Fecha de recepción inválida.');
  }

  const amountBsCents = Math.round(amountBs * 100);
  const calculatedEventId = createHash('sha256')
    .update(`${reference}|${amountBsCents}|${notificationDate}|${notificationTime}`)
    .digest('hex');
  if (calculatedEventId !== eventId) {
    throw new HttpsError('invalid-argument', 'El identificador no corresponde al evento recibido.');
  }

  const eventRef = db.collection('bankEvents').doc(eventId);
  const previousEvent = await eventRef.get();
  if (previousEvent.exists) {
    return {
      success: true,
      duplicate: true,
      eventId,
      status: String(previousEvent.get('status') ?? 'unmatched'),
    };
  }

  const config = await db.doc('config/global').get();
  const exchangeRateValue = config.get('exchangeRate');
  const exchangeRate = typeof exchangeRateValue === 'number'
    && Number.isFinite(exchangeRateValue) && exchangeRateValue > 0
    ? exchangeRateValue
    : null;
  const amountUSDCents = exchangeRate === null
    ? null
    : Math.round((amountBs / exchangeRate) * 100);

  // ClientView intentionally accepts the last 4–6 digits of the bank reference.
  // Include the full reference too, in case a report was created by an older client.
  const referenceCandidates = [...new Set([
    reference,
    reference.slice(-4),
    reference.slice(-5),
    reference.slice(-6),
  ].filter((value) => value.length >= 4 && value.length <= 12))];

  const reportsSnapshot = await db.collection('transactions')
    .where('reference', 'in', referenceCandidates)
    .get();
  const referenceReports = reportsSnapshot.docs.filter((snapshot) => {
    const tx = snapshot.data();
    return tx.type === 'PAYMENT'
      && typeof tx.reference === 'string'
      && referenceCandidates.includes(tx.reference);
  });
  const pendingReports = referenceReports.filter((snapshot) => snapshot.get('status') === 'PENDING');

  let status: string;
  let matchedTransactionId: string | null = null;
  let reviewReason: string | null = null;
  let amountMatches: typeof pendingReports = [];

  if (exchangeRate === null || amountUSDCents === null) {
    status = 'needs_review';
    reviewReason = 'missing_exchange_rate';
  } else {
    amountMatches = pendingReports.filter((snapshot) => {
      const amountUSD = snapshot.get('amountUSD');
      return typeof amountUSD === 'number'
        && Number.isFinite(amountUSD)
        && Math.round(amountUSD * 100) === amountUSDCents;
    });

    if (amountMatches.length === 1) {
      status = 'candidate_match';
      matchedTransactionId = amountMatches[0].id;
    } else if (amountMatches.length > 1) {
      status = 'ambiguous';
      reviewReason = 'multiple_payments_same_reference_and_amount';
    } else if (pendingReports.length > 0) {
      status = 'amount_mismatch';
      reviewReason = 'reference_suffix_matches_but_amount_does_not';
    } else if (referenceReports.some((snapshot) => snapshot.get('status') === 'COMPLETED')) {
      status = 'already_processed';
      reviewReason = 'reference_was_already_completed';
    } else {
      status = 'unmatched';
      reviewReason = 'no_pending_payment_with_reference_suffix';
    }
  }

  const eventData: Record<string, unknown> = {
    bank: 'MERCANTIL',
    operation: 'TPAGO',
    reference,
    referenceSuffixes: referenceCandidates,
    amountBs: amountBsCents / 100,
    amountBsCents,
    amountUSDCents,
    exchangeRate,
    notificationDate,
    notificationTime,
    postedAtMs,
    status,
    matchedTransactionId,
    candidateTransactionIds: pendingReports.map((snapshot) => snapshot.id),
    reviewReason,
    receivedBy: adminUid,
    receivedAt: FieldValue.serverTimestamp(),
  };

  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(eventRef);
    if (existing.exists) {
      status = String(existing.get('status') ?? status);
      return;
    }

    if (status === 'candidate_match' && matchedTransactionId) {
      const matchedRef = db.doc(`transactions/${matchedTransactionId}`);
      const matchedSnapshot = await transaction.get(matchedRef);
      if (!matchedSnapshot.exists
        || matchedSnapshot.get('type') !== 'PAYMENT'
        || matchedSnapshot.get('status') !== 'PENDING') {
        status = 'already_processed';
        matchedTransactionId = null;
        reviewReason = 'payment_changed_during_reconciliation';
        eventData.status = status;
        eventData.matchedTransactionId = null;
        eventData.reviewReason = reviewReason;
      } else {
        transaction.update(matchedRef, {
          bankMatchStatus: 'CANDIDATE_MATCH',
          bankMatchEventId: eventId,
          bankReference: reference,
          bankAmountBsCents: amountBsCents,
          bankAmountUSDCents: amountUSDCents,
          bankExchangeRate: exchangeRate,
        });
      }
    }

    transaction.create(eventRef, eventData);
  });

  const savedEvent = await eventRef.get();
  return {
    success: true,
    duplicate: false,
    eventId,
    status: String(savedEvent.get('status') ?? status),
    matchedTransactionId: savedEvent.get('matchedTransactionId') ?? null,
  };
});

export const validateTransactionOnCreate = onDocumentCreated(
  { document: 'transactions/{transactionId}', retry: true },
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

        // A customer can submit their report after the bank notification was
        // queued; revisit recent TPago events that contain this exact suffix.
        const relatedEvents = await db.collection('bankEvents')
          .where('referenceSuffixes', 'array-contains', tx.reference)
          .where('postedAtMs', '>=', Date.now() - DUPLICATE_REFERENCE_WINDOW_MS)
          .orderBy('postedAtMs', 'desc')
          .limit(25)
          .get();
        for (const bankEvent of relatedEvents.docs) {
          await reconcileStoredTpagoEvent(bankEvent.id);
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

  }
);
