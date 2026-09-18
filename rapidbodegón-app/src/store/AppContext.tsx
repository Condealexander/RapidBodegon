import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Product, Transaction, AppConfig } from '../types';
import { mockProducts, mockConfig, mockTransactions } from '../data/mock';
import { db, auth } from '../firebase';
import {
  collection, doc, onSnapshot, setDoc, updateDoc, increment, getDocs, getDoc, query, where
} from 'firebase/firestore';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  User as FirebaseAuthUser
} from 'firebase/auth';

interface RegisterResult {
  success: boolean;
  error?: string;
}

interface AppContextType {
  currentUser: User | null;
  users: User[];
  products: Product[];
  transactions: Transaction[];
  config: AppConfig;
  login: (name: string, pin: string) => Promise<boolean>;
  register: (name: string, pin: string) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  addConsumption: (userId: string, productId: string, quantity: number) => Promise<void>;
  reportPayment: (userId: string, amountUSD: number, reference: string) => Promise<void>;
  approvePayment: (transactionId: string) => Promise<void>;
  rejectPayment: (transactionId: string) => Promise<void>;
  updateExchangeRate: (rate: number) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Firebase Auth needs a real email format. Clients keep logging in with
// "Nombre + PIN" in the UI; under the hood that maps to a synthetic email
// (NOMBRE@rapidbodegon.local) + the PIN as the Auth password.
const AUTH_DOMAIN_SUFFIX = 'rapidbodegon.local';

const normalizeName = (name: string) =>
  name.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const emailForName = (name: string) =>
  `${normalizeName(name).replace(/[^A-Z0-9]/g, '')}@${AUTH_DOMAIN_SUFFIX}`;

export const AppProvider = ({ children }: { children: ReactNode }) => {

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>(mockProducts);
  const [transactions, setTransactions] = useState<Transaction[]>(mockTransactions);
  const [config, setConfig] = useState<AppConfig>(mockConfig);

  // One-time ADMIN bootstrap: if no ADMIN profile exists yet, create the
  // Firebase Auth account + Firestore profile from env vars, then seed the
  // initial product catalog and config. Configure these in .env.local
  // (gitignored) — never commit real credentials — and rotate the PIN
  // after the first successful admin login.
  useEffect(() => {
    const bootstrapAdmin = async () => {
      const bootstrapName = import.meta.env.VITE_ADMIN_BOOTSTRAP_NAME as string | undefined;
      const bootstrapPin = import.meta.env.VITE_ADMIN_BOOTSTRAP_PIN as string | undefined;
      if (!bootstrapName || !bootstrapPin) return;

      try {
        const adminsSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'ADMIN')));
        if (!adminsSnap.empty) return; // Already bootstrapped, nothing to do.

        const email = emailForName(bootstrapName);
        const cred = await createUserWithEmailAndPassword(auth, email, bootstrapPin);

        const adminUser: User = { 	
          id: cred.user.uid,
          name: normalizeName(bootstrapName),
          role: 'ADMIN',
          balanceUSD: 0
        };
        await setDoc(doc(db, 'users', cred.user.uid), adminUser);

        // Seed inventory + config alongside the very first admin only.
        for (const p of mockProducts) {
          await setDoc(doc(db, 'products', p.id), p);
        }
        await setDoc(doc(db, 'config', 'global'), mockConfig);

        // Don't auto-login as admin after bootstrap; make them sign in.
        await signOut(auth);
      } catch (e: any) {
        // Another tab/instance may have bootstrapped concurrently — fine.
        if (e?.code !== 'auth/email-already-in-use') {
          console.warn('Admin bootstrap warning:', e);
        }
      }
    };
    bootstrapAdmin();
  }, []);

  // Track the Firebase Auth session and hydrate the matching Firestore profile.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser: FirebaseAuthUser | null) => {
      if (!fbUser) {
        setCurrentUser(null);
        setAuthLoading(false);
        return;
      }
      try {
        const profileSnap = await getDoc(doc(db, 'users', fbUser.uid));
        setCurrentUser(profileSnap.exists() ? ({ id: profileSnap.id, ...profileSnap.data() } as User) : null);
      } catch (e) {
        console.warn('Error loading user profile:', e);
        setCurrentUser(null);
      } finally {
        setAuthLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const register = async (name: string, pin: string): Promise<RegisterResult> => {
    const cleanName = normalizeName(name);
    const existing = users.find(u => u.name.toUpperCase() === cleanName);
    if (existing) {
      return { success: false, error: 'Ya existe un usuario registrado con ese nombre.' };
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, emailForName(name), pin);
      const newUser: User = {
        id: cred.user.uid,
        name: cleanName,
        role: 'CLIENT',
        balanceUSD: 0
      };
      await setDoc(doc(db, 'users', cred.user.uid), newUser);
      return { success: true };
    } catch (e: any) {
      if (e?.code === 'auth/email-already-in-use') {
        return { success: false, error: 'Ya existe un usuario registrado con ese nombre.' };
      }
      if (e?.code === 'auth/weak-password') {
        return { success: false, error: 'El PIN debe tener al menos 6 dígitos.' };
      }
      return { success: false, error: 'No se pudo completar el registro. Intente de nuevo.' };
    }
  };

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
      const list: Transaction[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Transaction);
      });
      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(list);
    }, (error) => {
      console.warn('Firestore transactions listener warning:', error);
    });
    return () => unsub();
  }, []);

  // Realtime Firestore listener for Config
  useEffect(() => {
    const configDoc = doc(db, 'config', 'global');
    const unsub = onSnapshot(configDoc, (docSnap) => {
      if (docSnap.exists()) {
        setConfig(docSnap.data() as AppConfig);
      }
    }, (error) => {
      console.warn('Firestore config listener warning:', error);
    });
    return () => unsub();
  }, []);

  // Sync currentUser with realtime users list (e.g. balance changes)
  useEffect(() => {
    if (currentUser) {
      const updated = users.find(u => u.id === currentUser.id);
      if (updated) setCurrentUser(updated);
    }
  }, [users]);

  const login = async (name: string, pin: string): Promise<boolean> => {
    try {
      await signInWithEmailAndPassword(auth, emailForName(name), pin);
      return true;
    } catch (e) {
      return false;
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

// restruturacion de codigo agente claude

  const addConsumption = async (userId: string, productId: string, quantity: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const amountUSD = product.priceUSD * quantity;
    const txRef = doc(collection(db, 'transactions'));

    const newTx: Transaction = {
      id: txRef.id,
      userId,
      type: 'CONSUMPTION',
      amountUSD,
      date: new Date().toISOString(),
      status: 'COMPLETED',
      productId,
      quantity
    };

    await setDoc(txRef, newTx);
    await updateDoc(doc(db, 'users', userId), { balanceUSD: increment(amountUSD) });
  };

  const reportPayment = async (userId: string, amountUSD: number, reference: string) => {
    const txRef = doc(collection(db, 'transactions'));
    const newTx: Transaction = {
      id: txRef.id,
      userId,
      type: 'PAYMENT',
      amountUSD,
      date: new Date().toISOString(),
      status: 'PENDING',
      reference
    };
    await setDoc(txRef, newTx);
  };

  const approvePayment = async (transactionId: string) => {
    const tx = transactions.find(t => t.id === transactionId);
    if (!tx) return;
    await updateDoc(doc(db, 'transactions', transactionId), { status: 'COMPLETED' });
    await updateDoc(doc(db, 'users', tx.userId), { balanceUSD: increment(-tx.amountUSD) });
  };

  const rejectPayment = async (transactionId: string) => {
    await updateDoc(doc(db, 'transactions', transactionId), { status: 'REJECTED' });
  };

  const updateExchangeRate = async (rate: number) => {
    await updateDoc(doc(db, 'config', 'global'), { exchangeRate: rate });
  };

  return (
    <AppContext.Provider value={{
      currentUser,
      users,
      products,
      transactions,
      config,
      login,
      register,
      logout,
      addConsumption,
      reportPayment,
      approvePayment,
      rejectPayment,
      updateExchangeRate
    }}>
      {!authLoading && children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

