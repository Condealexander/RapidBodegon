import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Product, Transaction, AppConfig } from '../types';
import { mockUsers, mockProducts, mockConfig, mockTransactions } from '../data/mock';
import { db } from '../firebase';
import { 
  collection, doc, onSnapshot, setDoc, updateDoc, increment 
} from 'firebase/firestore';

interface AppContextType {
  currentUser: User | null;
  users: User[];
  products: Product[];
  transactions: Transaction[];
  config: AppConfig;
  login: (name: string, pin: string) => boolean;
  logout: () => void;
  addConsumption: (userId: string, productId: string, quantity: number) => Promise<void>;
  reportPayment: (userId: string, amountUSD: number, reference: string) => Promise<void>;
  approvePayment: (transactionId: string) => Promise<void>;
  rejectPayment: (transactionId: string) => Promise<void>;
  updateExchangeRate: (rate: number) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>(mockUsers);
  const [products, setProducts] = useState<Product[]>(mockProducts);
  const [transactions, setTransactions] = useState<Transaction[]>(mockTransactions);
  const [config, setConfig] = useState<AppConfig>(mockConfig);

  // Realtime Firestore listener for Users
  useEffect(() => {
    const usersCol = collection(db, 'users');
    const unsub = onSnapshot(usersCol, (snapshot) => {
      if (snapshot.empty) {
        mockUsers.forEach(user => {
          setDoc(doc(db, 'users', user.id), user);
        });
      } else {
        const list: User[] = [];
        snapshot.forEach(docSnap => {
          list.push({ id: docSnap.id, ...docSnap.data() } as User);
        });
        setUsers(list);
      }
    }, (error) => {
      console.warn('Firestore users listener warning:', error);
    });
    return () => unsub();
  }, []);

  // Realtime Firestore listener for Products
  useEffect(() => {
    const productsCol = collection(db, 'products');
    const unsub = onSnapshot(productsCol, (snapshot) => {
      if (snapshot.empty) {
        mockProducts.forEach(prod => {
          setDoc(doc(db, 'products', prod.id), prod);
        });
      } else {
        const list: Product[] = [];
        snapshot.forEach(docSnap => {
          list.push({ id: docSnap.id, ...docSnap.data() } as Product);
        });
        setProducts(list);
      }
    }, (error) => {
      console.warn('Firestore products listener warning:', error);
    });
    return () => unsub();
  }, []);

  // Realtime Firestore listener for Transactions
  useEffect(() => {
    const txCol = collection(db, 'transactions');
    const unsub = onSnapshot(txCol, (snapshot) => {
      if (snapshot.empty) {
        mockTransactions.forEach(tx => {
          setDoc(doc(db, 'transactions', tx.id), tx);
        });
      } else {
        const list: Transaction[] = [];
        snapshot.forEach(docSnap => {
          list.push({ id: docSnap.id, ...docSnap.data() } as Transaction);
        });
        list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setTransactions(list);
      }
    }, (error) => {
      console.warn('Firestore transactions listener warning:', error);
    });
    return () => unsub();
  }, []);

  // Realtime Firestore listener for Config
  useEffect(() => {
    const configDoc = doc(db, 'config', 'global');
    const unsub = onSnapshot(configDoc, (docSnap) => {
      if (!docSnap.exists()) {
        setDoc(configDoc, mockConfig);
      } else {
        setConfig(docSnap.data() as AppConfig);
      }
    }, (error) => {
      console.warn('Firestore config listener warning:', error);
    });
    return () => unsub();
  }, []);

  // Sync currentUser with realtime users list
  useEffect(() => {
    if (currentUser) {
      const updated = users.find(u => u.id === currentUser.id);
      if (updated) setCurrentUser(updated);
    }
  }, [users]);

  const login = (name: string, pin: string) => {
    const user = users.find(u => u.name.toUpperCase() === name.toUpperCase() && u.pin === pin);
    if (user) {
      setCurrentUser(user);
      return true;
    }
    return false;
  };

  const logout = () => setCurrentUser(null);

  const addConsumption = async (userId: string, productId: string, quantity: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const amountUSD = product.priceUSD * quantity;
    const txId = Date.now().toString();

    const newTx: Transaction = {
      id: txId,
      userId,
      type: 'CONSUMPTION',
      amountUSD,
      date: new Date().toISOString(),
      status: 'COMPLETED',
      productId,
      quantity
    };

    try {
      await setDoc(doc(db, 'transactions', txId), newTx);
      await updateDoc(doc(db, 'users', userId), {
        balanceUSD: increment(amountUSD)
      });
      await updateDoc(doc(db, 'products', productId), {
        stock: increment(-quantity)
      });
    } catch (e) {
      console.error('Error adding consumption to Firestore:', e);
    }
  };

  const reportPayment = async (userId: string, amountUSD: number, reference: string) => {
    const txId = Date.now().toString();
    const newTx: Transaction = {
      id: txId,
      userId,
      type: 'PAYMENT',
      amountUSD,
      date: new Date().toISOString(),
      status: 'PENDING',
      reference,
      bank: config.bankDetails.bank
    };

    try {
      await setDoc(doc(db, 'transactions', txId), newTx);
    } catch (e) {
      console.error('Error reporting payment to Firestore:', e);
    }
  };

  const approvePayment = async (transactionId: string) => {
    const tx = transactions.find(t => t.id === transactionId);
    if (!tx || tx.status !== 'PENDING') return;

    const user = users.find(u => u.id === tx.userId);
    const currentBalance = user ? user.balanceUSD : 0;
    const newBalance = Math.max(0, currentBalance - tx.amountUSD);

    try {
      await updateDoc(doc(db, 'transactions', transactionId), { status: 'COMPLETED' });
      await updateDoc(doc(db, 'users', tx.userId), { balanceUSD: newBalance });
    } catch (e) {
      console.error('Error approving payment in Firestore:', e);
    }
  };

  const rejectPayment = async (transactionId: string) => {
    try {
      await updateDoc(doc(db, 'transactions', transactionId), { status: 'REJECTED' });
    } catch (e) {
      console.error('Error rejecting payment in Firestore:', e);
    }
  };

  const updateExchangeRate = async (rate: number) => {
    try {
      await setDoc(doc(db, 'config', 'global'), { ...config, exchangeRate: rate });
    } catch (e) {
      console.error('Error updating exchange rate in Firestore:', e);
    }
  };

  return (
    <AppContext.Provider value={{
      currentUser, users, products, transactions, config,
      login, logout, addConsumption, reportPayment, approvePayment, rejectPayment, updateExchangeRate
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) throw new Error('useApp must be used within AppProvider');
  return context;
};
