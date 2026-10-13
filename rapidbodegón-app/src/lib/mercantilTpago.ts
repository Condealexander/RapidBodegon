import { Capacitor, registerPlugin } from '@capacitor/core';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export interface MercantilTpagoNotice {
  eventId: string;
  reference: string;
  amountBs: number;
  notificationDate: string;
  notificationTime: string;
  postedAtMs: number;
}

export type MercantilEventStatus =
  | 'candidate_match'
  | 'ambiguous'
  | 'amount_mismatch'
  | 'unmatched'
  | 'already_processed'
  | 'needs_review';

export interface MercantilBankEvent {
  id: string;
  bank: 'MERCANTIL';
  operation: 'TPAGO';
  reference: string;
  amountBs: number;
  amountUSDCents?: number | null;
  exchangeRate?: number | null;
  notificationDate: string;
  notificationTime: string;
  status: MercantilEventStatus;
  matchedTransactionId?: string | null;
  candidateTransactionIds?: string[];
  reviewReason?: string | null;
  receivedAt?: unknown;
}

interface MercantilTpagoNativePlugin {
  hasNotificationAccess(): Promise<{ enabled: boolean }>;
  openNotificationAccessSettings(): Promise<void>;
  getPendingEvents(): Promise<{ events: MercantilTpagoNotice[] }>;
  acknowledgeEvents(options: { eventIds: string[] }): Promise<void>;
}

export const MercantilTpago = registerPlugin<MercantilTpagoNativePlugin>('MercantilTpago');

export const isMercantilNativeApp = (): boolean => Capacitor.isNativePlatform();

const ingestEvent = httpsCallable<MercantilTpagoNotice, {
  success: boolean;
  duplicate?: boolean;
  status: MercantilEventStatus;
}>(
  functions,
  'ingestMercantilTpago'
);

export async function syncPendingMercantilEvents(): Promise<{
  processed: number;
  duplicates: number;
  errors: string[];
}> {
  const queue = await MercantilTpago.getPendingEvents();
  const processedIds: string[] = [];
  const errors: string[] = [];
  let processed = 0;
  let duplicates = 0;

  for (const event of queue.events) {
    try {
      const result = await ingestEvent(event);
      if (result.data.success) {
        processedIds.push(event.eventId);
        if (result.data.duplicate) duplicates++;
        else processed++;
      } else {
        errors.push(`Evento ${event.eventId}: el servidor no confirmó el procesamiento.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      errors.push(message);
      // Keep unconfirmed events in the device queue for retry.
    }
  }

  if (processedIds.length) {
    await MercantilTpago.acknowledgeEvents({ eventIds: processedIds });
  }

  return { processed, duplicates, errors };
}
