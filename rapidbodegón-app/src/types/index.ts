export type Role = 'ADMIN' | 'CLIENT';

export interface User {
  id: string;
  name: string;
  role: Role;
  pin: string; // Simplified auth for demo
  balanceUSD: number;
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
