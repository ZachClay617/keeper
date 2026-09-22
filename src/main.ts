import './style.css'
import { initAuth } from './auth'
import { showSettings, hideSettings } from './settings'

initAuth()

document.getElementById('settingsBtn')?.addEventListener('click', () => {
  document.getElementById('accountPanel')?.classList.remove('open')
  showSettings()
})

document.getElementById('homeBtn')?.addEventListener('click', () => {
  hideSettings()
  const memorialView = document.getElementById('memorialView')
  const appMain = document.getElementById('appMain')
  if (memorialView) memorialView.style.display = 'none'
  if (appMain) appMain.style.display = ''
})
