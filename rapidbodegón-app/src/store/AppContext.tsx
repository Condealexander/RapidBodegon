import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Product, Transaction, AppConfig } from '../types';
import { mockProducts, mockConfig, mockTransactions } from '../data/mock';
import { db, auth } from '../firebase';
import {
  collection, doc, onSnapshot, setDoc, updateDoc, increment, getDoc,
  runTransaction, writeBatch, query, where, orderBy, limit
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
  login: (name: string, pin: string) => Promise<RegisterResult>;
  register: (name: string, pin: string) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  addConsumption: (userId: string, productId: string, quantity: number) => Promise<ConsumptionResult>;
  reportPayment: (userId: string, amountUSD: number, reference: string) => Promise<RegisterResult>;
  approvePayment: (transactionId: string) => Promise<RegisterResult>;
  rejectPayment: (transactionId: string) => Promise<RegisterResult>;
  updateExchangeRate: (rate: number) => Promise<RegisterResult>;
  updateProductStock: (productId: string, newStock: number) => Promise<RegisterResult>;
  importProducts: (rows: ProductImportRow[]) => Promise<ProductImportResult | { updated: 0; created: 0; error: string }>;
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
  const [authReady, setAuthReady] = useState(false);
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
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, []);

  const register = async (name: string, pin: string): Promise<RegisterResult> => {
    const cleanName = normalizeName(name);

        if (pin.length < 8) {                                          
      return { success: false, error: 'El PIN debe tener al menos 8 dígitos.' };  
    } 

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
        return { success: false, error: 'El PIN debe tener al menos 8 dígitos.' };
      }
      return { success: false, error: 'No se pudo completar el registro. Intente de nuevo.' };
    }
  };

  // Realtime Firestore listener for Users.
  // ADMIN watches the whole directory (needed for the client list/reports).
  // CLIENT watches only their own document — this is the single biggest
  // cost saver: instead of every client paying for a read of ALL users on
  // every balance change, they only pay for reads of their own doc.
  useEffect(() => {
    if (!authReady || !currentUser) return;

    if (currentUser.role === 'ADMIN') {
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
    }

    const unsub = onSnapshot(doc(db, 'users', currentUser.id), (docSnap) => {
      if (docSnap.exists()) {
        const updated = { id: docSnap.id, ...docSnap.data() } as User;
        setCurrentUser(updated);
        setUsers([updated]);
      }
    }, (error) => {
      console.warn('Firestore own-user listener warning:', error);
    });
    return () => unsub();
  }, [authReady, currentUser?.id, currentUser?.role]);

  // Realtime Firestore listener for Products
  useEffect(() => {
    if (!authReady || !currentUser) return;
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
  }, [authReady, currentUser]);

  // Realtime Firestore listener for Transactions.
  // ADMIN watches everything, capped to the most recent 1000 (so the
  // listener's cost doesn't keep growing forever as history piles up).
  // CLIENT watches only their own transactions — same reasoning as users
  // above: this is the collection that changes the most often, so scoping
  // it per-client is what saves the most reads.
  useEffect(() => {
    if (!authReady || !currentUser) return;

    const txCol = collection(db, 'transactions');
    const txQuery = currentUser.role === 'ADMIN'
      ? query(txCol, orderBy('date', 'desc'), limit(1000))
      : query(txCol, where('userId', '==', currentUser.id));

    const unsub = onSnapshot(txQuery, (snapshot) => {
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
  }, [authReady, currentUser?.id, currentUser?.role]);

  // Realtime Firestore listener for Config
  useEffect(() => {
    if (!authReady || !currentUser) return;
    const configDoc = doc(db, 'config', 'global');
    const unsub = onSnapshot(configDoc, (docSnap) => {
      if (docSnap.exists()) {
        setConfig(docSnap.data() as AppConfig);
      }
    }, (error) => {
      console.warn('Firestore config listener warning:', error);
    });
    return () => unsub();
  }, [authReady, currentUser]);

  // Keep currentUser in sync with the full users list — only relevant for
  // ADMIN now, since CLIENT gets this straight from their own-doc listener
  // above (and 'users' for a CLIENT is just [currentUser] anyway).
  useEffect(() => {
    if (currentUser?.role === 'ADMIN') {
      const updated = users.find(u => u.id === currentUser.id);
      if (updated) setCurrentUser(updated);
    }
  }, [users]);

  const login = async (name: string, pin: string): Promise<RegisterResult> => {
    try {
      await signInWithEmailAndPassword(auth, emailForName(name), pin);
      return { success: true };
    } catch (e: any) {
      // Mensaje genérico a propósito: no decimos si el usuario no existe o
      // si el PIN está mal, para no facilitar enumeración de cuentas.
      if (e?.code === 'auth/too-many-requests') {
        return { success: false, error: 'Demasiados intentos fallidos. Intenta de nuevo en unos minutos.' };
      }
      return { success: false, error: 'Nombre o PIN incorrecto.' };
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

  const reportPayment = async (userId: string, amountUSD: number, reference: string): Promise<RegisterResult> => {
    try {
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
      return { success: true };
    } catch (e: any) {
      return { success: false, error: 'No se pudo reportar el pago. Intenta de nuevo.' };
    }
  };

  const approvePayment = async (transactionId: string): Promise<RegisterResult> => {
    try {
      const tx = transactions.find(t => t.id === transactionId);
      if (!tx) return { success: false, error: 'La transacción ya no existe.' };
      await updateDoc(doc(db, 'transactions', transactionId), { status: 'COMPLETED' });
      await updateDoc(doc(db, 'users', tx.userId), { balanceUSD: increment(-tx.amountUSD) });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: 'No se pudo aprobar el pago. Intenta de nuevo.' };
    }
  };
 

  const rejectPayment = async (transactionId: string): Promise<RegisterResult> => {
    try {
      await updateDoc(doc(db, 'transactions', transactionId), { status: 'REJECTED' });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: 'No se pudo rechazar el pago. Intenta de nuevo.' };
    }
  };

  const updateExchangeRate = async (rate: number): Promise<RegisterResult> => {
    try {
      // setDoc con merge en vez de updateDoc: no falla si config/global
      // todavía no existiera por alguna razón.
      await setDoc(doc(db, 'config', 'global'), { exchangeRate: rate }, { merge: true });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: 'No se pudo actualizar la tasa de cambio.' };
    }
  };

  // Manual inventory adjustment (admin sets the stock to an exact value).
  const updateProductStock = async (productId: string, newStock: number): Promise<RegisterResult> => {
    try {
      await updateDoc(doc(db, 'products', productId), { stock: newStock });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: 'No se pudo actualizar el stock. ¿El producto existe en Firestore?' };
    }
  };

  // Bulk import/update from an uploaded Excel/CSV file (parsed by the UI
  // layer into simple rows). Matches existing products by name; creates a
  // new product doc for any name that doesn't match yet.
  const importProducts = async (rows: ProductImportRow[]): Promise<ProductImportResult | { updated: 0; created: 0; error: string }> => {
    try {
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
    } catch (e: any) {
      return { updated: 0, created: 0, error: 'No se pudo importar el archivo. Verifica el formato.' };
    }
    
  };

  const value: AppContextType = {
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
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

export const useApp = useAppContext;

export default AppContext;