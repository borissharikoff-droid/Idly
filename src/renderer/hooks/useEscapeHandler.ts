import { useEffect, useRef } from 'react'
import { pushEscapeHandler, popEscapeHandler } from '../lib/escapeStack'

/**
 * Registers `onEscape` as the topmost escape handler while `active` is true.
 * Automatically deregisters when `active` becomes false or the component unmounts.
 */
export function useEscapeHandler(onEscape: () => void, active: boolean): void {
  const ref = useRef(onEscape)
  ref.current = onEscape

  useEffect(() => {
    if (!active) return
    const fn = () => ref.current()
    pushEscapeHandler(fn)
    return () => popEscapeHandler(fn)
  }, [active])
}
