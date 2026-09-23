// One-time seed script: creates 5 test accounts in Supabase with a realistic
// month of historical data. Uses the service role key to bypass RLS.
//
// Usage: node scripts/seed-test-accounts.mjs
//
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (never committed — see .gitignore).

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local')
  const text = fs.readFileSync(envPath, 'utf8')
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
  }
}
loadEnvLocal()

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const SHARED_PASSWORD = 'TestPass123!'

// ── date helpers ────────────────────────────────────────────────────────
const DAY_MS = 86400000
const NOW = new Date()

function dateNDaysAgo(n) {
  const d = new Date(NOW.getTime() - n * DAY_MS)
  return d.toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
}
function monthOf(dateStr) {
  return dateStr.slice(0, 7)
}

/**
 * Picks which of the past 30 days (0 = today, 29 = 29 days ago) an item was
 * completed on, given a target completion rate. Injects one "bad stretch"
 * (a few consecutive low-completion days) so it doesn't look like a clean
 * random distribution.
 */
function pickCompletionOffsets(rate, days = 30) {
  const badStart = 4 + Math.floor(Math.random() * (days - 10))
  const badLen = 2 + Math.floor(Math.random() * 3)
  const offsets = []
  for (let i = 0; i < days; i++) {
    const inBadStretch = i >= badStart && i < badStart + badLen
    const effRate = inBadStretch ? rate * 0.15 : rate
    if (Math.random() < effRate) offsets.push(i)
  }
  return offsets
}

// ── generic insert helpers ──────────────────────────────────────────────
async function createTestUser(email, name) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: SHARED_PASSWORD,
    email_confirm: true,
    user_metadata: { name },
  })
  if (error) throw new Error(`createUser(${email}): ${error.message}`)
  return data.user.id
}

async function insertPet(ownerId, pet) {
  const { data, error } = await admin
    .from('pets')
    .insert({ owner_id: ownerId, ...pet })
    .select('id')
    .single()
  if (error) throw new Error(`insertPet(${pet.name}): ${error.message}`)
  return data.id
}

async function insertDailyItem(petId, item) {
  const { data, error } = await admin
    .from('daily_care_items')
    .insert({ pet_id: petId, label: item.label, time: item.time || null, category: item.category, detail: item.detail || null })
    .select('id')
    .single()
  if (error) throw new Error(`insertDailyItem(${item.label}): ${error.message}`)
  return data.id
}

async function insertCompletions(petId, dailyItemId, offsets) {
  if (!offsets.length) return
  const rows = offsets.map((n) => ({ daily_item_id: dailyItemId, pet_id: petId, date: dateNDaysAgo(n) }))
  const { error } = await admin.from('daily_completions').insert(rows)
  if (error) throw new Error(`insertCompletions: ${error.message}`)
}

async function insertCareLog(petId, entry) {
  const { error } = await admin
    .from('care_log_entries')
    .insert({ pet_id: petId, date: dateNDaysAgo(entry.daysAgo), title: entry.title, category: entry.category })
  if (error) throw new Error(`insertCareLog(${entry.title}): ${error.message}`)
}

async function insertShoppingItem(ownerId, petId, item) {
  const gotMonth = item.got ? monthOf(dateNDaysAgo(item.gotDaysAgo ?? 5)) : null
  const { error } = await admin.from('shopping_items').insert({
    owner_id: ownerId,
    pet_id: petId,
    item: item.item,
    qty: item.qty || null,
    category: item.category,
    due_date: item.dueDaysFromToday !== undefined ? dateNDaysAgo(-item.dueDaysFromToday) : null,
    est_price: item.price ?? null,
    got: !!item.got,
    got_month: gotMonth,
  })
  if (error) throw new Error(`insertShoppingItem(${item.item}): ${error.message}`)
}

async function setPetBudget(petId, amount) {
  const { error } = await admin.from('pets').update({ monthly_budget: amount }).eq('id', petId)
  if (error) throw new Error(`setPetBudget: ${error.message}`)
}

