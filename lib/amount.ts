/**
 * Canonical invoice amount string. Keeps every digit the user entered (up to 6 decimals,
 * the token precision on both chains) instead of rounding through a float.
 * "100" -> "100.00", "0.002" -> "0.002", "1.50" -> "1.50", "007.5" -> "7.50".
 * Throws on anything not a positive decimal or with more than 6 fractional digits.
 */
export function normalizeInvoiceAmount(input: string): string {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(input.trim());
  if (!m) throw new Error('Amount must be a decimal number.');
  const whole = m[1].replace(/^0+(?=\d)/, '');
  let frac = m[2] ?? '';
  if (frac.length > 6) throw new Error('Amount supports at most six decimal places.');
  frac = frac.replace(/0+$/, '').padEnd(2, '0');
  if (/^0+$/.test(whole) && /^0+$/.test(frac)) throw new Error('Amount must be greater than zero.');
  return `${whole}.${frac}`;
}
