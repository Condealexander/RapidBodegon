import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { User, Product, Transaction, AppConfig } from '../types';
import { mockProducts, mockConfig, mockTransactions } from '../data/mock';
import { db, auth, functions } from '../firebase';
import {
  collection, doc, onSnapshot, setDoc, getDoc,
  runTransaction, query, where, orderBy, limit
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  User as FirebaseAuthUser,
  UserCredential
} from 'firebase/auth';
import { listPastUnclosedCycles } from '../utils/cycle';

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

// Registro histórico de un ciclo de cobro ya cerrado (corte 3/10/17/25).
export interface Cycle {
  id: string;            // YYYY-MM-DD de la fecha de corte
  periodStart: string;   // ISO
  periodEnd: string;     // ISO
  totalCollected: number;
  totalConsumption: number;
  closedAt: string;      // ISO
}

interface AppContextType {
  currentUser: User | null;
  authLoading: boolean;
  users: User[];
  products: Product[];
  transactions: Transaction[];
  config: AppConfig;
  cycles: Cycle[];
  login: (name: string, pin: string) => Promise<RegisterResult>;
  register: (name: string, pin: string) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  addConsumption: (userId: string, productId: string, quantity: number) => Promise<ConsumptionResult>;
  requestConsumption: (productId: string, quantity: number) => Promise<RegisterResult>;
  approveConsumption: (transactionId: string) => Promise<RegisterResult>;
  rejectConsumption: (transactionId: string) => Promise<RegisterResult>;
  reportPayment: (userId: string, amountUSD: number, reference: string) => Promise<RegisterResult>;
  approvePayment: (transactionId: string) => Promise<RegisterResult>;
  rejectPayment: (transactionId: string) => Promise<RegisterResult>;
  updateExchangeRate: (rate: number) => Promise<RegisterResult>;
  updateProductStock: (productId: string, newStock: number) => Promise<RegisterResult>;
  importProducts: (rows: ProductImportRow[]) => Promise<ProductImportResult | { updated: 0; created: 0; error: string }>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const AUTH_DOMAIN_SUFFIX = 'rapidbodegon.local';

const normalizeName = (name: string) =>
  name.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const emailForName = (name: string) =>
  `${normalizeName(name).replace(/[^A-Z0-9]/g, '')}@${AUTH_DOMAIN_SUFFIX}`;

async function invokeMutation<TData extends object>(
  name: string,
  data: TData,
  fallback: string
): Promise<RegisterResult> {
  try {
    const callable = httpsCallable<TData, RegisterResult>(functions, name);
    return (await callable(data)).data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : fallback,
    };
  }
}

