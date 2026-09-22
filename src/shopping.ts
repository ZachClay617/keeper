import { supabase } from './supabaseClient'
import { currentMonthKey } from './timezone'

type ShopCategory = 'Food' | 'Litter & Bedding' | 'Medical' | 'Toys' | 'Grooming' | 'Tank/Enclosure' | 'Other'

interface ShoppingItem {
  id: string
  owner_id: string
  pet_id: string | null
  item: string
  qty: string | null
  category: ShopCategory
  due_date: string | null
  est_price: number | null
  got: boolean
  got_month: string | null
  created_at: string
}

interface PetRef {
  id: string
  name: string
  monthly_budget: number | null
}

const categoryColor: Record<ShopCategory, string> = {
  Food: 'honey',
  'Litter & Bedding': 'moss',
  Medical: 'clay',
  Toys: 'honey',
  Grooming: 'moss',
  'Tank/Enclosure': 'moss',
  Other: 'moss',
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

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const dt = new Date(iso + 'T00:00:00')
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

let currentPet: PetRef | null = null
let items: ShoppingItem[] = []
let wired = false

async function fetchItems(petId: string) {
  const { data, error } = await supabase
    .from('shopping_items')
    .select('*')
    .eq('pet_id', petId)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('Failed to load shopping items', error)
    items = []
    return
  }
  items = (data as ShoppingItem[]) || []
}

function renderBudgetField() {
  const wrap = $('shopBudgets')
  if (!currentPet) {
    wrap.innerHTML = ''
    return
  }
  wrap.innerHTML = `
    <label class="shop-budget-item">Monthly budget for ${esc(currentPet.name)}
      <span class="budget-dollar">$</span>
      <input type="number" step="0.01" min="0" class="budget-input" id="petBudgetInput" placeholder="No budget" value="${currentPet.monthly_budget ?? ''}">
    </label>
  `
  $('petBudgetInput').addEventListener('change', async (e) => {
    if (!currentPet) return
    const value = (e.target as HTMLInputElement).value
    const monthly_budget = value ? Number(value) : null
    const { error } = await supabase.from('pets').update({ monthly_budget }).eq('id', currentPet.id)
    if (error) console.error(error)
    else currentPet.monthly_budget = monthly_budget
  })
}

function renderShopping() {
  const heading = $('shoppingHeading')
  const body = $('shoppingBody')
  const count = $('shoppingCount')
  const addRow = document.getElementById('shoppingAddRow')

  if (!currentPet) {
    heading.textContent = 'Shopping List'
    body.innerHTML = '<tr><td colspan="7" class="empty-state">Add a pet to get started.</td></tr>'
    count.textContent = ''
    $('shopBudgets').innerHTML = ''
    if (addRow) addRow.style.display = 'none'
    return
  }

  if (addRow) addRow.style.display = ''
  heading.textContent = `${currentPet.name}’s Shopping List`
  renderBudgetField()

  if (!items.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty-state">Nothing on the list yet.</td></tr>'
  } else {
    body.innerHTML = items
      .map((item) => {
        const color = categoryColor[item.category] || 'moss'
        return `
          <tr class="${item.got ? 'got' : ''}" data-id="${item.id}">
            <td><button class="shop-check" aria-label="Mark as bought"></button></td>
            <td class="shop-item-cell">${esc(item.item)}</td>
            <td>${item.qty ? esc(item.qty) : ''}</td>
            <td><span class="care-chip" style="background: color-mix(in srgb, var(--${color}) 16%, transparent); color: var(--${color});">${item.category}</span></td>
            <td>${esc(formatDate(item.due_date))}</td>
            <td>${item.est_price != null ? '$' + Number(item.est_price).toFixed(2) : '—'}</td>
            <td><button class="delete-btn" aria-label="Remove item">×</button></td>
          </tr>
        `
      })
      .join('')
  }
  const total = items.length
  const got = items.filter((i) => i.got).length
  count.textContent = `${got} of ${total} picked up`
}

async function toggleGot(id: string) {
  const item = items.find((i) => i.id === id)
  if (!item) return
  const got = !item.got
  const got_month = got ? currentMonthKey() : null
  const { error } = await supabase.from('shopping_items').update({ got, got_month }).eq('id', id)
  if (error) {
    console.error(error)
    return
  }
  item.got = got
  item.got_month = got_month
  renderShopping()
}

async function deleteItem(id: string) {
  const { error } = await supabase.from('shopping_items').delete().eq('id', id)
  if (error) {
    console.error(error)
    return
  }
  items = items.filter((i) => i.id !== id)
  renderShopping()
}

async function addItem() {
  if (!currentPet) return
  const itemInput = document.getElementById('shop-item') as HTMLInputElement
  const qtyInput = document.getElementById('shop-qty') as HTMLInputElement
  const catSelect = document.getElementById('shop-cat') as HTMLSelectElement
  const dueInput = document.getElementById('shop-due') as HTMLInputElement
  const priceInput = document.getElementById('shop-price') as HTMLInputElement

  const itemVal = itemInput.value.trim()
  if (!itemVal) {
    itemInput.focus()
    return
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { data, error } = await supabase
    .from('shopping_items')
    .insert({
      owner_id: user.id,
      pet_id: currentPet.id,
      item: itemVal,
      qty: qtyInput.value.trim() || null,
      category: catSelect.value as ShopCategory,
      due_date: dueInput.value || null,
      est_price: priceInput.value ? Number(priceInput.value) : null,
      got: false,
    })
    .select()
    .single()

  if (error) {
    console.error(error)
    return
  }

  items.push(data as ShoppingItem)
  itemInput.value = ''
  qtyInput.value = ''
  dueInput.value = ''
  priceInput.value = ''
  renderShopping()
  itemInput.focus()
}

function wireStaticControls() {
  $('shoppingBody').addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest('tr') as HTMLElement | null
    if (!row || !row.dataset.id) return
    const id = row.dataset.id
    if ((e.target as HTMLElement).closest('.shop-check')) {
      toggleGot(id)
    } else if ((e.target as HTMLElement).closest('.delete-btn')) {
      deleteItem(id)
    }
  })
  $('shopAddBtn').addEventListener('click', addItem)
  ;['shop-item', 'shop-qty'].forEach((id) => {
    document.getElementById(id)?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        e.preventDefault()
        addItem()
      }
    })
  })
}

export async function onPetSelected(pet: PetRef | null) {
  if (!wired) {
    wireStaticControls()
    wired = true
  }
  currentPet = pet
  items = []
  if (pet) {
    await fetchItems(pet.id)
  }
  renderShopping()
}

export function onSignedOut() {
  currentPet = null
  items = []
}