async function setMiscBudget(ownerId, amount) {
  const { error } = await admin.from('profiles').update({ misc_monthly_budget: amount }).eq('id', ownerId)
  if (error) throw new Error(`setMiscBudget: ${error.message}`)
}

// ── per-pet daily-care builder ──────────────────────────────────────────
async function buildPetDailyItems(petId, items) {
  for (const item of items) {
    const dailyItemId = await insertDailyItem(petId, item)
    const offsets = item.sparseOffsets ?? pickCompletionOffsets(item.rate ?? 0.85)
    await insertCompletions(petId, dailyItemId, offsets)
  }
}

// ══════════════════════════════════════════════════════════════════════
// Account definitions
// ══════════════════════════════════════════════════════════════════════

async function seedMaya() {
  const ownerId = await createTestUser('maya@keeper-test.com', 'Maya Chen')
  const bodhiId = await insertPet(ownerId, {
    name: 'Bodhi', type: 'dog', breed_or_morph: 'Australian Shepherd mix', age: '2 years',
    weight: '45 lbs', personality: 'High-energy and food-motivated — always ready for the next walk or meal.',
    care_notes: 'Loves the dog park. Watch the counter-surfing.',
  })
  await setPetBudget(bodhiId, 60)

  await buildPetDailyItems(bodhiId, [
    { label: 'Morning walk', time: '7:00 AM', category: 'Exercise', rate: 0.87 },
    { label: 'Morning feeding', time: '7:30 AM', category: 'Feeding', rate: 0.9 },
    { label: 'Evening walk', time: '6:00 PM', category: 'Exercise', rate: 0.85 },
    { label: 'Evening feeding', time: '6:30 PM', category: 'Feeding', rate: 0.9 },
  ])

  await insertCareLog(bodhiId, { daysAgo: 16, title: 'Limping on left front leg — vet checked, no injury found, resolved within a few days', category: 'Vet' })

  await insertShoppingItem(ownerId, bodhiId, { item: 'Dog food (30lb bag)', category: 'Food', price: 42, got: true, gotDaysAgo: 12 })
  await insertShoppingItem(ownerId, bodhiId, { item: 'Poop bags (refill roll)', category: 'Other', price: 9, got: true, gotDaysAgo: 6 })
  await insertShoppingItem(ownerId, bodhiId, { item: 'Training treats', category: 'Food', price: 7, got: false, dueDaysFromToday: 4 })

  console.log('  ✓ Maya / Bodhi seeded')
}

