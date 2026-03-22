/** Format a number with space as the thousands separator: 1234567 → "1 234 567" */
export function fmt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')
}
