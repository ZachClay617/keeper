import { supabase } from './supabaseClient'
import { onPetSelected as notifyDailyPetSelected, onSignedOut as notifyDailySignedOut } from './daily'
import { onPetSelected as notifyLogPetSelected, onSignedOut as notifyLogSignedOut } from './careLog'
import { onPetSelected as notifyShoppingPetSelected, onSignedOut as notifyShoppingSignedOut } from './shopping'

type PetType = 'dog' | 'cat' | 'small_animal' | 'bird' | 'reptile' | 'fish' | 'other'
type PetStatus = 'active' | 'memorial'

interface Pet {
  id: string
  owner_id: string
  name: string
  type: PetType
  species: string | null
  breed_or_morph: string | null
  age: string | null
  weight: string | null
  enclosure_size: string | null
  since_date: string | null
  personality: string | null
  care_notes: string | null
  status: PetStatus
  passed_date: string | null
  memory_note: string | null
  monthly_budget: number | null
  created_at: string
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

const typeLabel: Record<PetType, string> = {
  dog: 'Dog',
  cat: 'Cat',
  small_animal: 'Small animal',
  bird: 'Bird',
  reptile: 'Reptile',
  fish: 'Fish',
  other: 'Pet',
}

const speciesOptions: Partial<Record<PetType, string[]>> = {
  small_animal: [
    'Rabbit', 'Guinea pig', 'Hamster', 'Gerbil', 'Rat', 'Mouse', 'Chinchilla', 'Ferret',
    'Hedgehog', 'Sugar glider', 'Degu', 'Chipmunk', 'Prairie dog', 'Skunk',
    'Short-tailed opossum', 'Flying squirrel', 'Other',
  ],
  bird: [
    'Budgerigar (Budgie)', 'Cockatiel', 'Lovebird', 'Parrotlet', 'Conure', 'Quaker parrot',
    'African grey parrot', 'Amazon parrot', 'Eclectus parrot', 'Pionus parrot', 'Senegal parrot',
    'Caique', 'Cockatoo', 'Macaw', 'Canary', 'Finch', 'Dove', 'Other',
  ],
  reptile: [
    'Bearded dragon', 'Leopard gecko', 'Ball python', 'Corn snake', 'Crested gecko',
    'Red-eared slider', 'Box turtle', 'Blue-tongued skink', 'Russian tortoise', 'Sulcata tortoise',
    'Green anole', 'Veiled chameleon', 'King snake', 'Milk snake', 'Boa constrictor', 'Uromastyx',
    'Gargoyle gecko', 'Green iguana', 'Chinese water dragon', 'Savannah monitor', 'Garter snake', 'Other',
  ],
  fish: [
    'Angelfish', 'Betta', 'Bristlenose pleco', 'Butterflyfish', 'Cherry barb', 'Clown loach',
    'Clownfish', 'Cory catfish', 'Danio', 'Discus', 'Dwarf gourami', 'Fancy goldfish',
    'Flowerhorn cichlid', 'Gar', 'Glass catfish', 'Goby', 'Goldfish', 'Guppy', 'Killifish', 'Koi',
    'Kuhli loach', 'Lionfish', 'Mandarinfish', 'Molly', 'Neon tetra', 'Oscar', 'Pearl gourami',
    'Pictus catfish', 'Platy', 'Plecostomus (Pleco)', 'Puffer fish', 'Rainbowfish', 'Rasbora',
    'Rope fish', 'Rosy barb', 'Seahorse', 'Swordtail', 'Tang', 'Tetra', 'Tiger barb', 'Wrasse', 'Other',
  ],
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Missing #${id}`)
  return el
}

function esc(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}

let pets: Pet[] = []
let currentPetId: string | null = null
let currentModalType: 'addPet' | 'editPet' | 'confirmDelete' | 'moveMemorial' | 'restorePet' | null = null
let actionTargetId: string | null = null
let viewingMemorial = false

function activePets(): Pet[] {
  return pets.filter((p) => p.status === 'active')
}

function memorialPets(): Pet[] {
  return pets.filter((p) => p.status === 'memorial')
}

function speciesLabel(pet: Pet): string {
  const catalogPick = pet.species || ''
  const breed = pet.breed_or_morph || ''
  const base = catalogPick ? (breed ? `${catalogPick} (${breed})` : catalogPick) : breed
  return base ? `${base} · ${typeLabel[pet.type]}` : typeLabel[pet.type]
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const dt = new Date(iso + 'T00:00:00')
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

async function loadPets() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) {
    console.error('Failed to load pets', error)
    return
  }
  pets = (data as Pet[]) || []
  if (currentPetId && !activePets().some((p) => p.id === currentPetId)) {
    currentPetId = null
  }
  if (!currentPetId && activePets().length) {
    currentPetId = activePets()[0].id
  }
}

