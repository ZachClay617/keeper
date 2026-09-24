import { supabase } from './supabaseClient'
import { formatAge } from './petAge'

interface ExportPet {
  id: string
  name: string
  type: string
  species: string | null
  breed_or_morph: string | null
  age: string | null
  birthday: string | null
  weight: string | null
  enclosure_size: string | null
  since_date: string | null
  personality: string | null
  care_notes: string | null
  status: string
}

interface ExportLogEntry {
  pet_id: string
  date: string
  time: string | null
  title: string
  category: string
}

interface ExportDailyItem {
  pet_id: string
  label: string
  time: string | null
  category: string
  detail: string | null
  recurring: boolean
  date: string | null
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function line(label: string, value: string | null | undefined): string {
  return value ? `${label}: ${value}\n` : ''
}

/** Builds and downloads a plain-text export of the account's pet profiles, care log history, and daily care items. */
export async function downloadPetData() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const [petsRes, logRes, dailyRes] = await Promise.all([
    supabase.from('pets').select('*').order('created_at', { ascending: true }),
    supabase.from('care_log_entries').select('pet_id, date, time, title, category').order('date', { ascending: false }),
    supabase.from('daily_care_items').select('pet_id, label, time, category, detail, recurring, date').order('created_at', { ascending: true }),
  ])

  const pets = (petsRes.data as ExportPet[]) || []
  const logEntries = (logRes.data as ExportLogEntry[]) || []
  const dailyItems = (dailyRes.data as ExportDailyItem[]) || []

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  let out = `Keeper Data Export — ${today}\n`
  out += `${pets.length} pet${pets.length === 1 ? '' : 's'}\n`

  pets.forEach((pet) => {
    out += `\n${'='.repeat(50)}\n${pet.name}${pet.status === 'memorial' ? ' (In Loving Memory)' : ''}\n${'='.repeat(50)}\n`
    out += line('Type', pet.type)
    out += line('Species/breed', pet.species || pet.breed_or_morph)
    out += line('Age', pet.birthday ? formatAge(pet.birthday) : pet.age)
    out += line('Birthday', pet.birthday ? formatDate(pet.birthday) : null)
    out += line('Weight', pet.weight)
    out += line('Enclosure/tank size', pet.enclosure_size)
    out += line('With you since', pet.since_date ? formatDate(pet.since_date) : null)
    out += line('Personality', pet.personality)
    out += line('Care notes', pet.care_notes)

    const petDaily = dailyItems.filter((d) => d.pet_id === pet.id)
    out += `\n-- Daily Care --\n`
    if (!petDaily.length) {
      out += 'No daily care items.\n'
    } else {
      petDaily.forEach((d) => {
        const when = d.recurring ? 'Every day' : `Just ${formatDate(d.date)}`
        out += `[${when}] ${d.label}${d.time ? ` — ${d.time}` : ''} (${d.category})${d.detail ? ` — ${d.detail}` : ''}\n`
      })
    }

    const petLog = logEntries.filter((e) => e.pet_id === pet.id)
    out += `\n-- Care Log History --\n`
    if (!petLog.length) {
      out += 'No care log entries.\n'
    } else {
      petLog.forEach((e) => {
        out += `${formatDate(e.date)}${e.time ? ` at ${e.time}` : ''} — ${e.title} [${e.category}]\n`
      })
    }
  })

  const blob = new Blob([out], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `keeper-export-${new Date().toISOString().slice(0, 10)}.txt`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
