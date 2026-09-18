export type Role = 'ADMIN' | 'CLIENT';

export interface User {
  id: string; // Firebase Auth UID (matches the auth.uid of the account)
  name: string;
  role: Role;
  balanceUSD: number;
  // NOTE: PIN/password is no longer stored in Firestore. Authentication now
  // lives in Firebase Auth (email/password with a synthetic email derived
  // from the client's name). See src/store/AppContext.tsx (emailForName).
}

export interface Product {
  id: string;
  name: string;
  priceUSD: number;
  stock: number;
}

export type TransactionStatus = 'COMPLETED' | 'PENDING' | 'REJECTED';
export type TransactionType = 'CONSUMPTION' | 'PAYMENT';

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amountUSD: number;
  date: string;
  status: TransactionStatus;

  // Specific to CONSUMPTION
  productId?: string;
  quantity?: number;

  // Specific to PAYMENT
  reference?: string;
  bank?: string;
}

export interface AppConfig {
  exchangeRate: number; // Bs per USD
  cutoffDays: number; // Days until next collection
  bankDetails: {
    bank: string;
    owner: string;
    idCard: string;
    phone: string;
  };
}