function createAvatarButton(pet: Pet): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = 'pet-avatar' + (pet.id === currentPetId ? ' active' : '')
  btn.dataset.id = pet.id
  btn.innerHTML = `<span class="circle">${typeEmoji[pet.type]}</span><span class="name">${esc(pet.name)}</span>`
  btn.addEventListener('click', () => selectPet(pet.id))
  return btn
}

function renderSwitcher() {
  const switcher = $('petSwitcher') as HTMLElement
  switcher.innerHTML = ''
  activePets().forEach((pet) => switcher.appendChild(createAvatarButton(pet)))
  const addBtn = document.createElement('button')
  addBtn.className = 'pet-avatar add'
  addBtn.innerHTML = '<span class="circle">+</span><span class="name">Add pet</span>'
  addBtn.addEventListener('click', () => openModal('addPet'))
  switcher.appendChild(addBtn)
}

function selectPet(id: string) {
  currentPetId = id
  setActiveTab('profile')
  renderAll()
}

function setActiveTab(tab: string) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', (t as HTMLElement).dataset.tab === tab))
  document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'))
  const panel = document.getElementById('panel-' + tab)
  if (panel) panel.classList.add('active')
}

function buildStats(pet: Pet): { label: string; value: string }[] {
  const stats: { label: string; value: string }[] = []
  if (pet.age) stats.push({ label: 'Age', value: pet.age })
  if (pet.weight) stats.push({ label: 'Weight', value: pet.weight })
  if (pet.enclosure_size) stats.push({ label: 'Tank size', value: pet.enclosure_size })
  if (pet.since_date) stats.push({ label: 'With you', value: formatDate(pet.since_date) })
  return stats
}

function renderProfile() {
  const manageRow = $('profileManageRow')
  const pet = activePets().find((p) => p.id === currentPetId)

  if (!pet) {
    $('profileEmoji').textContent = '🐾'
    $('profileName').textContent = 'No pets yet'
    $('profileSpecies').textContent = ''
    $('profileId').textContent = ''
    $('profilePersonality').textContent = ''
    $('profileNotes').textContent = ''
    $('statGrid').innerHTML = '<div class="empty-state">Add a pet to get started.</div>'
    manageRow.style.display = 'none'
    return
  }

  manageRow.style.display = ''
  $('profileEmoji').textContent = typeEmoji[pet.type]
  $('profileName').textContent = pet.name
  $('profileSpecies').textContent = speciesLabel(pet)
  $('profileId').textContent = 'ID #' + pet.id.slice(0, 8).toUpperCase()
  $('profilePersonality').textContent = pet.personality || 'Not noted yet.'
  $('profileNotes').textContent = pet.care_notes || 'No notes yet.'

  const statGrid = $('statGrid')
  statGrid.innerHTML = ''
  const stats = buildStats(pet)
  if (!stats.length) {
    statGrid.innerHTML = '<div class="empty-state">No details added yet.</div>'
  } else {
    stats.forEach((s) => {
      const div = document.createElement('div')
      div.className = 'stat-block'
      div.innerHTML = `<div class="stat-label">${s.label}</div><div class="stat-value">${esc(s.value)}</div>`
      statGrid.appendChild(div)
    })
  }
}

