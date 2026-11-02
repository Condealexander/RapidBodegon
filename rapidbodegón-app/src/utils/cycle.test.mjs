import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import {
  deleteApp as deleteClientApp,
  initializeApp as initializeClientApp,
} from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  deleteUser,
  inMemoryPersistence,
  initializeAuth,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
} from 'firebase/firestore';
import { closeCycleIfMissing } from '../store/cycleClosures.ts';
import { sumCycleTransactions } from './cycle.ts';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

test('sums every completed transaction in a period beyond the dashboard history limit', () => {
  const period = {
    id: '2026-10-25',
    start: new Date('2026-10-17T00:00:00.000Z'),
    end: new Date('2026-10-25T00:00:00.000Z'),
  };
  const transactions = Array.from({ length: 1_505 }, (_, index) => ({
    type: index % 2 === 0 ? 'PAYMENT' : 'CONSUMPTION',
    status: 'COMPLETED',
    amountUSD: index % 2 === 0 ? 1 : 2,
    date: '2026-10-20T12:00:00.000Z',
  }));
  transactions.push(
    { type: 'PAYMENT', status: 'COMPLETED', amountUSD: 10, date: period.start.toISOString() },
    { type: 'CONSUMPTION', status: 'COMPLETED', amountUSD: 20, date: period.end.toISOString() },
    { type: 'PAYMENT', status: 'PENDING', amountUSD: 30, date: '2026-10-20T12:00:00.000Z' },
    { type: 'CONSUMPTION', status: 'COMPLETED', amountUSD: 40, date: 'not-a-date' },
  );

  assert.deepEqual(sumCycleTransactions(transactions, period), {
    totalCollected: 763,
    totalConsumption: 1504,
  });
});

test('queries and closes a period with more than 1,000 Firestore transactions', {
  skip: !emulatorHost,
}, async (t) => {
  const runId = `cycle-volume-${Date.now()}`;
  const adminApp = initializeAdminApp({ projectId: 'demo-cycle-volume' }, `${runId}-admin`);
  const adminDb = getAdminFirestore(adminApp);
  const clientApp = initializeClientApp({
    apiKey: 'demo-api-key',
    authDomain: 'localhost',
    projectId: 'demo-cycle-volume',
    appId: `1:123456789:web:${runId}`,
  }, `${runId}-client`);
  const auth = initializeAuth(clientApp, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  const db = getFirestore(clientApp);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const period = {
    id: runId,
    start: new Date('2026-10-17T00:00:00.000Z'),
    end: new Date('2026-10-25T00:00:00.000Z'),
  };
  const batchSize = 400;
  const transactionRefs = [];
  const email = `${runId}@example.test`;
  const userCredential = await createUserWithEmailAndPassword(auth, email, 'test-password-123');
  const userRef = adminDb.collection('users').doc(userCredential.user.uid);
  await userRef.set({
    id: userCredential.user.uid,
    name: 'CYCLE TEST ADMIN',
    role: 'ADMIN',
    balanceUSD: 0,
  });
  await userCredential.user.getIdToken(true);

  t.after(async () => {
    for (let offset = 0; offset < transactionRefs.length; offset += 400) {
      const batch = adminDb.batch();
      transactionRefs.slice(offset, offset + 400).forEach(reference => batch.delete(reference));
      await batch.commit();
    }
    await adminDb.doc(`cycles/${period.id}`).delete();
    await userRef.delete();
    await deleteUser(userCredential.user);
    await deleteClientApp(clientApp);
    await deleteAdminApp(adminApp);
  });

  for (let offset = 0; offset < 1_505; offset += batchSize) {
    const batch = adminDb.batch();
    const batchEnd = Math.min(offset + batchSize, 1_505);
    for (let index = offset; index < batchEnd; index++) {
      const isPayment = index % 2 === 0;
      const reference = adminDb.doc(`transactions/${runId}-${index}`);
      transactionRefs.push(reference);
      batch.create(reference, {
        type: isPayment ? 'PAYMENT' : 'CONSUMPTION',
        status: 'COMPLETED',
        amountUSD: isPayment ? 1 : 2,
        date: '2026-10-20T12:00:00.000Z',
      });
    }
    await batch.commit();
  }
  const startRef = adminDb.doc(`transactions/${runId}-start`);
  const endRef = adminDb.doc(`transactions/${runId}-end`);
  const pendingRef = adminDb.doc(`transactions/${runId}-pending`);
  transactionRefs.push(startRef, endRef, pendingRef);
  await startRef.set({
    type: 'PAYMENT',
    status: 'COMPLETED',
    amountUSD: 10,
    date: period.start.toISOString(),
  });
  await endRef.set({
    type: 'CONSUMPTION',
    status: 'COMPLETED',
    amountUSD: 20,
    date: period.end.toISOString(),
  });
  await pendingRef.set({
    type: 'PAYMENT',
    status: 'PENDING',
    amountUSD: 30,
    date: '2026-10-20T12:00:00.000Z',
  });

  assert.equal(await closeCycleIfMissing(db, period), true);
  const cycleRef = doc(db, 'cycles', period.id);
  const cycleData = (await getDoc(cycleRef)).data();
  assert.ok(cycleData);
  assert.equal(cycleData.periodStart, period.start.toISOString());
  assert.equal(cycleData.periodEnd, period.end.toISOString());
  assert.equal(cycleData.totalCollected, 763);
  assert.equal(cycleData.totalConsumption, 1504);
  assert.equal(typeof cycleData.closedAt, 'string');
  assert.equal(await closeCycleIfMissing(db, period), false);
});
