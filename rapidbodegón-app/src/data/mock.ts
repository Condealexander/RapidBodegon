import { User, Product, AppConfig, Transaction } from '../types';

export const mockUsers: User[] = [
  { id: 'admin_root', name: 'ADMINISTRADOR', role: 'ADMIN', pin: '741236', balanceUSD: 0 }
];

export const mockProducts: Product[] = [
  { id: 'p1', name: 'CHESSTRISS', priceUSD: 1.50, stock: 20 },
  { id: 'p2', name: 'GOLPE', priceUSD: 1.00, stock: 15 },
  { id: 'p3', name: 'DORITO', priceUSD: 1.50, stock: 10 },
  { id: 'p4', name: 'CLUB SOCIAL', priceUSD: 0.50, stock: 50 },
  { id: 'p5', name: 'MARIA', priceUSD: 0.40, stock: 30 },
  { id: 'p6', name: 'PIRULIN', priceUSD: 8.00, stock: 5 },
  { id: 'p7', name: 'COCOSETTE', priceUSD: 1.50, stock: 25 },
  { id: 'p8', name: 'FLIPS', priceUSD: 2.50, stock: 12 },
];

export const mockConfig: AppConfig = {
  exchangeRate: 45.30,
  cutoffDays: 5,
  bankDetails: {
    bank: 'Banco Mercantil',
    owner: 'MICHAEL YANEZ',
    idCard: 'V-25033043',
    phone: '04242404388'
  }
};

export const mockTransactions: Transaction[] = [];