let lastNotifiedPetId: string | null | undefined = undefined

/** Forces Daily Care / Shopping to recompute "today" — call after the account timezone changes. */
export function refreshCurrentPet() {
  notifyDailyPetSelected(currentPetId)
  const pet = activePets().find((p) => p.id === currentPetId) || null
  notifyShoppingPetSelected(pet ? { id: pet.id, name: pet.name, monthly_budget: pet.monthly_budget } : null)
}

function renderAll() {
  renderSwitcher()
  renderProfile()
  if (currentPetId !== lastNotifiedPetId) {
    lastNotifiedPetId = currentPetId
    notifyDailyPetSelected(currentPetId)
    notifyLogPetSelected(currentPetId)
  }
  const pet = activePets().find((p) => p.id === currentPetId) || null
  notifyShoppingPetSelected(pet ? { id: pet.id, name: pet.name, monthly_budget: pet.monthly_budget } : null)
}

function renderMemorialToggle() {
  const btn = $('memorialToggle') as HTMLButtonElement
  const count = memorialPets().length
  btn.textContent = viewingMemorial ? '← Back to your pets' : `In loving memory (${count})`
  btn.style.display = viewingMemorial || count > 0 ? '' : 'none'
}

function renderMemorialView() {
  const list = $('memorialList')
  const mems = memorialPets()
  if (!mems.length) {
    list.innerHTML = '<div class="empty-state">No pets here yet.</div>'
    return
  }
  list.innerHTML = ''
  mems.forEach((pet) => {
    const card = document.createElement('div')
    card.className = 'card memorial-card'
    card.innerHTML = `
      <div class="profile-top">
        <div class="profile-emoji">${typeEmoji[pet.type]}</div>
        <div>
          <h1 class="profile-name">${esc(pet.name)}</h1>
          <div class="profile-species">${esc(speciesLabel(pet))}</div>
          ${pet.passed_date ? `<div class="profile-id">Passed ${esc(formatDate(pet.passed_date))}</div>` : ''}
        </div>
      </div>
      ${pet.memory_note ? `<div class="section-label" style="margin-top:18px;">A memory</div><div class="section-text">${esc(pet.memory_note)}</div>` : ''}
      <div class="manage-row">
        <button class="manage-link" data-restore="${pet.id}">Move back to active</button>
        <button class="manage-link delete-link" data-delete="${pet.id}">Delete pet</button>
      </div>
    `
    list.appendChild(card)
  })
  list.querySelectorAll<HTMLButtonElement>('[data-restore]').forEach((b) => {
    b.addEventListener('click', () => {
      actionTargetId = b.dataset.restore!
      openModal('restorePet')
    })
  })
  list.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach((b) => {
    b.addEventListener('click', () => {
      actionTargetId = b.dataset.delete!
      openModal('confirmDelete')
    })
  })
}

function showMemorialView(show: boolean) {
  viewingMemorial = show
  $('appMain').style.display = show ? 'none' : ''
  $('memorialView').style.display = show ? '' : 'none'
  renderMemorialToggle()
  if (show) renderMemorialView()
}

// ── Modal ────────────────────────────────────────────────────────────────

function speciesSelectHtml(type: PetType): string {
  const opts = speciesOptions[type]
  if (!opts) return ''
  return (
    '<option value="">Select a species…</option>' +
    opts.map((o) => `<option>${esc(o)}</option>`).join('')
  )
}

