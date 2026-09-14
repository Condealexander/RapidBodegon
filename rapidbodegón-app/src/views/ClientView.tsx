import React, { useState } from 'react';
import { useApp } from '../store/AppContext';
import { formatCurrency, formatBs } from '../utils/format';
import { 
  Copy, LogOut, Wallet, Info, Receipt, CheckCircle2, Clock 
} from 'lucide-react';
import { Card, CardHeader, CardContent, Button, Input, Label } from '../components/ui';

export const ClientView = () => {
  const { 
    currentUser, transactions, config, products, 
    logout, reportPayment 
  } = useApp();
  
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  if (!currentUser) return null;

  const userTransactions = transactions.filter(t => t.userId === currentUser.id);
  const myConsumptions = userTransactions.filter(t => t.type === 'CONSUMPTION');
  
  // Calculate if there are pending payments that haven't been approved yet
  const pendingPaymentsAmount = userTransactions
    .filter(t => t.type === 'PAYMENT' && t.status === 'PENDING')
    .reduce((acc, t) => acc + t.amountUSD, 0);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    // In a real app we'd show a toast here
  };

  const handleReportPayment = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(paymentAmount);
    if (!isNaN(amount) && amount > 0 && paymentRef) {
      reportPayment(currentUser.id, amount, paymentRef);
      setPaymentAmount('');
      setPaymentRef('');
      setPaymentSuccess(true);
      setTimeout(() => setPaymentSuccess(false), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8">
      {/* Header */}
      <div className="max-w-4xl mx-auto flex justify-between items-center mb-8">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">Hola, {currentUser.name}</h1>
          <p className="text-slate-400 text-sm">Resumen de tu cuenta</p>
        </div>
        <Button variant="secondary" className="text-xs py-1.5 px-3" onClick={logout}>
          <LogOut size={14} className="mr-2" /> Salir
        </Button>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Balance Card */}
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

              {pendingPaymentsAmount > 0 && (
                <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-400 text-sm">
                  <Clock size={16} className="inline mr-2 -mt-0.5" />
                  Tienes un reporte de pago por {formatCurrency(pendingPaymentsAmount)} en proceso de validación.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment Info */}
          <Card>
            <CardHeader title="Datos para Pago Móvil / Transferencia" />
            <CardContent>
              <div className="space-y-3">
                {[
                  { label: 'Banco', value: config.bankDetails.bank },
                  { label: 'Titular', value: config.bankDetails.owner },
                  { label: 'Cédula / RIF', value: config.bankDetails.idCard },
                  { label: 'Teléfono', value: config.bankDetails.phone },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div>
                      <p className="text-xs text-slate-500">{item.label}</p>
                      <p className="font-medium text-slate-200">{item.value}</p>
                    </div>
                    <Button variant="secondary" className="p-2 h-auto" onClick={() => handleCopy(item.value)}>
                      <Copy size={16} />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-start gap-2 p-3 bg-blue-500/10 rounded-lg text-blue-400 text-sm">
                <Info size={16} className="shrink-0 mt-0.5" />
                <p>Tasa del día: <strong>{formatBs(1, config.exchangeRate)}</strong>. Puede realizar el pago en Bs o $. Una vez realizado, repórtelo en el formulario.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Report Payment Form */}
          <Card>
            <CardHeader title="Reportar Pago" />
            <CardContent>
              {paymentSuccess ? (
                <div className="text-center py-8">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mb-4">
                    <CheckCircle2 size={24} />
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">Pago Reportado</h3>
                  <p className="text-slate-400 text-sm">El administrador validará su pago en breve.</p>
                </div>
              ) : (
                <form onSubmit={handleReportPayment} className="space-y-4">
                  <div>
                    <Label>Monto Pagado (Expresado en USD)</Label>
                    <Input 
                      type="number" 
                      step="0.01" 
                      min="0.1"
                      placeholder="Ej. 5.50"
                      value={paymentAmount} 
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      required
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Si pagó en Bs, divida el monto entre {formatBs(1, config.exchangeRate)}
                    </p>
                  </div>
                  
                  <div>
                    <Label>Referencia Bancaria</Label>
                    <Input 
                      type="text" 
                      placeholder="Últimos 4-6 dígitos"
                      value={paymentRef} 
                      onChange={(e) => setPaymentRef(e.target.value)}
                      required
                    />
                  </div>

                  <Button type="submit" className="w-full">
                    Enviar Reporte
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          {/* History */}
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
                      <div key={tx.id} className="p-4 flex justify-between items-center hover:bg-slate-800/30">
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
                        <div className="text-right">
                          <p className="font-medium text-white">{formatCurrency(tx.amountUSD)}</p>
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
    </div>
  );
};
