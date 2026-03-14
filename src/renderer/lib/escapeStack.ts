/**
 * Global escape-key handler stack.
 * Modals/panels push a close callback when they open and pop when they close.
 * The keyboard shortcut handler calls triggerEscape() first; if the stack is
 * empty it falls through to the default "navigate home" behaviour.
 */

type EscapeHandler = () => void
const handlers: EscapeHandler[] = []

export function pushEscapeHandler(fn: EscapeHandler): void {
  handlers.push(fn)
}

export function popEscapeHandler(fn: EscapeHandler): void {
  const idx = handlers.lastIndexOf(fn)
  if (idx !== -1) handlers.splice(idx, 1)
}

/** Fires the topmost handler. Returns true if one was called, false if stack empty. */
export function triggerEscape(): boolean {
  if (handlers.length === 0) return false
  handlers[handlers.length - 1]()
  return true
}