function petFormHtml(pet: Pet | null): string {
  return `
    <div class="field"><label for="f-name">Name</label><input id="f-name" type="text" placeholder="e.g. Charlie" value="${pet ? esc(pet.name) : ''}"></div>
    <div class="field"><label for="f-type">Type</label>
      <select id="f-type">
        <option value="dog">Dog</option><option value="cat">Cat</option><option value="small_animal">Small animal</option>
        <option value="bird">Bird</option><option value="reptile">Reptile</option><option value="fish">Fish</option>
        <option value="other">Other</option>
      </select>
    </div>
    <div class="field" id="f-small_animal-wrap" style="display:none;"><label for="f-small_animal-species">Species</label><select id="f-small_animal-species">${speciesSelectHtml('small_animal')}</select></div>
    <div class="field" id="f-bird-wrap" style="display:none;"><label for="f-bird-species">Species</label><select id="f-bird-species">${speciesSelectHtml('bird')}</select></div>
    <div class="field" id="f-reptile-wrap" style="display:none;"><label for="f-reptile-species">Species</label><select id="f-reptile-species">${speciesSelectHtml('reptile')}</select></div>
    <div class="field" id="f-fish-wrap" style="display:none;"><label for="f-fish-species">Species</label><select id="f-fish-species">${speciesSelectHtml('fish')}</select></div>
    <div class="field"><label for="f-breed">Breed / morph (optional)</label><input id="f-breed" type="text" placeholder="e.g. Golden Retriever, Mack Snow, Netherland Dwarf" value="${pet ? esc(pet.breed_or_morph || '') : ''}"></div>
    <div class="field"><label for="f-age">Age</label><input id="f-age" type="text" placeholder="e.g. 2 years" value="${pet ? esc(pet.age || '') : ''}"></div>
    <div class="field"><label for="f-weight">Weight (optional)</label><input id="f-weight" type="text" placeholder="e.g. 12 lbs" value="${pet ? esc(pet.weight || '') : ''}"></div>
    <div class="field"><label for="f-tank">Enclosure / tank size (optional)</label><input id="f-tank" type="text" placeholder="e.g. 20 gal" value="${pet ? esc(pet.enclosure_size || '') : ''}"></div>
    <div class="field"><label for="f-since">With you since (optional)</label><input id="f-since" type="date" value="${pet?.since_date || ''}"></div>
    <div class="field"><label for="f-personality">Personality</label><textarea id="f-personality" placeholder="A few words on their personality">${pet ? esc(pet.personality || '') : ''}</textarea></div>
    <div class="field"><label for="f-notes">Care notes</label><textarea id="f-notes" placeholder="Allergies, quirks, anything a sitter should know">${pet ? esc(pet.care_notes || '') : ''}</textarea></div>
    <div class="auth-error" id="petFormError"></div>
    <button class="btn-primary btn-block" id="modalSubmit">${pet ? 'Save changes' : 'Add pet'}</button>
  `
}

function wireSpeciesToggle(pet: Pet | null) {
  const typeSelect = document.getElementById('f-type') as HTMLSelectElement
  typeSelect.value = pet?.type || 'dog'
  const wraps: Partial<Record<PetType, HTMLElement>> = {
    small_animal: document.getElementById('f-small_animal-wrap') || undefined,
    bird: document.getElementById('f-bird-wrap') || undefined,
    reptile: document.getElementById('f-reptile-wrap') || undefined,
    fish: document.getElementById('f-fish-wrap') || undefined,
  }
  const sync = () => {
    ;(Object.keys(wraps) as PetType[]).forEach((k) => {
      const el = wraps[k]
      if (el) el.style.display = typeSelect.value === k ? '' : 'none'
    })
  }
  typeSelect.addEventListener('change', sync)
  sync()
  if (pet?.species) {
    const speciesSelect = document.getElementById(`f-${pet.type}-species`) as HTMLSelectElement | null
    if (speciesSelect) speciesSelect.value = pet.species
  }
}

