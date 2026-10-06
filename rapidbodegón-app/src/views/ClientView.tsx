import React, { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { formatCurrency, formatBs } from '../utils/format';
import { CUTOFF_DAYS, getNextCutoff, daysUntilNextCutoff, formatCutoffDate } from '../utils/cycle';
import {
  Copy, Check, LogOut, Wallet, Info, Receipt, CheckCircle2, Clock, AlertCircle, ShoppingBag, CalendarClock
} from 'lucide-react';
import { Card, CardHeader, CardContent, Button, Input, Label } from '../components';
import { Onboarding } from '../components/ui/Onboarding';
import { PrivacyNoticeLink } from '../components/ui/PrivacyNotice';
import { ThemeToggle } from '../components/ThemeToggle';

// Cámbialo a true solo cuando quieras que los clientes puedan reportar su
// propio consumo (requiere también reactivar la regla en firestore.rules).
const ENABLE_CONSUMPTION_REPORT = false;

const STATUS_UI: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'En validación', className: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  COMPLETED: { label: 'Aprobado', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  REJECTED: { label: 'Rechazado', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

const StatusBadge = ({ status }: { status: string }) => {
  const ui = STATUS_UI[status] || STATUS_UI.PENDING;
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${ui.className}`}>
      {ui.label}
    </span>
  );
};

const selectClass =
  'w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500';

export const ClientView = () => {
  const {
    currentUser, transactions, config, products,
    logout, reportPayment, requestConsumption
  } = useApp();

  const [currency, setCurrency] = useState<'USD' | 'BS'>('USD');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copyError, setCopyError] = useState('');

  const [consProductId, setConsProductId] = useState('');
  const [consQty, setConsQty] = useState('1');
  const [consMessage, setConsMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [submittingCons, setSubmittingCons] = useState(false);

  const currentUserId = currentUser?.id;
  const userTransactions = useMemo(
    () => transactions.filter(t => t.userId === currentUserId),
    [transactions, currentUserId]
  );
  const myConsumptions = useMemo(
    () => userTransactions.filter(t => t.type === 'CONSUMPTION'),
    [userTransactions]
  );
  const myPayments = useMemo(
    () => userTransactions.filter(t => t.type === 'PAYMENT'),
    [userTransactions]
  );
  const pendingPaymentsAmount = useMemo(
    () => myPayments
      .filter(t => t.status === 'PENDING')
      .reduce((acc, t) => acc + t.amountUSD, 0),
    [myPayments]
  );

  if (!currentUser) return null;

  const rate = config.exchangeRate;
  const canUseBs = !!rate && rate > 0;

  const parsedAmount = parseFloat(paymentAmount.replace(',', '.'));
  const amountUSD =
    !isNaN(parsedAmount) && parsedAmount > 0
      ? Math.round((currency === 'BS' && canUseBs ? parsedAmount / rate : parsedAmount) * 100) / 100
      : 0;

  const nextCutoff = getNextCutoff();
  const daysLeft = daysUntilNextCutoff();
  const isCutoffDay = CUTOFF_DAYS.includes(new Date().getDate());
  const bankDetails = [
    { key: 'bank', label: 'Banco', value: config.bankDetails.bank },
    { key: 'owner', label: 'Titular', value: config.bankDetails.owner },
    { key: 'idCard', label: 'Cédula / RIF', value: config.bankDetails.idCard },
    { key: 'phone', label: 'Teléfono', value: config.bankDetails.phone },
  ];

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setCopyError('');
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      setCopyError('No se pudo copiar. Cópialo manualmente.');
    }
  };

  const handleCopyAllBankDetails = () => {
    const text = bankDetails.map(({ label, value }) => `${label}: ${value}`).join('\n');
    void handleCopy('all', text);
  };

  const handleReportPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingPayment) return;
    setPaymentError('');

    if (amountUSD < 0.1) {
      setPaymentError('Ingresa un monto válido.');
      return;
    }
    const ref = paymentRef.trim();
    if (!/^\d{4,6}$/.test(ref)) {
      setPaymentError('La referencia debe tener entre 4 y 6 dígitos, solo números.');
      return;
    }
    if (myPayments.some(t => t.reference === ref && t.status !== 'REJECTED')) {
      setPaymentError('Ya reportaste un pago con esa referencia.');
      return;
    }

    setSubmittingPayment(true);
    const result = await reportPayment(currentUser.id, amountUSD, ref);
    setSubmittingPayment(false);

    if (!result.success) {
      setPaymentError(result.error || 'No se pudo reportar el pago. Intenta de nuevo.');
      return;
    }

    setPaymentAmount('');
    setPaymentRef('');
    setPaymentSuccess(true);
    setTimeout(() => setPaymentSuccess(false), 3000);
  };

  const availableProducts = useMemo(() => products.filter(p => p.stock > 0), [products]);

  const handleRequestConsumption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingCons) return;
    setConsMessage(null);

    const qty = parseInt(consQty, 10);
    const product = products.find(p => p.id === consProductId);
    if (!product || isNaN(qty) || qty < 1) {
      setConsMessage({ type: 'error', text: 'Elige un producto y una cantidad válida.' });
      return;
    }
    if (qty > product.stock) {
      setConsMessage({ type: 'error', text: `Solo hay ${product.stock} disponibles de ${product.name}.` });
      return;
    }

    setSubmittingCons(true);
    const result = await requestConsumption(consProductId, qty);
    setSubmittingCons(false);

    if (!result.success) {
      setConsMessage({ type: 'error', text: result.error || 'No se pudo enviar el reporte.' });
      return;
    }
    setConsProductId('');
    setConsQty('1');
    setConsMessage({ type: 'ok', text: 'Listo. El administrador confirmará lo que tomaste.' });
    setTimeout(() => setConsMessage(null), 4000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8">
      <Onboarding userId={currentUser.id} />

      {/* Header */}
      <div className="max-w-4xl mx-auto flex justify-between items-center mb-8">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Hola, {currentUser.name}</h1>
          <p className="text-slate-400 text-sm">Resumen de tu cuenta</p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="secondary" className="text-xs py-1.5 px-3" onClick={logout}>
            <LogOut size={14} className="mr-2" /> Salir
          </Button>
        </div>
      </div>

      {isCutoffDay && currentUser.balanceUSD > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="max-w-4xl mx-auto mb-6 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <CalendarClock size={20} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-400">📅😁 Hoy es día de corte</p>
              <p className="text-sm text-slate-200 mt-1">
                ⚠️ Tienes un saldo pendiente de {formatCurrency(currentUser.balanceUSD)}. 😎 Puedes cancelar o abonar desde “Reportar Pago”.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                ⏳ Los pagos reportados se reflejan en tu saldo cuando sean validados.
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            className="shrink-0"
            onClick={() => document.getElementById('report-payment')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            💳 Ir a reportar pago
          </Button>
        </div>
      )}

      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Columna izquierda */}
        <div className="space-y-6">
          <Card className={`border ${currentUser.balanceUSD > 0 ? 'border-red-500/30' : 'border-emerald-500/30'}`}>
            <CardContent className="p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-900 mb-4">
                <Wallet size={32} className={currentUser.balanceUSD > 0 ? 'text-red-400' : 'text-emerald-400'} />
              </div>
              <p className="text-slate-400 font-medium mb-2">Saldo Total Pendiente</p>

              <h2 className="text-5xl font-bold text-white mb-2">
                {formatCurrency(currentUser.balanceUSD)}
              </h2>
              <p className="text-lg text-slate-400 font-mono">
                {formatBs(currentUser.balanceUSD, config.exchangeRate)}
              </p>

              <div className="mt-6 flex justify-center">
                {currentUser.balanceUSD > 0 ? (
                  <span className="inline-flex px-4 py-2 rounded-full text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                    ⚠️ PAGO PENDIENTE
                  </span>
                ) : (
                  <span className="inline-flex px-4 py-2 rounded-full text-sm font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    ✅ AL DÍA
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
                <CalendarClock size={14} />
                Próximo corte: {formatCutoffDate(nextCutoff)} (en {daysLeft} día{daysLeft === 1 ? '' : 's'})
              </div>

              {pendingPaymentsAmount > 0 && (
                <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-400 text-sm">
                  <Clock size={16} className="inline mr-2 -mt-0.5" />
                  Tienes un reporte de pago por {formatCurrency(pendingPaymentsAmount)} en proceso de validación.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title="Datos para Pago Móvil / Transferencia"
              action={
                <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={handleCopyAllBankDetails}>
                  {copiedKey === 'all' ? <Check size={14} className="mr-1 text-emerald-400" /> : <Copy size={14} className="mr-1" />}
                  {copiedKey === 'all' ? 'Copiado' : 'Copiar todo'}
                </Button>
              }
            />
            <CardContent>
              <div className="space-y-3">
                {bankDetails.map(item => (
                  <div key={item.key} className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div>
                      <p className="text-xs text-slate-500">{item.label}</p>
                      <p className="font-medium text-slate-200">{item.value}</p>
                    </div>
                    <Button
                      variant="secondary"
                      className="p-2 h-auto"
                      onClick={() => handleCopy(item.key, item.value)}
                      aria-label={`Copiar ${item.label}`}
                    >
                      {copiedKey === item.key
                        ? <Check size={16} className="text-emerald-400" />
                        : <Copy size={16} />}
                    </Button>
                  </div>
                ))}
              </div>
              {copyError && (
                <p role="alert" className="mt-3 text-sm text-red-400">{copyError}</p>
              )}
              <div className="mt-4 flex items-start gap-2 p-3 bg-blue-500/10 rounded-lg text-blue-400 text-sm">
                <Info size={16} className="shrink-0 mt-0.5" />
                <p>
                  Tasa de cobro: <strong>{formatBs(1, config.exchangeRate)}</strong>.
                  Puede realizar el pago en Bs o $. Una vez realizado, repórtelo en el formulario.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Catálogo y precios */}
          <Card>
            <CardHeader title="Catálogo y Precios" subtitle="Lo que hay disponible en el bodegón" />
            <CardContent className="p-0">
              <div className="divide-y divide-slate-800 max-h-[280px] overflow-y-auto">
                {availableProducts.length === 0 ? (
                  <div className="p-6 text-center text-slate-500">
                    {products.length === 0 ? 'Aún no hay productos cargados.' : 'No hay productos disponibles en este momento.'}
                  </div>
                ) : (
                  availableProducts.map(product => (
                    <div key={product.id} className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-800 rounded text-slate-400">
                          <ShoppingBag size={16} />
                        </div>
                        <div>
                          <p className="font-medium text-slate-200">{product.name}</p>
                        </div>
                      </div>
                      <p className="font-mono text-slate-300">{formatCurrency(product.priceUSD)}</p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Columna derecha */}
        <div className="space-y-6">
          {/* Reportar pago */}
          <Card id="report-payment">
            <CardHeader title="💳 Reportar Pago" />
            <CardContent>
              {paymentSuccess ? (
                <div className="text-center py-8">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mb-4">
                    <CheckCircle2 size={24} />
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">✅ Pago reportado</h3>
                  <p className="text-slate-400 text-sm">⏳ El administrador validará su pago en breve.</p>
                </div>
              ) : (
                <form onSubmit={handleReportPayment} className="space-y-4">
                  {paymentError && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                      <AlertCircle size={16} className="shrink-0 mt-0.5" />
                      <span>⚠️ {paymentError}</span>
                    </div>
                  )}

                  <div>
                    <Label>💵 Monto pagado</Label>
                    <div className="flex gap-2 mb-2">
                      <Button
                        type="button"
                        variant={currency === 'USD' ? undefined : 'secondary'}
                        className="flex-1 py-1.5 text-sm"
                        onClick={() => setCurrency('USD')}
                      >
                        Dólares ($)
                      </Button>
                      <Button
                        type="button"
                        variant={currency === 'BS' ? undefined : 'secondary'}
                        className="flex-1 py-1.5 text-sm"
                        disabled={!canUseBs}
                        onClick={() => setCurrency('BS')}
                      >
                        Bolívares (Bs)
                      </Button>
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      inputMode="decimal"
                      placeholder={currency === 'USD' ? 'Ej. 5.50' : 'Ej. 250,00'}
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      required
                    />
                    {currency === 'BS' && amountUSD > 0 && (
                      <p className="text-xs text-slate-400 mt-1">
                        Equivale a <strong>{formatCurrency(amountUSD)}</strong> a la tasa del día.
                      </p>
                    )}
                  </div>

                  <div>
                    <Label>🧾 Referencia bancaria</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="Últimos 4-6 dígitos"
                      value={paymentRef}
                      onChange={(e) => setPaymentRef(e.target.value.replace(/\D/g, ''))}
                      maxLength={12}
                      required
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={submittingPayment}>
                    {submittingPayment ? '⏳ Enviando...' : '📤 Enviar reporte'}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          {ENABLE_CONSUMPTION_REPORT && (
            <Card>
              <CardHeader title="Reportar lo que tomé" />
              <CardContent>
                <form onSubmit={handleRequestConsumption} className="space-y-4">
                  {consMessage && (
                    <div
                      className={`p-3 rounded-lg text-sm border ${
                        consMessage.type === 'ok'
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          : 'bg-red-500/10 border-red-500/20 text-red-400'
                      }`}
                    >
                      {consMessage.text}
                    </div>
                  )}
                  <div>
                    <Label>Producto</Label>
                    <select
                      className={selectClass}
                      value={consProductId}
                      onChange={(e) => setConsProductId(e.target.value)}
                      required
                    >
                      <option value="">Seleccione producto…</option>
                      {availableProducts.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {formatCurrency(p.priceUSD)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Cantidad</Label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={consQty}
                      onChange={(e) => setConsQty(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={submittingCons}>
                    {submittingCons ? 'Enviando...' : 'Enviar reporte'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader title="Mis Pagos Reportados" />
            <CardContent className="p-0">
              <div className="divide-y divide-slate-800 max-h-[240px] overflow-y-auto">
                {myPayments.length === 0 ? (
                  <div className="p-6 text-center text-slate-500">Aún no has reportado pagos.</div>
                ) : (
                  myPayments.slice(0, 15).map(tx => (
                    <div key={tx.id} className="p-4 flex justify-between items-center">
                      <div>
                        <p className="font-medium text-white">{formatCurrency(tx.amountUSD)}</p>
                        <p className="text-xs text-slate-500">
                          {new Date(tx.date).toLocaleDateString()} • Ref:{' '}
                          <span className="font-semibold text-slate-300">{tx.reference}</span>
                        </p>
                      </div>
                      <StatusBadge status={tx.status} />
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Historial de Consumo" />
            <CardContent className="p-0">
              <div className="divide-y divide-slate-800 max-h-[300px] overflow-y-auto">
                {myConsumptions.length === 0 ? (
                  <div className="p-6 text-center text-slate-500">No hay consumos registrados.</div>
                ) : (
                  myConsumptions.map(tx => {
                    const product = products.find(p => p.id === tx.productId);
                    return (
                      <div
                        key={tx.id}
                        className={`p-4 flex justify-between items-center hover:bg-slate-800/30 ${
                          tx.status === 'REJECTED' ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-slate-800 rounded text-slate-400">
                            <Receipt size={16} />
                          </div>
                          <div>
                            <p className="font-medium text-slate-200">{product?.name || 'Producto'}</p>
                            <p className="text-xs text-slate-500">
                              {new Date(tx.date).toLocaleDateString()} • Cant: {tx.quantity}
                            </p>
                          </div>
                        </div>
                        <div className="text-right space-y-1">
                          <p className="font-medium text-white">{formatCurrency(tx.amountUSD)}</p>
                          {tx.status !== 'COMPLETED' && <StatusBadge status={tx.status} />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="max-w-4xl mx-auto mt-8 text-center">
        <PrivacyNoticeLink />
      </div>
    </div>
  );
}