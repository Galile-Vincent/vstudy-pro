export function localDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function dayBound(value: string, end = false) {
  const date = new Date(`${value}T00:00:00`);
  if (end) date.setHours(23,59,59,999);
  return date.toISOString();
}
export function validDay(value: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) && localDate(date.toISOString()) === value;
}
