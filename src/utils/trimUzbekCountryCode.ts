export function trimUzbekCountryCode(phone: string): number {
  const digitsOnly = phone.replace(/\D/g, "");

  // Trim country code ONLY if it's a full international number
  if (digitsOnly.startsWith("998") && digitsOnly.length === 12) {
    return Number(digitsOnly.slice(3));
  }

  return Number(digitsOnly);
}
