export function $(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Missing #${id}`)
  return el
}

const escapeMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Escapes a string for safe interpolation into HTML — including inside a quoted attribute. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => escapeMap[c])
}