function openModal(type: typeof currentModalType) {
  currentModalType = type
  const modalTitle = $('modalTitle')
  const modalBody = $('modalBody')

  if (type === 'addPet') {
    modalTitle.textContent = 'Add a pet'
    modalBody.innerHTML = petFormHtml(null)
  } else if (type === 'editPet') {
    const pet = pets.find((p) => p.id === actionTargetId)
    if (!pet) return
    modalTitle.textContent = 'Edit profile'
    modalBody.innerHTML = petFormHtml(pet)
  } else if (type === 'confirmDelete') {
    const pet = pets.find((p) => p.id === actionTargetId)
    if (!pet) return
    modalTitle.textContent = `Delete ${pet.name}?`
    modalBody.innerHTML = `
      <p class="modal-text">This permanently removes ${esc(pet.name)}'s profile and everything tied to it. This can't be undone.</p>
      <div class="modal-btn-row">
        <button class="btn-secondary" id="modalCancel">Cancel</button>
        <button class="btn-danger" id="modalSubmit">Delete</button>
      </div>
    `
  } else if (type === 'moveMemorial') {
    const pet = pets.find((p) => p.id === actionTargetId)
    if (!pet) return
    modalTitle.textContent = `Move ${pet.name} to In Loving Memory`
    modalBody.innerHTML = `
      <p class="modal-text">Their profile stays saved in a memorial space, separate from your active pets.</p>
      <div class="field"><label for="f-passed">Date passed (optional)</label><input id="f-passed" type="date"></div>
      <div class="field"><label for="f-memory">A memory to keep (optional)</label><textarea id="f-memory" placeholder="Something you'll want to remember about them"></textarea></div>
      <div class="modal-btn-row">
        <button class="btn-secondary" id="modalCancel">Cancel</button>
        <button class="btn-primary" id="modalSubmit">Move</button>
      </div>
    `
  } else if (type === 'restorePet') {
    const pet = pets.find((p) => p.id === actionTargetId)
    if (!pet) return
    modalTitle.textContent = `Move ${pet.name} back to active?`
    modalBody.innerHTML = `
      <p class="modal-text">${esc(pet.name)} will show up in your pet switcher again.</p>
      <div class="modal-btn-row">
        <button class="btn-secondary" id="modalCancel">Cancel</button>
        <button class="btn-primary" id="modalSubmit">Move back</button>
      </div>
    `
  } else {
    return
  }

  if (type === 'addPet' || type === 'editPet') {
    const pet = type === 'editPet' ? pets.find((p) => p.id === actionTargetId) || null : null
    wireSpeciesToggle(pet)
  }

  $('modalOverlay').classList.add('open')
  $('modalSubmit').addEventListener('click', handleModalSubmit)
  const cancelBtn = document.getElementById('modalCancel')
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal)
}

function closeModal() {
  $('modalOverlay').classList.remove('open')
  currentModalType = null
  actionTargetId = null
}

function readPetForm(): Omit<Pet, 'id' | 'owner_id' | 'created_at' | 'status' | 'passed_date' | 'memory_note' | 'monthly_budget'> | null {
  const nameInput = document.getElementById('f-name') as HTMLInputElement
  const name = nameInput.value.trim()
  if (!name) {
    nameInput.focus()
    return null
  }
  const type = (document.getElementById('f-type') as HTMLSelectElement).value as PetType
  const speciesFieldId = `f-${type}-species`
  const speciesField = document.getElementById(speciesFieldId) as HTMLSelectElement | null
  const species = speciesField ? speciesField.value : ''
  const breed = (document.getElementById('f-breed') as HTMLInputElement).value.trim()
  const age = (document.getElementById('f-age') as HTMLInputElement).value.trim()
  const weight = (document.getElementById('f-weight') as HTMLInputElement).value.trim()
  const tank = (document.getElementById('f-tank') as HTMLInputElement).value.trim()
  const since = (document.getElementById('f-since') as HTMLInputElement).value
  const personality = (document.getElementById('f-personality') as HTMLTextAreaElement).value.trim()
  const notes = (document.getElementById('f-notes') as HTMLTextAreaElement).value.trim()

  return {
    name,
    type,
    species: species || null,
    breed_or_morph: breed || null,
    age: age || null,
    weight: weight || null,
    enclosure_size: tank || null,
    since_date: since || null,
    personality: personality || null,
    care_notes: notes || null,
  }
}

