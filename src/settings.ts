import { supabase } from './supabaseClient'
import { timezoneOptions, setAccountTimezone, getAccountTimezone } from './timezone'
import { paletteOptions, applyPalette } from './palette'
import { refreshCurrentPet } from './pets'
import { renderRemindersManager } from './reminders'
import { showOnly } from './views'
import { $, esc } from './dom'

let wired = false
let currentPalette = 'sage'

function populateTimezoneSelect() {
  const select = $('set-timezone') as HTMLSelectElement
  select.innerHTML = timezoneOptions.map((tz) => `<option value="${tz.value}">${esc(tz.label)}</option>`).join('')
  select.value = getAccountTimezone()
}

function renderPaletteOptions() {
  const wrap = $('paletteOptions')
  wrap.innerHTML = paletteOptions
    .map(
      (p) => `
      <button type="button" class="palette-swatch${p.value === currentPalette ? ' active' : ''}" data-palette="${p.value}">
        <span class="palette-dots">${p.swatches.map((c) => `<span class="palette-dot" style="background:${c};"></span>`).join('')}</span>
        <span class="label">${esc(p.label)}</span>
      </button>
    `
    )
    .join('')
  wrap.querySelectorAll<HTMLButtonElement>('.palette-swatch').forEach((btn) => {
    btn.addEventListener('click', () => savePalette(btn.dataset.palette!))
  })
}

async function savePalette(value: string) {
  if (value === currentPalette) return
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('profiles').update({ color_palette: value }).eq('id', user.id)
  if (error) {
    console.error(error)
    return
  }
  currentPalette = value
  applyPalette(value)
  renderPaletteOptions()
}

async function renderSettings() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { data: profile } = await supabase.from('profiles').select('name, timezone, color_palette').eq('id', user.id).single()

  ;($('set-name') as HTMLInputElement).value = profile?.name || ''
  ;($('set-email') as HTMLInputElement).value = user.email || ''
  ;($('set-password') as HTMLInputElement).value = ''
  ;($('set-password2') as HTMLInputElement).value = ''
  $('passwordNote').textContent = ''
  populateTimezoneSelect()
  currentPalette = profile?.color_palette || 'sage'
  renderPaletteOptions()
  clearNote('profileNote')
  await renderRemindersManager()
}

function clearNote(id: string) {
  const el = document.getElementById(id)
  if (el) el.textContent = ''
}

function setNote(id: string, text: string, isError: boolean) {
  const el = $(id)
  el.textContent = text
  el.style.color = isError ? 'var(--clay)' : 'var(--moss-deep)'
}

async function saveProfile() {
  const nameInput = $('set-name') as HTMLInputElement
  const emailInput = $('set-email') as HTMLInputElement
  const name = nameInput.value.trim()
  const email = emailInput.value.trim()
  if (!name) {
    nameInput.focus()
    return
  }
  if (!email) {
    emailInput.focus()
    return
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { error: nameError } = await supabase.from('profiles').update({ name }).eq('id', user.id)
  if (nameError) {
    setNote('profileNote', nameError.message, true)
    return
  }

  if (email !== user.email) {
    const { error: emailError } = await supabase.auth.updateUser({ email })
    if (emailError) {
      setNote('profileNote', emailError.message, true)
      return
    }
    setNote('profileNote', 'Profile saved. Check your new email to confirm the change.', false)
  } else {
    setNote('profileNote', 'Profile saved.', false)
  }

  const accountInfo = document.getElementById('accountInfo')
  if (accountInfo) {
    accountInfo.innerHTML = `<strong>${esc(name)}</strong>${esc(user.email || '')}`
  }
  const accountBtn = document.getElementById('accountBtn')
  if (accountBtn) {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    accountBtn.textContent = parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
  }
}

async function savePassword() {
  const p1 = ($('set-password') as HTMLInputElement).value
  const p2 = ($('set-password2') as HTMLInputElement).value
  if (!p1 || !p2) {
    setNote('passwordNote', 'Enter and confirm a new password.', true)
    return
  }
  if (p1.length < 6) {
    setNote('passwordNote', 'Password must be at least 6 characters.', true)
    return
  }
  if (p1 !== p2) {
    setNote('passwordNote', 'Passwords don’t match.', true)
    return
  }
  const { error } = await supabase.auth.updateUser({ password: p1 })
  if (error) {
    setNote('passwordNote', error.message, true)
    return
  }
  setNote('passwordNote', 'Password updated.', false)
  ;($('set-password') as HTMLInputElement).value = ''
  ;($('set-password2') as HTMLInputElement).value = ''
}

async function saveTimezone() {
  const select = $('set-timezone') as HTMLSelectElement
  const tz = select.value
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('profiles').update({ timezone: tz }).eq('id', user.id)
  if (error) {
    console.error(error)
    return
  }
  setAccountTimezone(tz)
  refreshCurrentPet()
}

function wireStaticControls() {
  $('saveProfileBtn').addEventListener('click', saveProfile)
  $('savePasswordBtn').addEventListener('click', savePassword)
  $('set-timezone').addEventListener('change', saveTimezone)
  $('settingsBackBtn').addEventListener('click', hideSettings)
}

export function showSettings() {
  if (!wired) {
    wireStaticControls()
    wired = true
  }
  showOnly('settingsView')
  renderSettings()
}

export function hideSettings() {
  showOnly('appMain')
}

export function isSettingsOpen(): boolean {
  return $('settingsView').style.display !== 'none'
}
