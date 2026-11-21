const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const date = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});
const time = new Intl.DateTimeFormat("en-IN", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});
const number = new Intl.NumberFormat("en-IN");

export function formatCurrency(paise: number) {
  if (!Number.isSafeInteger(paise) || paise < 0)
    throw new Error("Expected non-negative integer paise.");
  // Format whole rupees as BigInt, then replace the fraction. Even very large
  // safe-integer paise values retain their exact final two digits.
  const amount = BigInt(paise);
  return currency
    .formatToParts(amount / BigInt(100))
    .map((part) =>
      part.type === "fraction" ? String(amount % BigInt(100)).padStart(2, "0") : part.value,
    )
    .join("");
}
export function formatDate(value: string) {
  return date.format(new Date(value));
}
export function formatTime(value: string) {
  return time.format(new Date(value));
}
export function formatNumber(value: number) {
  return number.format(value);
}