async function handleModalSubmit() {
  if (currentModalType === 'addPet') {
    const fields = readPetForm()
    if (!fields) return
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase
      .from('pets')
      .insert({ ...fields, owner_id: user.id })
      .select()
      .single()
    if (error) {
      $('petFormError').textContent = error.message
      $('petFormError').classList.add('visible')
      return
    }
    pets.push(data as Pet)
    currentPetId = (data as Pet).id
    closeModal()
    renderAll()
  } else if (currentModalType === 'editPet') {
    const fields = readPetForm()
    if (!fields || !actionTargetId) return
    const { data, error } = await supabase.from('pets').update(fields).eq('id', actionTargetId).select().single()
    if (error) {
      $('petFormError').textContent = error.message
      $('petFormError').classList.add('visible')
      return
    }
    const idx = pets.findIndex((p) => p.id === actionTargetId)
    if (idx !== -1) pets[idx] = data as Pet
    closeModal()
    renderAll()
  } else if (currentModalType === 'confirmDelete') {
    if (!actionTargetId) return
    const { error } = await supabase.from('pets').delete().eq('id', actionTargetId)
    if (error) {
      console.error(error)
      return
    }
    const wasCurrent = actionTargetId === currentPetId
    pets = pets.filter((p) => p.id !== actionTargetId)
    if (wasCurrent) currentPetId = activePets()[0]?.id || null
    closeModal()
    renderAll()
    if (viewingMemorial) renderMemorialView()
    renderMemorialToggle()
  } else if (currentModalType === 'moveMemorial') {
    if (!actionTargetId) return
    const passed = (document.getElementById('f-passed') as HTMLInputElement).value
    const memory = (document.getElementById('f-memory') as HTMLTextAreaElement).value.trim()
    const { data, error } = await supabase
      .from('pets')
      .update({ status: 'memorial', passed_date: passed || null, memory_note: memory || null })
      .eq('id', actionTargetId)
      .select()
      .single()
    if (error) {
      console.error(error)
      return
    }
    const idx = pets.findIndex((p) => p.id === actionTargetId)
    if (idx !== -1) pets[idx] = data as Pet
    if (actionTargetId === currentPetId) currentPetId = activePets()[0]?.id || null
    closeModal()
    renderAll()
    renderMemorialToggle()
  } else if (currentModalType === 'restorePet') {
    if (!actionTargetId) return
    const { data, error } = await supabase
      .from('pets')
      .update({ status: 'active', passed_date: null, memory_note: null })
      .eq('id', actionTargetId)
      .select()
      .single()
    if (error) {
      console.error(error)
      return
    }
    const idx = pets.findIndex((p) => p.id === actionTargetId)
    if (idx !== -1) pets[idx] = data as Pet
    currentPetId = actionTargetId
    closeModal()
    renderAll()
    renderMemorialView()
    renderMemorialToggle()
  }
}

function wireStaticControls() {
  document.querySelectorAll<HTMLButtonElement>('.tab').forEach((tab) => {
    tab.addEventListener('click', () => setActiveTab(tab.dataset.tab!))
  })
  $('modalClose').addEventListener('click', closeModal)
  $('modalOverlay').addEventListener('click', (e) => {
    if (e.target === $('modalOverlay')) closeModal()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal()
  })
  $('editPetBtn').addEventListener('click', () => {
    if (!currentPetId) return
    actionTargetId = currentPetId
    openModal('editPet')
  })
  $('deletePetBtn').addEventListener('click', () => {
    if (!currentPetId) return
    actionTargetId = currentPetId
    openModal('confirmDelete')
  })
  $('memorializeBtn').addEventListener('click', () => {
    if (!currentPetId) return
    actionTargetId = currentPetId
    openModal('moveMemorial')
  })
  $('memorialToggle').addEventListener('click', () => showMemorialView(!viewingMemorial))
}

let wired = false

export async function onSignedIn() {
  if (!wired) {
    wireStaticControls()
    wired = true
  }
  viewingMemorial = false
  await loadPets()
  renderAll()
  renderMemorialToggle()
  $('appMain').style.display = ''
  $('memorialView').style.display = 'none'
}

export function onSignedOut() {
  pets = []
  currentPetId = null
  lastNotifiedPetId = undefined
  viewingMemorial = false
  notifyDailySignedOut()
  notifyLogSignedOut()
  notifyShoppingSignedOut()
}
