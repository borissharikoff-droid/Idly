const STORAGE_KEY = 'grindly_font_scale'

export type FontScalePreset = 'compact' | 'default' | 'comfortable' | 'large'

export const FONT_SCALE_PRESETS: { id: FontScalePreset; label: string; zoom: number }[] = [
  { id: 'compact',     label: 'S',  zoom: 0.90 },
  { id: 'default',     label: 'M',  zoom: 1.00 },
  { id: 'comfortable', label: 'L',  zoom: 1.10 },
  { id: 'large',       label: 'XL', zoom: 1.20 },
]

export function getFontScalePreset(): FontScalePreset {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as FontScalePreset | null
    if (saved && FONT_SCALE_PRESETS.some(p => p.id === saved)) return saved
  } catch { /* ignore */ }
  return 'default'
}

export function applyFontScale(preset: FontScalePreset): void {
  const def = FONT_SCALE_PRESETS.find(p => p.id === preset)
  if (!def) return
  // Apply to <html> so portals rendered to document.body also scale correctly
  ;(document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = String(def.zoom)
}

export function setFontScale(preset: FontScalePreset): void {
  try { localStorage.setItem(STORAGE_KEY, preset) } catch { /* ignore */ }
  applyFontScale(preset)
}
