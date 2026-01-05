export function trimUzbekCountryCode(phone: string): string {
  const digitsOnly = phone.replace(/\D/g, "");

  // Trim country code ONLY if it's a full international number
  if (digitsOnly.startsWith("998") && digitsOnly.length === 12) {
    return digitsOnly.slice(3);
  }

  return digitsOnly;
}