async function seedAlvarezKim() {
  const ownerId = await createTestUser('alvarezkim@keeper-test.com', 'Alvarez-Kim Household')

  const nutmegId = await insertPet(ownerId, {
    name: 'Nutmeg', type: 'cat', age: '8 years', personality: 'Mellow, affectionate, prefers quiet mornings.',
    care_notes: 'Chronic kidney condition — twice-daily medication, monitor water intake.',
  })
  const biscuitId = await insertPet(ownerId, {
    name: 'Biscuit', type: 'cat', age: '3 years', personality: 'Playful, a little food-obsessed.',
  })
  const cloverId = await insertPet(ownerId, {
    name: 'Clover', type: 'small_animal', species: 'Rabbit', age: '7 years',
    personality: 'Senior and set in her ways, likes routine.',
  })
  await setPetBudget(nutmegId, 40)
  await setPetBudget(biscuitId, 20)
  await setPetBudget(cloverId, 15)

  await buildPetDailyItems(nutmegId, [
    { label: 'Morning medication', time: '8:00 AM', category: 'Medication', detail: '1/2 tablet, with food', rate: 0.82 },
    { label: 'Evening medication', time: '8:00 PM', category: 'Medication', detail: '1/2 tablet, with food', rate: 0.78 },
    { label: 'Feeding', time: '7:30 AM', category: 'Feeding', rate: 0.92 },
    { label: 'Litter box', category: 'Hygiene', rate: 0.85 },
  ])
  await buildPetDailyItems(biscuitId, [
    { label: 'Feeding', time: '7:30 AM', category: 'Feeding', rate: 0.9 },
    { label: 'Litter box', category: 'Hygiene', rate: 0.85 },
  ])
  await buildPetDailyItems(cloverId, [
    { label: 'Feeding', time: '7:00 AM', category: 'Feeding', rate: 0.88 },
    { label: 'Hay refresh', category: 'Feeding', rate: 0.8 },
    { label: 'Cage care', category: 'Environment', rate: 0.55 },
  ])

  await insertCareLog(nutmegId, { daysAgo: 13, title: 'Checkup — kidney values stable, staying the course on current medication', category: 'Checkup' })

  await insertShoppingItem(ownerId, null, { item: 'Cat litter (clumping, 2-pack)', category: 'Litter & Bedding', price: 24, got: true, gotDaysAgo: 9 })
  await insertShoppingItem(ownerId, cloverId, { item: 'Timothy hay (large bag)', category: 'Food', price: 18, got: true, gotDaysAgo: 7 })
  await insertShoppingItem(ownerId, nutmegId, { item: 'Medication refill', category: 'Medical', price: 32, got: false, dueDaysFromToday: 3 })

  console.log('  ✓ Alvarez-Kim / Nutmeg, Biscuit, Clover seeded')
}

async function seedDevon() {
  const ownerId = await createTestUser('devon@keeper-test.com', 'Devon Okafor')

  const emberId = await insertPet(ownerId, {
    name: 'Ember', type: 'reptile', species: 'Bearded dragon', age: '3 years', enclosure_size: '40 gal',
    personality: 'Curious, good basking posture, tolerates handling well.',
  })
  const freckleId = await insertPet(ownerId, {
    name: 'Freckle', type: 'reptile', species: 'Leopard gecko', age: '2 years', enclosure_size: '20 gal',
  })
  const mothId = await insertPet(ownerId, {
    name: 'Moth', type: 'reptile', species: 'Leopard gecko', age: '4 years', enclosure_size: '20 gal',
  })
  const juniperId = await insertPet(ownerId, {
    name: 'Juniper', type: 'reptile', species: 'Ball python', age: '5 years', enclosure_size: '4x2 ft',
    care_notes: 'Feeds on an adult rat every 10-14 days. Skittish during shed.',
  })
  await setPetBudget(emberId, 30)
  await setPetBudget(freckleId, 20)
  await setPetBudget(mothId, 20)
  await setPetBudget(juniperId, 25)

  await buildPetDailyItems(emberId, [
    { label: 'Basking temp check', category: 'Health', rate: 0.85 },
    { label: 'Misting / humidity check', category: 'Environment', rate: 0.8 },
    { label: 'Feeding — crickets & greens', category: 'Feeding', rate: 0.7 },
  ])
  await buildPetDailyItems(freckleId, [
    { label: 'Feeding — mealworms', category: 'Feeding', rate: 0.5 },
    { label: 'Habitat check', category: 'Environment', rate: 0.78 },
  ])
  await buildPetDailyItems(mothId, [
    { label: 'Feeding — mealworms', category: 'Feeding', rate: 0.48 },
    { label: 'Habitat check', category: 'Environment', rate: 0.75 },
  ])
  // Juniper: don't force a daily feeding habit — pythons feed every 10-14 days.
  await buildPetDailyItems(juniperId, [
    { label: 'Enclosure check', category: 'Environment', rate: 0.65 },
    { label: 'Feeding — rat', category: 'Feeding', sparseOffsets: [2, 13, 25] },
  ])

  await insertCareLog(emberId, { daysAgo: 20, title: 'Normal shed cycle, went smoothly over about 5 days', category: 'Maintenance' })
  await insertCareLog(emberId, { daysAgo: 9, title: 'Vet visit — retained shed on toes, soaked and removed manually', category: 'Vet' })

  await insertShoppingItem(ownerId, null, { item: 'Crickets (dozen, live)', category: 'Food', price: 8, got: true, gotDaysAgo: 4 })
  await insertShoppingItem(ownerId, emberId, { item: 'UVB bulb (T5 HO)', category: 'Tank/Enclosure', price: 35, got: true, gotDaysAgo: 18 })
  await insertShoppingItem(ownerId, freckleId, { item: 'Calcium powder w/ D3', category: 'Other', price: 10, got: true, gotDaysAgo: 11 })
  await insertShoppingItem(ownerId, juniperId, { item: 'Aspen substrate (bag)', category: 'Tank/Enclosure', price: 16, got: false, dueDaysFromToday: 6 })

  console.log('  ✓ Devon / Ember, Freckle, Moth, Juniper seeded')
}

