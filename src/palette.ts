export type PaletteName = 'sage' | 'blue' | 'amber'

export const paletteOptions: { value: PaletteName; label: string; swatches: string[] }[] = [
  { value: 'sage', label: 'Sage', swatches: ['#4B6350', '#DB9A3C', '#B9503E'] },
  { value: 'blue', label: 'Blue', swatches: ['#3D6EA6', '#C9974A', '#B15D6C'] },
  { value: 'amber', label: 'Amber', swatches: ['#C1832E', '#D9A66B', '#A6472E'] },
]

/** Applies an account's chosen color palette by setting/clearing a root attribute — the CSS variable overrides do the rest. */
export function applyPalette(name: string | null | undefined) {
  if (!name || name === 'sage') {
    document.documentElement.removeAttribute('data-palette')
  } else {
    document.documentElement.setAttribute('data-palette', name)
  }
}
