import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { User, Product, Transaction, AppConfig, Expense, FinancialTotals } from '../types';
import { mockProducts, mockConfig, mockTransactions } from '../data/mock';
import { db, auth } from '../firebase';
import {
  collection, doc, onSnapshot, setDoc, updateDoc, increment, getDoc, getDocFromServer,
  runTransaction, writeBatch, query, where, orderBy, limit
} from 'firebase/firestore';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  User as FirebaseAuthUser,
  UserCredential
} from 'firebase/auth';
import { getPreviousCutoff, listPastUnclosedCycles } from '../utils/cycle';

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

interface ExchangeRateRefreshResult extends RegisterResult {
  updated: boolean;
  rate?: number;
}

interface DollarApiQuote {
  fuente?: unknown;
  promedio?: unknown;
}

const getVenezuelaDateKey = (date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

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
  currentCycleTransactions: Transaction[];
  expenses: Expense[];
  currentCycleExpenses: Expense[];
  expensesReady: boolean;
  currentCycleExpensesReady: boolean;
  financialTotals: FinancialTotals | null;
  financialTotalsReady: boolean;
  financialTotalsError: string | null;
  expensesError: string | null;
  currentCycleExpensesError: string | null;
  currentCycleTransactionsError: string | null;
  currentCycleTransactionsReady: boolean;
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
  addExpense: (description: string, amountUSD: number) => Promise<RegisterResult>;
  updateExchangeRate: (rate: number) => Promise<RegisterResult>;
  refreshExchangeRateFromSources: () => Promise<ExchangeRateRefreshResult>;
  updateProductStocks: (stocks: Array<{ productId: string; stock: number }>) => Promise<RegisterResult>;
  importProducts: (rows: ProductImportRow[]) => Promise<ProductImportResult | { updated: 0; created: 0; error: string }>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const AUTH_DOMAIN_SUFFIX = 'rapidbodegon.local';

const normalizeName = (name: string) =>
  name.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const emailForName = (name: string) =>
  `${normalizeName(name).replace(/[^A-Z0-9]/g, '')}@${AUTH_DOMAIN_SUFFIX}`;

export const AppProvider = ({ children }: { children: ReactNode }) => {

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>(mockProducts);
  const [transactions, setTransactions] = useState<Transaction[]>(mockTransactions);
  const [currentCycleTransactions, setCurrentCycleTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [currentCycleExpenses, setCurrentCycleExpenses] = useState<Expense[]>([]);
  const [expensesReady, setExpensesReady] = useState(false);
  const [currentCycleExpensesReady, setCurrentCycleExpensesReady] = useState(false);
  const [financialTotals, setFinancialTotals] = useState<FinancialTotals | null>(null);
  const [financialTotalsReady, setFinancialTotalsReady] = useState(false);
  const [financialTotalsError, setFinancialTotalsError] = useState<string | null>(null);
  const [expensesError, setExpensesError] = useState<string | null>(null);
  const [currentCycleExpensesError, setCurrentCycleExpensesError] = useState<string | null>(null);
  const [currentCycleTransactionsError, setCurrentCycleTransactionsError] = useState<string | null>(null);
  const [currentCycleTransactionsReady, setCurrentCycleTransactionsReady] = useState(false);
  const [config, setConfig] = useState<AppConfig>(mockConfig);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [transactionsReady, setTransactionsReady] = useState(false);
  const [cyclesReady, setCyclesReady] = useState(false);
  const currentCycleStartISO = getPreviousCutoff().toISOString();

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

  // Financial ledger: the aggregate is initialized once by the Admin SDK
  // migration script, then updated atomically with each payment/expense.
  useEffect(() => {
    if (!authReady || !currentUser || currentUser.role !== 'ADMIN') {
      setExpenses([]);
      setCurrentCycleExpenses([]);
      setExpensesReady(false);
      setCurrentCycleExpensesReady(false);
      setFinancialTotals(null);
      setFinancialTotalsReady(false);
      setFinancialTotalsError(null);
      setExpensesError(null);
      setCurrentCycleExpensesError(null);
      return;
    }

    setFinancialTotals(null);
    setExpenses([]);
    setCurrentCycleExpenses([]);
    setExpensesReady(false);
    setCurrentCycleExpensesReady(false);
    setFinancialTotalsReady(false);
    setFinancialTotalsError(null);
    setExpensesError(null);
    setCurrentCycleExpensesError(null);
    const financialRef = doc(db, 'financials', 'global');
    const unsubFinancial = onSnapshot(
      financialRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        setFinancialTotals(snapshot.exists() ? snapshot.data() as FinancialTotals : null);
        setFinancialTotalsError(null);
        if (!snapshot.metadata.fromCache) setFinancialTotalsReady(true);
      },
      (error) => {
        console.warn('Firestore financial totals listener warning:', error);
        setFinancialTotalsError(error.message);
      }
    );

    const expensesCol = collection(db, 'expenses');
    const unsubExpenses = onSnapshot(
      query(expensesCol, orderBy('date', 'desc'), limit(50)),
      { includeMetadataChanges: true },
      (snapshot) => {
        const list: Expense[] = [];
        snapshot.forEach(docSnap => list.push({ id: docSnap.id, ...docSnap.data() } as Expense));
        setExpenses(list);
        setExpensesError(null);
        if (!snapshot.metadata.fromCache) setExpensesReady(true);
      },
      (error) => {
        console.warn('Firestore expenses listener warning:', error);
        setExpensesError(error.message);
      }
    );

    const unsubCurrentCycleExpenses = onSnapshot(
      query(expensesCol, where('date', '>=', currentCycleStartISO)),
      { includeMetadataChanges: true },
      (snapshot) => {
        const list: Expense[] = [];
        snapshot.forEach(docSnap => list.push({ id: docSnap.id, ...docSnap.data() } as Expense));
        setCurrentCycleExpenses(list);
        setCurrentCycleExpensesError(null);
        if (!snapshot.metadata.fromCache) setCurrentCycleExpensesReady(true);
      },
      (error) => {
        console.warn('Firestore current-cycle expenses listener warning:', error);
        setCurrentCycleExpensesError(error.message);
      }
    );

    return () => {
      unsubFinancial();
      unsubExpenses();
      unsubCurrentCycleExpenses();
    };
  }, [authReady, currentUser?.id, currentUser?.role, currentCycleStartISO]);

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

  // Keep all current-cycle movements available independently of the bounded
  // transaction history used by the rest of the admin dashboard.
  useEffect(() => {
    if (!authReady || currentUser?.role !== 'ADMIN') {
      setCurrentCycleTransactions([]);
      setCurrentCycleTransactionsError(null);
      setCurrentCycleTransactionsReady(false);
      return;
    }
    setCurrentCycleTransactions([]);
    setCurrentCycleTransactionsError(null);
    setCurrentCycleTransactionsReady(false);
    const txCol = collection(db, 'transactions');
    const unsub = onSnapshot(
      query(txCol, where('date', '>=', currentCycleStartISO)),
      { includeMetadataChanges: true },
      (snapshot) => {
        const list: Transaction[] = [];
        snapshot.forEach(docSnap => list.push({ id: docSnap.id, ...docSnap.data() } as Transaction));
        setCurrentCycleTransactions(list);
        setCurrentCycleTransactionsError(null);
        if (!snapshot.metadata.fromCache) setCurrentCycleTransactionsReady(true);
      },
      (error) => {
        console.warn('Firestore current-cycle transactions listener warning:', error);
        setCurrentCycleTransactionsError(error.message);
      }
    );
    return () => unsub();
  }, [authReady, currentUser?.id, currentUser?.role, currentCycleStartISO]);

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
    setCurrentCycleTransactions([]);
    setExpenses([]);
    setCurrentCycleExpenses([]);
    setExpensesReady(false);
    setCurrentCycleExpensesReady(false);
    setFinancialTotals(null);
    setFinancialTotalsReady(false);
    setFinancialTotalsError(null);
    setExpensesError(null);
    setCurrentCycleExpensesError(null);
    setCurrentCycleTransactionsError(null);
    setCurrentCycleTransactionsReady(false);
    setCycles([]);
    cycleCloseAttemptedRef.current = false;
  };

  const addConsumption = async (userId: string, productId: string, quantity: number): Promise<ConsumptionResult> => {
    const productRef = doc(db, 'products', productId);
    const userRef = doc(db, 'users', userId);
    const txRef = doc(collection(db, 'transactions'));

    try {
      await runTransaction(db, async (transaction) => {
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists()) throw new Error('El producto ya no existe.');
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

  const requestConsumption = async (productId: string, quantity: number): Promise<RegisterResult> => {
    if (!currentUser) return { success: false, error: 'Debes iniciar sesión.' };
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { success: false, error: 'La cantidad debe ser un número entero mayor a cero.' };
    }
    const product = products.find(p => p.id === productId);
    if (!product) return { success: false, error: 'Ese producto ya no existe.' };

    try {
      const txRef = doc(collection(db, 'transactions'));
      const newTx: Transaction = {
        id: txRef.id,
        userId: currentUser.id,
        type: 'CONSUMPTION',
        amountUSD: Math.round(product.priceUSD * quantity * 100) / 100,
        date: new Date().toISOString(),
        status: 'PENDING',
        productId,
        quantity
      };
      await setDoc(txRef, newTx);
      return { success: true };
    } catch {
      return { success: false, error: 'No se pudo reportar el consumo. Intenta de nuevo.' };
    }
  };

  const approveConsumption = async (transactionId: string): Promise<RegisterResult> => {
    const txRef = doc(db, 'transactions', transactionId);
    try {
      await runTransaction(db, async (transaction) => {
        const txSnap = await transaction.get(txRef);
        if (!txSnap.exists()) throw new Error('La solicitud ya no existe.');
        const tx = txSnap.data() as Transaction;
        if (tx.type !== 'CONSUMPTION' || tx.status !== 'PENDING') {
          throw new Error('Esa solicitud ya no está pendiente.');
        }
        const qty = Number(tx.quantity);
        if (!tx.productId || !Number.isInteger(qty) || qty < 1) {
          throw new Error('Datos de la solicitud inválidos.');
        }
        const productRef = doc(db, 'products', tx.productId);
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists()) throw new Error('El producto ya no existe.');
        const product = productSnap.data() as Product;
        if (product.stock < qty) {
          throw new Error(`Stock insuficiente de "${product.name}" (disponible: ${product.stock}).`);
        }
        const amountUSD = Math.round(product.priceUSD * qty * 100) / 100;
        transaction.update(txRef, { status: 'COMPLETED', amountUSD });
        transaction.update(doc(db, 'users', tx.userId), { balanceUSD: increment(amountUSD) });
        transaction.update(productRef, { stock: increment(-qty) });
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'No se pudo confirmar el consumo.' };
    }
  };

  const rejectConsumption = async (transactionId: string): Promise<RegisterResult> => {
    const txRef = doc(db, 'transactions', transactionId);
    try {
      await runTransaction(db, async (transaction) => {
        const txSnap = await transaction.get(txRef);
        if (!txSnap.exists()) throw new Error('La solicitud ya no existe.');
        const tx = txSnap.data() as Transaction;
        if (tx.type !== 'CONSUMPTION' || tx.status !== 'PENDING') {
          throw new Error('Esa solicitud ya no está pendiente.');
        }
        transaction.update(txRef, { status: 'REJECTED' });
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'No se pudo rechazar la solicitud.' };
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
    } catch {
      return { success: false, error: 'No se pudo reportar el pago. Intenta de nuevo.' };
    }
  };

  const approvePayment = async (transactionId: string): Promise<RegisterResult> => {
    const txRef = doc(db, 'transactions', transactionId);
    const financialRef = doc(db, 'financials', 'global');
    try {
      await runTransaction(db, async (transaction) => {
        const txSnap = await transaction.get(txRef);
        if (!txSnap.exists()) throw new Error('La transacción ya no existe.');
        const tx = txSnap.data() as Transaction;
        if (tx.type !== 'PAYMENT' || tx.status !== 'PENDING') {
          throw new Error('Ese pago ya fue procesado.');
        }
        const financialSnap = await transaction.get(financialRef);
        if (!financialSnap.exists() || financialSnap.get('initialized') !== true) {
          throw new Error('La cuenta global aún no está inicializada. Ejecuta el script de inicialización financiera antes de aprobar pagos.');
        }
        transaction.update(txRef, { status: 'COMPLETED' });
        transaction.update(doc(db, 'users', tx.userId), { balanceUSD: increment(-tx.amountUSD) });
        transaction.update(financialRef, {
          totalCollectedUSD: increment(tx.amountUSD),
          updatedAt: new Date().toISOString(),
        });
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'No se pudo aprobar el pago. Intenta de nuevo.' };
    }
  };

  const rejectPayment = async (transactionId: string): Promise<RegisterResult> => {
    const txRef = doc(db, 'transactions', transactionId);
    try {
      await runTransaction(db, async (transaction) => {
        const txSnap = await transaction.get(txRef);
        if (!txSnap.exists()) throw new Error('La transacción ya no existe.');
        const tx = txSnap.data() as Transaction;
        if (tx.type !== 'PAYMENT' || tx.status !== 'PENDING') {
          throw new Error('Ese pago ya fue procesado.');
        }
        transaction.update(txRef, { status: 'REJECTED' });
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'No se pudo rechazar el pago. Intenta de nuevo.' };
    }
  };

  const addExpense = async (description: string, amountUSD: number): Promise<RegisterResult> => {
    if (currentUser?.role !== 'ADMIN') {
      return { success: false, error: 'Se requieren permisos de administrador.' };
    }
    const cleanDescription = description.trim();
    const roundedAmount = Math.round(amountUSD * 100) / 100;
    if (!cleanDescription || cleanDescription.length > 160) {
      return { success: false, error: 'La descripción debe tener entre 1 y 160 caracteres.' };
    }
    if (!Number.isFinite(roundedAmount) || roundedAmount <= 0) {
      return { success: false, error: 'El monto debe ser mayor a cero.' };
    }

    const expenseRef = doc(collection(db, 'expenses'));
    const financialRef = doc(db, 'financials', 'global');
    const expense: Expense = {
      id: expenseRef.id,
      description: cleanDescription,
      amountUSD: roundedAmount,
      date: new Date().toISOString(),
      createdBy: currentUser.id,
    };

    try {
      await runTransaction(db, async (transaction) => {
        const financialSnap = await transaction.get(financialRef);
        if (!financialSnap.exists() || financialSnap.get('initialized') !== true) {
          throw new Error('La cuenta global aún no está inicializada. Ejecuta el script de inicialización financiera antes de registrar egresos.');
        }
        transaction.set(expenseRef, expense);
        transaction.update(financialRef, {
          totalExpensesUSD: increment(roundedAmount),
          updatedAt: expense.date,
        });
      });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo registrar el egreso.';
      return { success: false, error: message };
    }
  };

  const updateExchangeRate = async (rate: number): Promise<RegisterResult> => {
    if (!Number.isFinite(rate) || rate <= 0) {
      return { success: false, error: 'Ingresa una tasa válida.' };
    }
    try {
      await setDoc(doc(db, 'config', 'global'), {
        exchangeRate: rate,
        exchangeRateSource: 'Manual',
        exchangeRateUpdatedAt: new Date().toISOString(),
        exchangeRateAutoUpdateDate: getVenezuelaDateKey(),
      }, { merge: true });
      return { success: true };
    } catch {
      return { success: false, error: 'No se pudo actualizar la tasa de cambio.' };
    }
  };

  const refreshExchangeRateFromSources = useCallback(async (): Promise<ExchangeRateRefreshResult> => {
    if (currentUser?.role !== 'ADMIN') {
      return { success: false, updated: false, error: 'Se requieren permisos de administrador.' };
    }

    const dateKey = getVenezuelaDateKey();
    const configRef = doc(db, 'config', 'global');

    try {
      const configSnapshot = await getDocFromServer(configRef);
      if (configSnapshot.exists() && configSnapshot.get('exchangeRateAutoUpdateDate') === dateKey) {
        return { success: true, updated: false };
      }

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 10000);
      let response: Response;
      try {
        response = await fetch('https://ve.dolarapi.com/v1/dolares', { signal: controller.signal });
      } finally {
        window.clearTimeout(timeoutId);
      }

      if (!response.ok) {
        throw new Error(`DolarApi respondió con HTTP ${response.status}.`);
      }
      const quotes: unknown = await response.json();
      if (!Array.isArray(quotes)) {
        throw new Error('La respuesta de DolarApi no tiene el formato esperado.');
      }

      const findRate = (source: 'oficial' | 'paralelo'): number | null => {
        const quote = quotes.find((item): item is DollarApiQuote =>
          !!item && typeof item === 'object' && (item as DollarApiQuote).fuente === source
        );
        const value = quote?.promedio;
        return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
      };

      const officialRate = findRate('oficial');
      const parallelRate = findRate('paralelo');
      if (officialRate === null && parallelRate === null) {
        throw new Error('DolarApi no devolvió tasas oficiales o paralelas válidas.');
      }

      const rate = officialRate !== null && parallelRate !== null
        ? (officialRate + parallelRate) / 2
        : officialRate ?? parallelRate!;
      const source = officialRate !== null && parallelRate !== null
        ? 'Promedio DolarApi (oficial + paralelo)'
        : officialRate !== null
          ? 'DolarApi oficial (paralelo no disponible)'
          : 'DolarApi paralelo (oficial no disponible)';

      return await runTransaction(db, async (transaction) => {
        const latestConfig = await transaction.get(configRef);
        if (latestConfig.exists() && latestConfig.get('exchangeRateAutoUpdateDate') === dateKey) {
          return { success: true, updated: false };
        }
        transaction.set(configRef, {
          exchangeRate: rate,
          exchangeRateSource: source,
          exchangeRateUpdatedAt: new Date().toISOString(),
          exchangeRateAutoUpdateDate: dateKey,
          exchangeRateOfficial: officialRate,
          exchangeRateParallel: parallelRate,
        }, { merge: true });
        return { success: true, updated: true, rate };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido al consultar DolarApi.';
      console.error('No se pudo actualizar la tasa desde DolarApi:', error);
      return {
        success: false,
        updated: false,
        error: `No se actualizó la tasa automática (${message}). Se conserva la tasa guardada.`,
      };
    }
  }, [currentUser?.role]);

  const updateProductStocks = async (stocks: Array<{ productId: string; stock: number }>): Promise<RegisterResult> => {
    if (stocks.length === 0) {
      return { success: false, error: 'No hay cambios de stock para guardar.' };
    }
    if (stocks.length > 500) {
      return { success: false, error: 'No se pueden guardar más de 500 cambios de stock a la vez.' };
    }
    if (stocks.some(({ productId, stock }) =>
      !productId || !Number.isSafeInteger(stock) || stock < 0
    )) {
      return { success: false, error: 'Cada stock debe ser un número entero no negativo.' };
    }

    try {
      const batch = writeBatch(db);
      stocks.forEach(({ productId, stock }) => {
        batch.update(doc(db, 'products', productId), { stock });
      });
      await batch.commit();
      return { success: true };
    } catch (error) {
      console.error('Error saving product stock batch:', error);
      return { success: false, error: 'No se pudieron guardar los cambios de stock. Verifica la conexión, los permisos y que los productos existan.' };
    }
  };

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
          const newId = row.name.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `prod-${Date.now()}-${created}`;
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
    } catch {
      return { updated: 0, created: 0, error: 'No se pudo importar el archivo. Verifica el formato.' };
    }
  };

  const value: AppContextType = {
    currentUser,
    authLoading,
    users,
    products,
    transactions,
    currentCycleTransactions,
    expenses,
    currentCycleExpenses,
    expensesReady,
    currentCycleExpensesReady,
    financialTotals,
    financialTotalsReady,
    financialTotalsError,
    expensesError,
    currentCycleExpensesError,
    currentCycleTransactionsError,
    currentCycleTransactionsReady,
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
    addExpense,
    updateExchangeRate,
    refreshExchangeRateFromSources,
    updateProductStocks,
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