async function seedPriya() {
  const ownerId = await createTestUser('priya@keeper-test.com', 'Priya Patel')

  const maxId = await insertPet(ownerId, {
    name: 'Max', type: 'dog', breed_or_morph: 'Mixed breed', age: '5 years', weight: '38 lbs',
  })
  const pepperId = await insertPet(ownerId, {
    name: 'Pepper', type: 'small_animal', species: 'Guinea pig', age: '2 years',
  })
  const wafflesId = await insertPet(ownerId, {
    name: 'Waffles', type: 'small_animal', species: 'Guinea pig', age: '2 years',
  })
  await setPetBudget(maxId, 50)
  await setPetBudget(pepperId, 20)
  await setPetBudget(wafflesId, 15)

  await buildPetDailyItems(maxId, [
    { label: 'Walk', time: '7:30 AM', category: 'Exercise', rate: 0.83 },
    { label: 'Feeding', category: 'Feeding', rate: 0.9 },
  ])
  await buildPetDailyItems(pepperId, [
    { label: 'Feeding', category: 'Feeding', rate: 0.88 },
    { label: 'Hay refresh', category: 'Feeding', rate: 0.82 },
    { label: 'Cage cleaning', category: 'Hygiene', rate: 0.32 },
  ])
  await buildPetDailyItems(wafflesId, [
    { label: 'Feeding', category: 'Feeding', rate: 0.88 },
    { label: 'Hay refresh', category: 'Feeding', rate: 0.82 },
    { label: 'Cage cleaning', category: 'Hygiene', rate: 0.32 },
  ])

  await insertCareLog(maxId, { daysAgo: 17, title: 'Routine annual checkup — all good, weight steady', category: 'Checkup' })

  // Max: dog food + an unexpected vet cost this month, pushing well over his $50 budget.
  await insertShoppingItem(ownerId, maxId, { item: 'Dog food (bag)', category: 'Food', price: 30, got: true, gotDaysAgo: 14 })
  await insertShoppingItem(ownerId, maxId, { item: 'Emergency vet visit — ear infection', category: 'Medical', price: 85, got: true, gotDaysAgo: 5 })

  // Guinea pigs: hay + bedding attributed to Pepper (data model limitation — shared
  // supplies can only be tied to one pet or General), pushing Pepper over budget.
  await insertShoppingItem(ownerId, pepperId, { item: 'Guinea pig hay (bag)', category: 'Food', price: 14, got: true, gotDaysAgo: 8 })
  await insertShoppingItem(ownerId, pepperId, { item: 'Guinea pig bedding (for both cages)', category: 'Litter & Bedding', price: 16, got: true, gotDaysAgo: 8 })
  await insertShoppingItem(ownerId, wafflesId, { item: 'Guinea pig vitamin C drops', category: 'Medical', price: 9, got: true, gotDaysAgo: 3 })

  console.log('  ✓ Priya / Max, Pepper, Waffles seeded (Max and Pepper over budget)')
}

