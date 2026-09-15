import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Product, Transaction, AppConfig } from '../types';
import { mockUsers, mockProducts, mockConfig, mockTransactions } from '../data/mock';
import { db } from '../firebase';
import { 
  collection, doc, onSnapshot, setDoc, updateDoc, increment, getDocs
} from 'firebase/firestore';

interface AppContextType {
  currentUser: User | null;
  users: User[];
  products: Product[];
  transactions: Transaction[];
  config: AppConfig;
  login: (name: string, pin: string) => boolean;
  register: (name: string, pin: string) => Promise<boolean>;
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
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>(mockProducts);
  const [transactions, setTransactions] = useState<Transaction[]>(mockTransactions);
  const [config, setConfig] = useState<AppConfig>(mockConfig);

  // Seed initial data (admin user, products and config) if the DB is empty.
  useEffect(() => {
    const seedInitialData = async () => {
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        if (usersSnap.empty) {
          // Only create a single admin user so clients can register themselves
          await setDoc(doc(db, 'users', 'admin_root'), {
            id: 'admin_root',
            name: 'YO',
            role: 'ADMIN',
            pin: '741236', // Change this PIN to something secure for production
            balanceUSD: 0
          });

          // Preload inventory products
          for (const p of mockProducts) {
            await setDoc(doc(db, 'products', p.id), p);
          }

          // Initial configuration
          await setDoc(doc(db, 'config', 'global'), mockConfig);
        }
      } catch (e) {
        console.warn('Error while seeding initial data:', e);
      }
    };
    seedInitialData();
  }, []);

  // Realtime Firestore listener for Users
  useEffect(() => {
    const usersCol = collection(db, 'users');
    const unsub = onSnapshot(usersCol, (snapshot) => {
      const list: User[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as User);
      });
      setUsers(list);
    }, (error) => {
      console.warn('Firestore users listener warning:', error);
    });
    return () => unsub();
  }, []);
  
  const register = async (name: string, pin: string): Promise<boolean> => {
    const cleanName = name.trim().toUpperCase();
    // Check if a user with that name already exists
    const existing = users.find(u => u.name.toUpperCase() === cleanName);
    if (existing) {
      return false; // User already registered
    }
      
    const newId = Date.now().toString();
    const newUser: User = {
      id: newId,
      name: cleanName,
      role: 'CLIENT',
      pin: pin.trim(),
      balanceUSD: 0
    };

    await setDoc(doc(db, 'users', newId), newUser);
    setCurrentUser(newUser);
    return true;
  };

  // Realtime Firestore listener for Products
  useEffect(() => {
    const productsCol = collection(db, 'products');
    const unsub = onSnapshot(productsCol, (snapshot) => {
      const list: Product[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Product);
      });
      setProducts(list);
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

  ... (truncated)