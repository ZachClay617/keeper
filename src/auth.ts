import { supabase } from './supabaseClient'
import { onSignedIn, onSignedOut } from './pets'

function $(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Missing #${id}`)
  return el
}

function getInitials(text: string): string {
  const parts = text.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function showError(id: string, message: string) {
  const el = $(id)
  el.textContent = message
  el.classList.add('visible')
}

function clearError(id: string) {
  const el = $(id)
  el.textContent = ''
  el.classList.remove('visible')
}

function setLoading(button: HTMLButtonElement, loadingText: string) {
  button.dataset.originalText = button.textContent ?? ''
  button.textContent = loadingText
  button.disabled = true
}

function clearLoading(button: HTMLButtonElement) {
  button.textContent = button.dataset.originalText ?? button.textContent
  button.disabled = false
}

async function showApp() {
  $('authView').style.display = 'none'
  $('mainApp').style.display = ''
  await onSignedIn()
}

function showAuth() {
  $('mainApp').style.display = 'none'
  $('authView').style.display = 'flex'
  onSignedOut()
}

async function renderAccountInfo() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  let name = ''
  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single()
  if (profile?.name) name = profile.name

  const accountBtn = $('accountBtn')
  const accountInfo = $('accountInfo')
  accountBtn.textContent = getInitials(name || user.email || '?')
  accountInfo.innerHTML = `<strong>${name || 'Your account'}</strong>${user.email ?? ''}`
}

function wirePasswordToggles() {
  document.querySelectorAll<HTMLButtonElement>('.password-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target!) as HTMLInputElement
      const isHidden = target.type === 'password'
      target.type = isHidden ? 'text' : 'password'
      btn.textContent = isHidden ? 'Hide' : 'Show'
    })
  })
}

function wireAuthTabs() {
  document.querySelectorAll<HTMLButtonElement>('.auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach((t) => t.classList.toggle('active', t === tab))
      document.querySelectorAll('.auth-panel').forEach((p) => p.classList.remove('active'))
      $('auth-' + tab.dataset.authtab).classList.add('active')
      clearError('signupError')
      clearError('loginError')
    })
  })
}

function wireSignup() {
  const submit = $('signupSubmit') as HTMLButtonElement
  submit.addEventListener('click', async () => {
    clearError('signupError')
    const name = ($('su-name') as HTMLInputElement).value.trim()
    const email = ($('su-email') as HTMLInputElement).value.trim()
    const password = ($('su-password') as HTMLInputElement).value

    if (!name) return showError('signupError', 'Enter your name.')
    if (!email) return showError('signupError', 'Enter your email.')
    if (password.length < 6) return showError('signupError', 'Password must be at least 6 characters.')

    setLoading(submit, 'Creating account…')
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    clearLoading(submit)

    if (error) return showError('signupError', error.message)

    if (!data.session) {
      // Email confirmation is required before a session is issued.
      $('authNote').textContent = 'Check your email to confirm your account, then log in.'
      document.querySelector<HTMLButtonElement>('[data-authtab="login"]')?.click()
      return
    }

    await renderAccountInfo()
    await showApp()
  })
}

function wireLogin() {
  const submit = $('loginSubmit') as HTMLButtonElement
  submit.addEventListener('click', async () => {
    clearError('loginError')
    const email = ($('li-email') as HTMLInputElement).value.trim()
    const password = ($('li-password') as HTMLInputElement).value

    if (!email) return showError('loginError', 'Enter your email.')
    if (!password) return showError('loginError', 'Enter your password.')

    setLoading(submit, 'Logging in…')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    clearLoading(submit)

    if (error) return showError('loginError', error.message)

    await renderAccountInfo()
    await showApp()
  })
}

function wireLogout() {
  $('logoutBtn').addEventListener('click', async () => {
    $('accountPanel').classList.remove('open')
    await supabase.auth.signOut()
    showAuth()
  })
}

function wireAccountPanel() {
  $('accountBtn').addEventListener('click', (e) => {
    e.stopPropagation()
    $('accountPanel').classList.toggle('open')
  })
  document.addEventListener('click', (e) => {
    const panel = $('accountPanel')
    const btn = $('accountBtn')
    if (!panel.contains(e.target as Node) && e.target !== btn) panel.classList.remove('open')
  })
}

export async function initAuth() {
  wirePasswordToggles()
  wireAuthTabs()
  wireSignup()
  wireLogin()
  wireLogout()
  wireAccountPanel()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session) {
    await renderAccountInfo()
    await showApp()
  } else {
    showAuth()
  }

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session) {
      await renderAccountInfo()
      await showApp()
    } else {
      showAuth()
    }
  })
}
