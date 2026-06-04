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