export const AppProvider = ({ children }: { children: ReactNode }) => {

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>(mockProducts);
  const [transactions, setTransactions] = useState<Transaction[]>(mockTransactions);
  const [config, setConfig] = useState<AppConfig>(mockConfig);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [transactionsReady, setTransactionsReady] = useState(false);
  const [cyclesReady, setCyclesReady] = useState(false);

  const registeringRef = useRef(false);
  // Evita lanzar el cierre de ciclos más de una vez por sesión.
  const cycleCloseAttemptedRef = useRef(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser: FirebaseAuthUser | null) => {
      if (!fbUser) {
        setCurrentUser(null);
        setAuthLoading(false);
        setAuthReady(true);
        return;
      }
      try {
        const profileSnap = await getDoc(doc(db, 'users', fbUser.uid));
        if (profileSnap.exists()) {
          setCurrentUser({ id: profileSnap.id, ...profileSnap.data() } as User);
        } else if (!registeringRef.current) {
          setCurrentUser(null);
        }
      } catch (e) {
        console.warn('Error loading user profile:', e);
        if (!registeringRef.current) setCurrentUser(null);
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

    registeringRef.current = true;
    let cred: UserCredential | null = null;
    try {
      cred = await createUserWithEmailAndPassword(auth, emailForName(name), pin);
      const newUser: User = {
        id: cred.user.uid,
        name: cleanName,
        role: 'CLIENT',
        balanceUSD: 0
      };
      await setDoc(doc(db, 'users', cred.user.uid), newUser);
      setCurrentUser(newUser);
      return { success: true };
    } catch (e: any) {
      if (cred) {
        try { await cred.user.delete(); } catch { /* nada más que hacer */ }
      }
      if (e?.code === 'auth/email-already-in-use') {
        return { success: false, error: 'Ya existe un usuario registrado con ese nombre.' };
      }
      if (e?.code === 'auth/weak-password') {
        return { success: false, error: 'El PIN debe tener al menos 8 dígitos.' };
      }
      return { success: false, error: 'No se pudo completar el registro. Intente de nuevo.' };
    } finally {
      registeringRef.current = false;
    }
  };

  // Users
  useEffect(() => {
    if (!authReady || !currentUser) return;

    if (currentUser.role === 'ADMIN') {
      const usersCol = collection(db, 'users');
      const unsub = onSnapshot(usersCol, (snapshot) => {
        const list: User[] = [];
        snapshot.forEach(docSnap => list.push({ id: docSnap.id, ...docSnap.data() } as User));
        setUsers(list);
      }, (error) => console.warn('Firestore users listener warning:', error));
      return () => unsub();
    }

    const unsub = onSnapshot(doc(db, 'users', currentUser.id), (docSnap) => {
      if (docSnap.exists()) {
        const updated = { id: docSnap.id, ...docSnap.data() } as User;
        setCurrentUser(updated);
        setUsers([updated]);
      }
    }, (error) => console.warn('Firestore own-user listener warning:', error));
    return () => unsub();
  }, [authReady, currentUser?.id, currentUser?.role]);

  // Products
  useEffect(() => {
    if (!authReady || !currentUser) return;
    const productsCol = collection(db, 'products');
    const unsub = onSnapshot(productsCol, (snapshot) => {
      const list: Product[] = [];
      snapshot.forEach(docSnap => list.push({ id: docSnap.id, ...docSnap.data() } as Product));
      setProducts(list);
    }, (error) => console.warn('Firestore products listener warning:', error));
    return () => unsub();
  }, [authReady, currentUser?.id]);

  // Transactions
  useEffect(() => {
    if (!authReady || !currentUser) {
      setTransactionsReady(false);
      return;
    }
    setTransactionsReady(false);

    const txCol = collection(db, 'transactions');
    const txQuery = currentUser.role === 'ADMIN'
      ? query(txCol, orderBy('date', 'desc'), limit(1000))
      : query(txCol, where('userId', '==', currentUser.id));

    const unsub = onSnapshot(
      txQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        const list: Transaction[] = [];
        snapshot.forEach(docSnap => list.push({ id: docSnap.id, ...docSnap.data() } as Transaction));
        list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setTransactions(list);
        if (!snapshot.metadata.fromCache) setTransactionsReady(true);
      },
      (error) => console.warn('Firestore transactions listener warning:', error)
    );
    return () => unsub();
  }, [authReady, currentUser?.id, currentUser?.role]);

  // Config
  useEffect(() => {
    if (!authReady || !currentUser) return;
    const configDoc = doc(db, 'config', 'global');
    const unsub = onSnapshot(configDoc, (docSnap) => {
      if (docSnap.exists()) setConfig(docSnap.data() as AppConfig);
    }, (error) => console.warn('Firestore config listener warning:', error));
    return () => unsub();
  }, [authReady, currentUser?.id]);

  // Cycles (solo el admin puede leerlos y cerrarlos — ver firestore.rules)
  useEffect(() => {
    if (!authReady || !currentUser || currentUser.role !== 'ADMIN') {
      setCyclesReady(false);
      return;
    }
    setCyclesReady(false);
    const cyclesCol = collection(db, 'cycles');
    const unsub = onSnapshot(
      query(cyclesCol, orderBy('periodEnd', 'desc'), limit(24)),
      { includeMetadataChanges: true },
      (snapshot) => {
        const list: Cycle[] = [];
        snapshot.forEach(docSnap => list.push({ id: docSnap.id, ...docSnap.data() } as Cycle));
        setCycles(list);
        if (!snapshot.metadata.fromCache) setCyclesReady(true);
      },
      (error) => console.warn('Firestore cycles listener warning:', error)
    );
    return () => unsub();
  }, [authReady, currentUser?.id, currentUser?.role]);

  // Cierre automático de ciclos vencidos: corre UNA vez por sesión de admin,
  // una vez que ya sabemos qué ciclos están cerrados (cycles) y tenemos las
  // transacciones cargadas para calcular los totales. No es instantáneo al
  // llegar la fecha de corte (no hay backend corriendo solo) — se pone al
  // día la primera vez que un admin abre el panel después del corte.
  useEffect(() => {
    if (!authReady || !currentUser || currentUser.role !== 'ADMIN') return;
    if (cycleCloseAttemptedRef.current) return;
    if (!transactionsReady || !cyclesReady) return;

    cycleCloseAttemptedRef.current = true;

    const closedIds = new Set(cycles.map(c => c.id));
    const due = listPastUnclosedCycles(new Date(), closedIds);
    if (due.length === 0) return;

    (async () => {
      for (const period of due) {
        const totalCollected = transactions
          .filter(t => t.type === 'PAYMENT' && t.status === 'COMPLETED')
          .filter(t => {
            const d = new Date(t.date).getTime();
            return d >= period.start.getTime() && d < period.end.getTime();
          })
          .reduce((acc, t) => acc + t.amountUSD, 0);

        const totalConsumption = transactions
          .filter(t => t.type === 'CONSUMPTION' && t.status === 'COMPLETED')
          .filter(t => {
            const d = new Date(t.date).getTime();
            return d >= period.start.getTime() && d < period.end.getTime();
          })
          .reduce((acc, t) => acc + t.amountUSD, 0);

        try {
          await runTransaction(db, async (transaction) => {
            const cycleRef = doc(db, 'cycles', period.id);
            const cycleSnapshot = await transaction.get(cycleRef);
            if (cycleSnapshot.exists()) return;

            transaction.set(cycleRef, {
              periodStart: period.start.toISOString(),
              periodEnd: period.end.toISOString(),
              totalCollected,
              totalConsumption,
              closedAt: new Date().toISOString()
            });
          });
        } catch (e) {
          console.warn('No se pudo cerrar el ciclo', period.id, e);
        }
      }
    })();
  }, [authReady, currentUser?.id, currentUser?.role, cycles, cyclesReady, transactions, transactionsReady]);

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
      if (e?.code === 'auth/too-many-requests') {
        return { success: false, error: 'Demasiados intentos fallidos. Intenta de nuevo en unos minutos.' };
      }
      return { success: false, error: 'Nombre o PIN incorrecto.' };
    }
  };

  const logout = async () => {
    await signOut(auth);
    setUsers([]);
    setTransactions([]);
    setCycles([]);
    cycleCloseAttemptedRef.current = false;
  };

  const addConsumption = (userId: string, productId: string, quantity: number): Promise<ConsumptionResult> =>
    invokeMutation('addConsumption', { userId, productId, quantity }, 'No se pudo registrar el consumo.');

  const requestConsumption = (productId: string, quantity: number): Promise<RegisterResult> =>
    invokeMutation('requestConsumption', { productId, quantity }, 'No se pudo reportar el consumo. Intenta de nuevo.');

  const approveConsumption = (transactionId: string): Promise<RegisterResult> =>
    invokeMutation('confirmConsumption', { transactionId }, 'No se pudo confirmar el consumo.');

  const rejectConsumption = (transactionId: string): Promise<RegisterResult> =>
    invokeMutation('rejectConsumption', { transactionId }, 'No se pudo rechazar la solicitud.');

  const reportPayment = (_userId: string, amountUSD: number, reference: string): Promise<RegisterResult> =>
    invokeMutation('reportPayment', { amountUSD, reference }, 'No se pudo reportar el pago. Intenta de nuevo.');

  const approvePayment = (transactionId: string): Promise<RegisterResult> =>
    invokeMutation('confirmPayment', { transactionId }, 'No se pudo aprobar el pago. Intenta de nuevo.');

  const rejectPayment = (transactionId: string): Promise<RegisterResult> =>
    invokeMutation('rejectPayment', { transactionId }, 'No se pudo rechazar el pago. Intenta de nuevo.');

  const updateExchangeRate = (rate: number): Promise<RegisterResult> =>
    invokeMutation('setExchangeRate', { rate }, 'No se pudo actualizar la tasa de cambio.');

  const updateProductStock = (productId: string, stock: number): Promise<RegisterResult> =>
    invokeMutation('updateProductStock', { productId, stock }, 'No se pudo actualizar el stock. ¿El producto existe en Firestore?');

  const importProducts = async (rows: ProductImportRow[]): Promise<ProductImportResult | { updated: 0; created: 0; error: string }> => {
    try {
      const callable = httpsCallable<{ rows: ProductImportRow[] }, ProductImportResult>(functions, 'importProducts');
      return (await callable({ rows })).data;
    } catch (error) {
      return {
        updated: 0,
        created: 0,
        error: error instanceof Error ? error.message : 'No se pudo importar el archivo. Verifica el formato.',
      };
    }
  };

  const value: AppContextType = {
    currentUser,
    authLoading,
    users,
    products,
    transactions,
    config,
    cycles,
    login,
    register,
    logout,
    addConsumption,
    requestConsumption,
    approveConsumption,
    rejectConsumption,
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