/** Normalises Nigerian numbers to +234…: "0803 123 4567" → "+2348031234567". */
export function normalizePhone(raw: string): string | null {
  const s = raw.replace(/[\s\-().]/g, '');
  let out: string;
  if (/^0\d{10}$/.test(s)) out = `+234${s.slice(1)}`;
  else if (/^234\d{10}$/.test(s)) out = `+${s}`;
  else if (/^\+\d{10,15}$/.test(s)) out = s;
  else if (/^\d{10}$/.test(s) && /^[789]/.test(s)) out = `+234${s}`;
  else return null;
  return out;
}

/** wa.me wants digits only. */
export const waDigits = (phone: string) => phone.replace(/\D/g, '');
export const waLink = (phone: string, text: string) => `https://wa.me/${waDigits(phone)}?text=${encodeURIComponent(text)}`;
