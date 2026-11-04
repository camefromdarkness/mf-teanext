export function normalizeRussianPhone(value: string) {
  let digits = value.replace(/\D/g, "");

  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    digits = digits.slice(1);
  } else if (digits.length !== 10) {
    return null;
  }

  if (!/^[3-9]\d{9}$/.test(digits)) return null;
  return `+7${digits}`;
}

export function formatRussianPhoneInput(value: string) {
  let digits = value.replace(/\D/g, "");
  if (!digits) return "";

  const hasExplicitCountryCode = /^\s*\+7/.test(value);
  const hasCompleteDialPrefix =
    digits.length === 11 &&
    (digits.startsWith("7") || digits.startsWith("8"));
  if (hasExplicitCountryCode || hasCompleteDialPrefix) {
    digits = digits.slice(1);
    digits = digits.slice(0, 10);
    if (!digits) return "+7";
    return formatNationalNumber(digits, "+7");
  }
  digits = digits.slice(0, 10);

  if (value.trim().startsWith("7") || value.trim().startsWith("8")) {
    const trunk = digits.slice(0, 1);
    const nationalDigits = digits.slice(1);
    if (nationalDigits && !/^[3-9]/.test(nationalDigits)) return trunk;
    let formatted = trunk;
    if (nationalDigits) formatted += ` (${nationalDigits.slice(0, 3)}`;
    if (nationalDigits.length >= 3) formatted += ")";
    if (nationalDigits.length > 3) formatted += ` ${nationalDigits.slice(3, 6)}`;
    if (nationalDigits.length > 6) formatted += `-${nationalDigits.slice(6, 8)}`;
    if (nationalDigits.length > 8) formatted += `-${nationalDigits.slice(8, 10)}`;
    return formatted;
  }

  if (!digits) return "";
  if (!/^[3-9]/.test(digits)) return "";
  return formatNationalNumber(digits, "+7");
}

function formatNationalNumber(digits: string, prefix: string) {
  if (!digits) return prefix;
  if (!/^[3-9]/.test(digits)) return prefix;
  const areaCode = digits.slice(0, 3);
  let formatted = `${prefix} (${areaCode}`;
  if (digits.length >= 3) formatted += ")";
  if (digits.length > 3) formatted += ` ${digits.slice(3, 6)}`;
  if (digits.length > 6) formatted += `-${digits.slice(6, 8)}`;
  if (digits.length > 8) formatted += `-${digits.slice(8, 10)}`;
  return formatted;
}
