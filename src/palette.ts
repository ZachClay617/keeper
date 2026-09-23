export type PaletteName = 'sage' | 'blue' | 'terracotta' | 'lavender' | 'teal' | 'rose' | 'slate'

export const paletteOptions: { value: PaletteName; label: string; swatches: string[] }[] = [
  { value: 'sage', label: 'Sage', swatches: ['#4B6350', '#DB9A3C', '#B9503E'] },
  { value: 'blue', label: 'Blue', swatches: ['#3D6EA6', '#C9974A', '#B15D6C'] },
  { value: 'terracotta', label: 'Terracotta', swatches: ['#C1613A', '#D9A66B', '#A6472E'] },
  { value: 'lavender', label: 'Lavender', swatches: ['#7A5FA6', '#C9974A', '#B15D6C'] },
  { value: 'teal', label: 'Teal', swatches: ['#2E8C86', '#D9A66B', '#B15D4E'] },
  { value: 'rose', label: 'Rose', swatches: ['#B15D74', '#D9A66B', '#A6472E'] },
  { value: 'slate', label: 'Slate', swatches: ['#51707D', '#C9974A', '#B15D5D'] },
]

/** Applies an account's chosen color palette by setting/clearing a root attribute — the CSS variable overrides do the rest. */
export function applyPalette(name: string | null | undefined) {
  if (!name || name === 'sage') {
    document.documentElement.removeAttribute('data-palette')
  } else {
    document.documentElement.setAttribute('data-palette', name)
  }
}
