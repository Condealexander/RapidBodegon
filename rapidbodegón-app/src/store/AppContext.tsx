import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Product, Transaction, AppConfig } from '../types';
import { mockProducts, mockConfig, mockTransactions } from '../data/mock';
import { db, auth } from '../firebase';
import {
  collection, doc, onSnapshot, setDoc, updateDoc, increment, getDoc,
  runTransaction, writeBatch
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

interface ConsumptionResult {
  success: boolean;
  error?: string;
}

export interface ProductImportRow {
  name: string;
  stock: number;
  priceUSD?: number;
}

interface ProductImportResult {
  updated: number;
  created: number;
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
  addConsumption: (userId: string, productId: string, quantity: number) => Promise<ConsumptionResult>;
  reportPayment: (userId: string, amountUSD: number, reference: string) => Promise<void>;
  approvePayment: (transactionId: string) => Promise<void>;
  rejectPayment: (transactionId: string) => Promise<void>;
  updateExchangeRate: (rate: number) => Promise<void>;
  updateProductStock: (productId: string, newStock: number) => Promise<void>;
  importProducts: (rows: ProductImportRow[]) => Promise<ProductImportResult>;
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

const slugify = (name: string) =>
  normalizeName(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export const AppProvider = ({ children }: { children: ReactNode }) => {

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>(mockProducts);
  const [transactions, setTransactions] = useState<Transaction[]>(mockTransactions);
  const [config, setConfig] = useState<AppConfig>(mockConfig);

  // NOTE: the ADMIN account is no longer bootstrapped from client code.
  // It's created (and its PIN rotated) with scripts/create-admin.mjs,
  // which uses the Firebase Admin SDK server-side — so the admin PIN never
  // ships inside the JS bundle served to the browser. That script also
  // seeds the initial product catalog and config on first run.

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

  // Consumption is atomic: check stock, decrement it, credit the balance and
  // log the transaction all inside one Firestore transaction — so two loads
  // happening at the same time can never leave stock negative.
  const addConsumption = async (userId: string, productId: string, quantity: number): Promise<ConsumptionResult> => {
    const productRef = doc(db, 'products', productId);
    const userRef = doc(db, 'users', userId);
    const txRef = doc(collection(db, 'transactions'));

    try {
      await runTransaction(db, async (transaction) => {
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists()) {
          throw new Error('El producto ya no existe.');
        }
        const product = productSnap.data() as Product;

        if (product.stock < quantity) {
          throw new Error(`Stock insuficiente de "${product.name}" (disponible: ${product.stock}).`);
        }

        const amountUSD = product.priceUSD * quantity;
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

        transaction.set(txRef, newTx);
        transaction.update(userRef, { balanceUSD: increment(amountUSD) });
        transaction.update(productRef, { stock: increment(-quantity) });
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'No se pudo registrar el consumo.' };
    }
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

  // Manual inventory adjustment (admin sets the stock to an exact value).
  const updateProductStock = async (productId: string, newStock: number) => {
    await updateDoc(doc(db, 'products', productId), { stock: newStock });
  };

  // Bulk import/update from an uploaded Excel/CSV file (parsed by the UI
  // layer into simple rows). Matches existing products by name; creates a
  // new product doc for any name that doesn't match yet.
  const importProducts = async (rows: ProductImportRow[]): Promise<ProductImportResult> => {
    const batch = writeBatch(db);
    let updated = 0;
    let created = 0;

    rows.forEach(row => {
      const cleanName = row.name.trim().toUpperCase();
      const existing = products.find(p => p.name.toUpperCase() === cleanName);

      if (existing) {
        const patch: Partial<Product> = { stock: row.stock };
        if (row.priceUSD !== undefined && !isNaN(row.priceUSD)) {
          patch.priceUSD = row.priceUSD;
        }
        batch.update(doc(db, 'products', existing.id), patch);
        updated++;
      } else {
        const newId = slugify(cleanName) || `prod-${Date.now()}-${created}`;
        const newProduct: Product = {
          id: newId,
          name: cleanName,
          priceUSD: row.priceUSD !== undefined && !isNaN(row.priceUSD) ? row.priceUSD : 0,
          stock: row.stock
        };
        batch.set(doc(db, 'products', newId), newProduct);
        created++;
      }
    });

    await batch.commit();
    return { updated, created };
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
      updateExchangeRate,
      updateProductStock,
      importProducts
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
