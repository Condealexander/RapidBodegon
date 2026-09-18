import React, { useState } from 'react';
import { useApp } from '../store/AppContext';
import { formatCurrency, formatBs } from '../utils/format';
import {
  Users, DollarSign, Wallet, Calendar, Plus,
  CheckCircle2, XCircle, Search, Clock, LogOut, BarChart3,
  Package, Upload, Save
} from 'lucide-react';
import { Card, CardHeader, CardContent, Button, Input, Label } from '../components/ui';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import * as XLSX from 'xlsx';
import type { ProductImportRow } from '../store/AppContext';

export const AdminView = () => {
  const {
    users, products, transactions, config, logout,
    addConsumption, updateExchangeRate, approvePayment, rejectPayment,
    updateProductStock, importProducts
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [newRate, setNewRate] = useState<string>(config.exchangeRate.toString());
  const [consumptionError, setConsumptionError] = useState<string>('');

  // Inventory management state
  const [stockEdits, setStockEdits] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string>('');

  const clients = users.filter(u => u.role === 'CLIENT');
  const filteredClients = clients.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const totalCredit = clients.reduce((acc, client) => acc + client.balanceUSD, 0);
  const clientsWithDebt = clients.filter(c => c.balanceUSD > 0).length;

  const currentCyclePayments = transactions
    .filter(t => t.type === 'PAYMENT' && t.status === 'COMPLETED')
    .reduce((acc, t) => acc + t.amountUSD, 0);

  const pendingPayments = transactions.filter(t => t.type === 'PAYMENT' && t.status === 'PENDING');

  const consumptions = transactions.filter(t => t.type === 'CONSUMPTION' && t.status === 'COMPLETED');

  // Daily sales data
  const dailySalesMap = consumptions.reduce((acc, curr) => {
    const date = new Date(curr.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    acc[date] = (acc[date] || 0) + curr.amountUSD;
    return acc;
  }, {} as Record<string, number>);

  const dailySalesData = Object.keys(dailySalesMap).map(date => ({
    date,
    total: dailySalesMap[date]
  })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // sort chronologically

  // Client sales data
  const clientSalesMap = consumptions.reduce((acc, curr) => {
    acc[curr.userId] = (acc[curr.userId] || 0) + curr.amountUSD;
    return acc;
  }, {} as Record<string, number>);

  const clientSalesData = Object.keys(clientSalesMap).map(userId => {
    const client = users.find(u => u.id === userId);
    return {
      name: client ? client.name.split(' ')[0] : 'Desconocido',
      total: clientSalesMap[userId]
    };
  }).sort((a, b) => b.total - a.total).slice(0, 5); // top 5 clients

  const handleAddConsumption = async (e: React.FormEvent) => {
    e.preventDefault();
    setConsumptionError('');
    if (selectedUserId && selectedProductId && quantity > 0) {
      const result = await addConsumption(selectedUserId, selectedProductId, quantity);
      if (!result.success) {
        setConsumptionError(result.error || 'No se pudo registrar el consumo.');
        return;
      }
      setSelectedUserId('');
      setSelectedProductId('');
      setQuantity(1);
    }
  };

  const handleUpdateRate = (e: React.FormEvent) => {
    e.preventDefault();
    const rate = parseFloat(newRate);
    if (!isNaN(rate) && rate > 0) {
      updateExchangeRate(rate);
    }
  };

  const handleStockInputChange = (productId: string, value: string) => {
    setStockEdits(prev => ({ ...prev, [productId]: value }));
  };

  const handleSaveStock = async (productId: string) => {
    const raw = stockEdits[productId];
    const newStock = parseInt(raw, 10);
    if (isNaN(newStock) || newStock < 0) return;
    await updateProductStock(productId, newStock);
    setStockEdits(prev => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const findColumnKey = (row: Record<string, any>, candidates: string[]) =>
    Object.keys(row).find(k => candidates.includes(k.trim().toUpperCase()));

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportMsg('');

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      const parsed: ProductImportRow[] = rawRows
        .map(row => {
          const nameKey = findColumnKey(row, ['PRODUCTO', 'NOMBRE', 'NAME']);
          const stockKey = findColumnKey(row, ['STOCK', 'EXISTENCIA', 'EXISTENCIAS', 'CANTIDAD']);
          const priceKey = findColumnKey(row, ['PRECIO', 'PRICE', 'PRECIO USD', 'PRECIO ($)', 'PRECIO$']);

          const name = nameKey ? String(row[nameKey]).trim() : '';
          const stock = stockKey ? Number(row[stockKey]) : NaN;
          const priceRaw = priceKey ? row[priceKey] : undefined;
          const priceUSD = priceRaw !== undefined && priceRaw !== ''
            ? Number(String(priceRaw).replace(',', '.'))
            : undefined;

          return { name, stock, priceUSD };
        })
        .filter(r => r.name && !isNaN(r.stock));

      if (parsed.length === 0) {
        setImportMsg('No se encontraron filas válidas. Se esperan columnas "PRODUCTO" y "STOCK" (y opcionalmente "PRECIO").');
        return;
      }

      const result = await importProducts(parsed);
      setImportMsg(`Importación completa: ${result.updated} producto(s) actualizado(s), ${result.created} creado(s).`);
    } catch (err) {
      console.error(err);
      setImportMsg('Error al leer el archivo. Verifique que sea un .xlsx, .xls o .csv válido.');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Panel Maestro</h1>
          <p className="text-slate-400 text-sm">Visión general del negocio y cobranza</p>
        </div>
        <div className="flex items-center gap-4 bg-slate-900 p-2 rounded-lg border border-slate-800">
          <div className="flex items-center gap-2 px-3 border-r border-slate-700">
            <span className="text-xs text-slate-400">Tasa (BCV):</span>
            <span className="font-mono text-emerald-400">{formatBs(1, config.exchangeRate)}</span>
          </div>
          <Button variant="secondary" className="text-xs py-1.5 px-3" onClick={logout}>
            <LogOut size={14} className="mr-2" /> Salir
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* KPI Cards */}
        <Card className="bg-gradient-to-br from-blue-900/50 to-slate-800 border-blue-500/20">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-blue-500/20 text-blue-400 rounded-lg">
              <Wallet size={24} />
            </div>
            <div>
              <p className="text-sm text-blue-200/70 font-medium">Crédito Global (Por cobrar)</p>
              <div className="flex items-baseline gap-2">
                <h2 className="text-2xl font-bold text-white">{formatCurrency(totalCredit)}</h2>
                <span className="text-xs text-slate-400 font-mono">{formatBs(totalCredit, config.exchangeRate)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-900/50 to-slate-800 border-emerald-500/20">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <DollarSign size={24} />
            </div>
            <div>
              <p className="text-sm text-emerald-200/70 font-medium">Recaudado (Ciclo Actual)</p>
              <h2 className="text-2xl font-bold text-white">{formatCurrency(currentCyclePayments)}</h2>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-900/50 to-slate-800 border-purple-500/20">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 bg-purple-500/20 text-purple-400 rounded-lg">
              <Users size={24} />
            </div>
            <div>
              <p className="text-sm text-purple-200/70 font-medium">Estado de Clientes</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                  {clients.length - clientsWithDebt} Al día
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                  {clientsWithDebt} Pendientes
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Dashboard */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader title="Ventas Diarias" subtitle="Consumo histórico" />
          <CardContent className="h-72 pt-4">
            {dailySalesData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailySalesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                  <Tooltip
                    cursor={{ fill: '#1e293b' }}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }}
                    formatter={(value: number) => [formatCurrency(value), 'Total']}
                  />
                  <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
                <BarChart3 size={32} className="mb-2 opacity-20" />
                <p>No hay datos de ventas</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Top 5 Clientes" subtitle="Mayor consumo acumulado" />
          <CardContent className="h-72 pt-4">
            {clientSalesData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={clientSalesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                  <Tooltip
                    cursor={{ fill: '#1e293b' }}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9' }}
                    formatter={(value: number) => [formatCurrency(value), 'Consumo']}
                  />
                  <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
                <BarChart3 size={32} className="mb-2 opacity-20" />
                <p>No hay datos de clientes</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Client List & Conciliation */}
        <div className="lg:col-span-2 space-y-6">

          {/* Pending Payments */}
          {pendingPayments.length > 0 && (
            <Card className="border-yellow-500/30">
              <CardHeader
                title="Pagos Pendientes por Conciliar"
                subtitle={`${pendingPayments.length} reporte(s) en espera`}
              />
              <CardContent className="p-0">
                <div className="divide-y divide-slate-700/50">
                  {pendingPayments.map(tx => {
                    const client = users.find(u => u.id === tx.userId);
                    return (
                      <div key={tx.id} className="p-4 flex items-center justify-between bg-yellow-500/5">
                        <div>
                          <p className="font-medium text-white">{client?.name}</p>
                          <div className="flex gap-3 text-sm mt-1">
                            <span className="text-yellow-400 font-medium">{formatCurrency(tx.amountUSD)}</span>
                            <span className="text-slate-400">Ref: {tx.reference}</span>
                            <span className="text-slate-500 text-xs flex items-center">
                              <Clock size={12} className="mr-1" />
                              {new Date(tx.date).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="success" className="px-3 py-1.5" onClick={() => approvePayment(tx.id)}>
                            <CheckCircle2 size={18} className="mr-1" /> Validar
                          </Button>
                          <Button variant="danger" className="px-3 py-1.5" onClick={() => rejectPayment(tx.id)}>
                            <XCircle size={18} className="mr-1" /> Rechazar
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Client Table */}
          <Card>
            <CardHeader title="Directorio de Clientes" />
            <CardContent>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <Input
                  placeholder="Buscar cliente por nombre..."
                  className="pl-10 bg-slate-900 border-slate-700"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-400">
                      <th className="p-3">Cliente</th>
                      <th className="p-3 text-right">Saldo USD</th>
                      <th className="p-3 text-right">Saldo Bs</th>
                      <th className="p-3 text-center">Estatus</th>
                      <th className="p-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {filteredClients.map(client => (
                      <tr key={client.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="p-3 font-medium text-slate-200">{client.name}</td>
                        <td className="p-3 text-right font-mono text-white">{formatCurrency(client.balanceUSD)}</td>
                        <td className="p-3 text-right font-mono text-slate-400 text-sm">
                          {formatBs(client.balanceUSD, config.exchangeRate)}
                        </td>
                        <td className="p-3 text-center">
                          {client.balanceUSD > 0 ? (
                            <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                              ⚠️ PAGO PENDIENTE
                            </span>
                          ) : (
                            <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              ✅ AL DÍA
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <Button
                            variant="secondary"
                            className="px-2 py-1 text-xs h-auto"
                            onClick={() => setSelectedUserId(client.id)}
                          >
                            <Plus size={14} className="mr-1" /> Cargar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredClients.length === 0 && (
                  <div className="p-8 text-center text-slate-500">
                    No se encontraron clientes con ese nombre.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Inventory */}
          <Card className="border-purple-500/20">
            <CardHeader
              title="Inventario"
              subtitle="Ajusta el stock manualmente o impórtalo desde Excel/CSV"
              action={
                <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium cursor-pointer transition-colors">
                  <Upload size={14} />
                  {importing ? 'Importando...' : 'Importar Excel'}
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleImportExcel}
                    disabled={importing}
                  />
                </label>
              }
            />
            <CardContent>
              {importMsg && (
                <div className="mb-4 p-3 rounded-lg bg-slate-900 border border-slate-800 text-sm text-slate-300">
                  {importMsg}
                </div>
              )}
              <p className="text-xs text-slate-500 mb-3">
                El archivo debe tener columnas <strong>PRODUCTO</strong> y <strong>STOCK</strong> (opcionalmente <strong>PRECIO</strong>).
                Los productos existentes se actualizan por nombre; los que no existan se crean.
              </p>
              <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-slate-800">
                    <tr className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-400">
                      <th className="p-3">Producto</th>
                      <th className="p-3 text-right">Precio</th>
                      <th className="p-3 text-right">Stock</th>
                      <th className="p-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {products.map(product => {
                      const editValue = stockEdits[product.id];
                      const isLow = product.stock <= 3;
                      return (
                        <tr key={product.id} className="hover:bg-slate-800/50 transition-colors">
                          <td className="p-3 font-medium text-slate-200 flex items-center gap-2">
                            <Package size={14} className="text-slate-500" />
                            {product.name}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-300 text-sm">
                            {formatCurrency(product.priceUSD)}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Input
                                type="number"
                                min="0"
                                className="w-20 py-1 px-2 text-right"
                                value={editValue !== undefined ? editValue : product.stock}
                                onChange={(e) => handleStockInputChange(product.id, e.target.value)}
                              />
                              {isLow && editValue === undefined && (
                                <span className="text-xs text-red-400">bajo</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <Button
                              variant="secondary"
                              className="px-2 py-1 text-xs h-auto"
                              disabled={editValue === undefined}
                              onClick={() => handleSaveStock(product.id)}
                            >
                              <Save size={14} className="mr-1" /> Guardar
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {products.length === 0 && (
                  <div className="p-8 text-center text-slate-500">
                    No hay productos cargados todavía.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Actions & Config */}
        <div className="space-y-6">

          {/* Quick Load Consumption */}
          <Card className="border-blue-500/20">
            <CardHeader title="Cargar Consumo" subtitle="Registrar nueva compra a crédito" />
            <CardContent>
              <form onSubmit={handleAddConsumption} className="space-y-4">
                {consumptionError && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                    {consumptionError}
                  </div>
                )}
                <div>
                  <Label>Cliente</Label>
                  <select
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    required
                  >
                    <option value="">Seleccione un cliente...</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label>Producto</Label>
                  <select
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    required
                  >
                    <option value="">Seleccione producto...</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} - {formatCurrency(p.priceUSD)} (stock: {p.stock})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label>Cantidad</Label>
                  <Input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                    required
                  />
                </div>

                <Button type="submit" className="w-full">
                  Registrar Consumo
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Settings */}
          <Card>
            <CardHeader title="Configuración" />
            <CardContent>
              <form onSubmit={handleUpdateRate} className="space-y-4">
                <div>
                  <Label>Tasa de Cambio (Bs/USD)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={newRate}
                      onChange={(e) => setNewRate(e.target.value)}
                    />
                    <Button type="submit" variant="secondary">Actualizar</Button>
                  </div>
                </div>
              </form>

              <div className="mt-6 p-4 rounded-lg bg-slate-900 border border-slate-800">
                <div className="flex items-center gap-2 text-slate-300 mb-2 font-medium">
                  <Calendar size={16} /> Próximo Corte de Cobro
                </div>
                <p className="text-sm text-slate-500">
                  En <strong className="text-white">{config.cutoffDays} días</strong>.
                </p>
                <Button variant="secondary" className="w-full mt-3 text-xs">
                  Generar Recordatorio (.ics)
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
};
