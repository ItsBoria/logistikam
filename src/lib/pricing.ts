export const VAT_RATE = 0.18;
export const VAT_LABEL = 'כולל מע״מ';

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function addVat(amount: number) {
  return roundCurrency(amount * (1 + VAT_RATE));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCurrencyShort(amount: number) {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `₪${(amount / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 10_000) return `₪${Math.round(amount / 1000)}K`;
  if (abs >= 1000) return `₪${(amount / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `₪${Math.round(amount)}`;
}