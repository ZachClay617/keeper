import { supabase } from './supabaseClient'
import { showOnly } from './views'
import { $, esc } from './dom'

type SpeciesType = 'dog' | 'cat' | 'small_animal' | 'reptile' | 'fish'

interface CareGuide {
  id: string
  species_type: SpeciesType
  name: string
  lifespan: string | null
  temp: string | null
  humidity: string | null
  enclosure_size: string | null
  diet: string | null
  note: string | null
}

const categoryLabels: Record<SpeciesType, string> = {
  dog: 'Dogs',
  cat: 'Cats',
  small_animal: 'Small Animals',
  reptile: 'Reptiles',
  fish: 'Fish',
}

let wired = false
let guides: CareGuide[] = []
let loaded = false
let activeType: SpeciesType = 'dog'

async function fetchGuides() {
  const { data, error } = await supabase.from('care_guides').select('*').order('name', { ascending: true })
  if (error) {
    console.error('Failed to load care guides', error)
    guides = []
    return
  }
  guides = (data as CareGuide[]) || []
  loaded = true
}

function renderTabs() {
  const wrap = $('guideTabs')
  wrap.innerHTML = (Object.keys(categoryLabels) as SpeciesType[])
    .map((key) => `<button class="guide-tab${key === activeType ? ' active' : ''}" data-type="${key}">${categoryLabels[key]}</button>`)
    .join('')
}

function renderList() {
  const list = $('guideList')
  const entries = guides.filter((g) => g.species_type === activeType)
  list.innerHTML = entries
    .map(
      (g) => `
      <div class="guide-row" data-name="${esc(g.name.toLowerCase())}" data-id="${g.id}">
        <button class="guide-row-header">
          <span class="guide-name">${esc(g.name)}</span>
          <span class="guide-chevron">▾</span>
        </button>
        <div class="guide-details">
          <div class="guide-field-grid">
            <div class="guide-field"><strong>Temp:</strong> ${esc(g.temp || '—')}</div>
            <div class="guide-field"><strong>Humidity:</strong> ${esc(g.humidity || '—')}</div>
            <div class="guide-field"><strong>Enclosure:</strong> ${esc(g.enclosure_size || '—')}</div>
            <div class="guide-field"><strong>Diet:</strong> ${esc(g.diet || '—')}</div>
          </div>
          <div class="guide-field"><strong>Lifespan:</strong> ${esc(g.lifespan || '—')}</div>
          ${g.note ? `<div class="guide-note">${esc(g.note)}</div>` : ''}
        </div>
      </div>
    `
    )
    .join('')
  applySearch()
}

function applySearch() {
  const q = ($('guideSearch') as HTMLInputElement).value.trim().toLowerCase()
  let any = false
  document.querySelectorAll<HTMLElement>('#guideList .guide-row').forEach((row) => {
    const match = !q || (row.dataset.name || '').indexOf(q) !== -1
    row.classList.toggle('hidden', !match)
    if (match) any = true
  })
  $('guideNoMatch').style.display = any ? 'none' : ''
}

function wireStaticControls() {
  $('guideTabs').addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.guide-tab') as HTMLButtonElement | null
    if (!btn) return
    activeType = btn.dataset.type as SpeciesType
    ;($('guideSearch') as HTMLInputElement).value = ''
    renderTabs()
    renderList()
  })
  $('guideList').addEventListener('click', (e) => {
    const header = (e.target as HTMLElement).closest('.guide-row-header')
    if (!header) return
    header.closest('.guide-row')?.classList.toggle('open')
  })
  $('guideSearch').addEventListener('input', applySearch)
  $('careGuidesBackBtn').addEventListener('click', hideCareGuides)
}

export async function showCareGuides() {
  if (!wired) {
    wireStaticControls()
    wired = true
  }
  showOnly('careGuidesView')
  activeType = 'dog'
  ;($('guideSearch') as HTMLInputElement).value = ''
  if (!loaded) await fetchGuides()
  renderTabs()
  renderList()
}

export function hideCareGuides() {
  showOnly('appMain')
}
