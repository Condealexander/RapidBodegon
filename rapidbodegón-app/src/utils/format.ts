export const toCents = (amount: number) => Math.round((amount + Number.EPSILON) * 100);

export const fromCents = (cents: number) => cents / 100;

export const roundToCents = (amount: number) => fromCents(toCents(amount));

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

export const formatBs = (amountUSD: number, rate: number) => {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'VES',
  }).format(amountUSD * rate);
};
