import { supabase } from './supabaseClient'
import { showOnly } from './views'
import { $, esc } from './dom'

type PetType = 'dog' | 'cat' | 'small_animal' | 'bird' | 'reptile' | 'fish' | 'other'

interface PetRow {
  id: string
  name: string
  type: PetType
  avatar_url: string | null
}

interface PhotoRow {
  id: string
  pet_id: string
  url: string
}

const typeEmoji: Record<PetType, string> = {
  dog: '🐕',
  cat: '🐈',
  small_animal: '🐹',
  bird: '🐦',
  reptile: '🦎',
  fish: '🐠',
  other: '🐾',
}

let wired = false

async function renderPhotosPage() {
  const wrap = $('photosContent')
  wrap.innerHTML = '<div class="empty-state">Loading…</div>'

  const { data: pets, error: petsError } = await supabase.from('pets').select('id, name, type, avatar_url').order('created_at', { ascending: true })
  if (petsError || !pets || !pets.length) {
    wrap.innerHTML = '<div class="empty-state">Add a pet to start a photo catalog.</div>'
    return
  }

  const { data: photos, error: photosError } = await supabase
    .from('pet_photos')
    .select('id, pet_id, url')
    .order('created_at', { ascending: false })
  if (photosError) {
    wrap.innerHTML = '<div class="empty-state">Couldn’t load photos.</div>'
    return
  }

  const byPet = new Map<string, PhotoRow[]>()
  ;(photos as PhotoRow[]).forEach((p) => {
    const list = byPet.get(p.pet_id) || []
    list.push(p)
    byPet.set(p.pet_id, list)
  })

  const sections = (pets as PetRow[])
    .filter((pet) => (byPet.get(pet.id) || []).length)
    .map((pet) => {
      const petPhotos = byPet.get(pet.id) || []
      return `
        <div class="photo-pet-section">
          <div class="photo-pet-heading">${esc(typeEmoji[pet.type] || '🐾')} ${esc(pet.name)}</div>
          <div class="photo-grid">
            ${petPhotos.map((p) => `<div class="photo-thumb"><img src="${esc(p.url)}" alt=""></div>`).join('')}
          </div>
        </div>
      `
    })
    .join('')

  wrap.innerHTML = sections || '<div class="empty-state">No photos yet — add some from a pet’s Profile tab.</div>'
}

function wireStaticControls() {
  $('photosBackBtn').addEventListener('click', hidePhotos)
}

export function showPhotos() {
  if (!wired) {
    wireStaticControls()
    wired = true
  }
  showOnly('photosView')
  renderPhotosPage()
}

export function hidePhotos() {
  showOnly('appMain')
}