async function seedJordan() {
  const ownerId = await createTestUser('jordan@keeper-test.com', 'Jordan Weiss')

  const roscoId = await insertPet(ownerId, { name: 'Rosco', type: 'dog', age: '4 years' })
  const tabithaId = await insertPet(ownerId, { name: 'Tabitha', type: 'cat', age: '6 years' })
  const ashId = await insertPet(ownerId, { name: 'Ash', type: 'cat', age: '1 year' })
  const clementineId = await insertPet(ownerId, { name: 'Clementine', type: 'small_animal', species: 'Rabbit', age: '3 years' })
  const kiwiId = await insertPet(ownerId, { name: 'Kiwi', type: 'bird', species: 'Cockatiel', age: '2 years' })
  const marbleId = await insertPet(ownerId, { name: 'Marble', type: 'fish', species: 'Betta', age: '1 year', enclosure_size: '5 gal' })

  await setPetBudget(roscoId, 55)
  await setPetBudget(tabithaId, 25)
  await setPetBudget(ashId, 30)
  await setPetBudget(clementineId, 20)
  await setPetBudget(kiwiId, 20)
  await setPetBudget(marbleId, 10)
  await setMiscBudget(ownerId, 25)

  await buildPetDailyItems(roscoId, [
    { label: 'Morning walk', time: '6:45 AM', category: 'Exercise', rate: 0.85 },
    { label: 'Evening walk', time: '5:30 PM', category: 'Exercise', rate: 0.82 },
    { label: 'Feeding', category: 'Feeding', rate: 0.92 },
  ])
  await buildPetDailyItems(tabithaId, [
    { label: 'Feeding', category: 'Feeding', rate: 0.9 },
    { label: 'Litter box', category: 'Hygiene', rate: 0.85 },
  ])
  await buildPetDailyItems(ashId, [
    { label: 'Feeding', category: 'Feeding', rate: 0.9 },
    { label: 'Litter box', category: 'Hygiene', rate: 0.85 },
    { label: 'Playtime', category: 'Exercise', rate: 0.65 },
  ])
  await buildPetDailyItems(clementineId, [
    { label: 'Feeding', category: 'Feeding', rate: 0.87 },
    { label: 'Hay refresh', category: 'Feeding', rate: 0.8 },
    { label: 'Cage care', category: 'Environment', rate: 0.5 },
  ])
  await buildPetDailyItems(kiwiId, [
    { label: 'Feeding & water change', category: 'Feeding', rate: 0.88 },
    { label: 'Cage cleaning', category: 'Hygiene', rate: 0.45 },
    { label: 'Out-of-cage time', category: 'Exercise', rate: 0.6 },
  ])
  await buildPetDailyItems(marbleId, [
    { label: 'Feeding', category: 'Feeding', rate: 0.9 },
    { label: 'Tank check', category: 'Environment', rate: 0.55 },
  ])

  await insertCareLog(roscoId, { daysAgo: 24, title: 'Annual vet visit — vaccines up to date', category: 'Vaccine' })
  await insertCareLog(tabithaId, { daysAgo: 19, title: 'Nail trim and brushing', category: 'Grooming' })
  await insertCareLog(kiwiId, { daysAgo: 15, title: 'Wellness checkup — wings and beak look good', category: 'Checkup' })
  await insertCareLog(clementineId, { daysAgo: 11, title: 'Nail trim, checked teeth alignment', category: 'Maintenance' })
  await insertCareLog(ashId, { daysAgo: 6, title: 'First-year vet visit — healthy, gaining weight normally', category: 'Checkup' })
  await insertCareLog(marbleId, { daysAgo: 3, title: 'Full water change and filter media rinse', category: 'Maintenance' })

  await insertShoppingItem(ownerId, roscoId, { item: 'Dog food (large bag)', category: 'Food', price: 48, got: true, gotDaysAgo: 10 })
  await insertShoppingItem(ownerId, roscoId, { item: 'Flea & tick prevention', category: 'Medical', price: 22, got: true, gotDaysAgo: 2 })
  await insertShoppingItem(ownerId, tabithaId, { item: 'Cat litter', category: 'Litter & Bedding', price: 15, got: true, gotDaysAgo: 6 })
  await insertShoppingItem(ownerId, ashId, { item: 'Feather wand toy', category: 'Toys', price: 8, got: true, gotDaysAgo: 9 })
  await insertShoppingItem(ownerId, ashId, { item: 'Scratching post', category: 'Toys', price: 26, got: false, dueDaysFromToday: 5 })
  await insertShoppingItem(ownerId, clementineId, { item: 'Rabbit-safe bedding', category: 'Litter & Bedding', price: 17, got: true, gotDaysAgo: 13 })
  await insertShoppingItem(ownerId, kiwiId, { item: 'Bird seed mix', category: 'Food', price: 13, got: true, gotDaysAgo: 8 })
  await insertShoppingItem(ownerId, kiwiId, { item: 'Cage liner paper', category: 'Tank/Enclosure', price: 9, got: false, dueDaysFromToday: -3 })
  await insertShoppingItem(ownerId, marbleId, { item: 'Betta pellets', category: 'Food', price: 6, got: true, gotDaysAgo: 4 })
  await insertShoppingItem(ownerId, marbleId, { item: 'Filter cartridge', category: 'Tank/Enclosure', price: 11, got: false, dueDaysFromToday: -6 })
  await insertShoppingItem(ownerId, null, { item: 'Pet first-aid kit refill', category: 'Medical', price: 14, got: false, dueDaysFromToday: 10 })
  await insertShoppingItem(ownerId, roscoId, { item: 'Dog shampoo', category: 'Grooming', price: 10, got: false, dueDaysFromToday: -1 })

  console.log('  ✓ Jordan / Rosco, Tabitha, Ash, Clementine, Kiwi, Marble seeded')
}

