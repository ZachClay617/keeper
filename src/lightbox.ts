let overlay: HTMLDivElement | null = null

function ensureOverlay(): HTMLDivElement {
  if (overlay) return overlay
  overlay = document.createElement('div')
  overlay.className = 'lightbox-overlay'
  overlay.innerHTML = `
    <button class="lightbox-close" aria-label="Close">×</button>
    <img class="lightbox-img" alt="">
  `
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || (e.target as HTMLElement).closest('.lightbox-close')) closeLightbox()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox()
  })
  document.body.appendChild(overlay)
  return overlay
}

export function openLightbox(url: string) {
  const el = ensureOverlay()
  ;(el.querySelector('.lightbox-img') as HTMLImageElement).src = url
  el.classList.add('open')
}

export function closeLightbox() {
  overlay?.classList.remove('open')
}
