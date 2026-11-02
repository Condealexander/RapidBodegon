import {
  collection,
  doc,
  getDocsFromServer,
  query,
  runTransaction,
  where,
  type Firestore,
} from 'firebase/firestore';
import type { Transaction } from '../types';
import { sumCycleTransactions, type CyclePeriod } from '../utils/cycle.ts';

export const closeCycleIfMissing = async (db: Firestore, period: CyclePeriod): Promise<boolean> => {
  const cycleRef = doc(db, 'cycles', period.id);
  const periodTransactionsQuery = query(
    collection(db, 'transactions'),
    where('date', '>=', period.start.toISOString()),
    where('date', '<', period.end.toISOString())
  );
  const transactionsSnapshot = await getDocsFromServer(periodTransactionsQuery);
  const { totalCollected, totalConsumption } = sumCycleTransactions(
    transactionsSnapshot.docs.map(document => document.data() as Transaction),
    period
  );

  return runTransaction(db, async (transaction) => {
    const cycleSnapshot = await transaction.get(cycleRef);
    if (cycleSnapshot.exists()) return false;

    transaction.set(cycleRef, {
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
      totalCollected,
      totalConsumption,
      closedAt: new Date().toISOString(),
    });
    return true;
  });
};