// ══════════════════════════════════════════════════════════════════════
// Verification
// ══════════════════════════════════════════════════════════════════════

async function verify(email) {
  const { data: userList, error: listErr } = await admin.auth.admin.listUsers()
  if (listErr) throw listErr
  const user = userList.users.find((u) => u.email === email)
  if (!user) {
    console.log(`  ✗ ${email}: NOT FOUND`)
    return
  }
  const ownerId = user.id
  const [pets, dailyItems, completions, careLog, shopping] = await Promise.all([
    admin.from('pets').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId),
    admin.from('daily_care_items').select('id, pets!inner(owner_id)', { count: 'exact', head: true }).eq('pets.owner_id', ownerId),
    admin.from('daily_completions').select('id, pets!inner(owner_id)', { count: 'exact', head: true }).eq('pets.owner_id', ownerId),
    admin.from('care_log_entries').select('id, pets!inner(owner_id)', { count: 'exact', head: true }).eq('pets.owner_id', ownerId),
    admin.from('shopping_items').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId),
  ])
  console.log(
    `  ✓ ${email} — pets: ${pets.count}, daily items: ${dailyItems.count}, completions: ${completions.count}, care log: ${careLog.count}, shopping: ${shopping.count}`
  )
}

// ══════════════════════════════════════════════════════════════════════

async function main() {
  console.log('Seeding test accounts…\n')
  await seedMaya()
  await seedAlvarezKim()
  await seedDevon()
  await seedPriya()
  await seedJordan()

  console.log('\nVerifying against the database…\n')
  for (const email of ['maya@keeper-test.com', 'alvarezkim@keeper-test.com', 'devon@keeper-test.com', 'priya@keeper-test.com', 'jordan@keeper-test.com']) {
    await verify(email)
  }

  console.log('\nDone. Shared password for all 5 accounts:', SHARED_PASSWORD)
}

main().catch((err) => {
  console.error('\nSeed script failed:', err.message)
  process.exit(1)
})
