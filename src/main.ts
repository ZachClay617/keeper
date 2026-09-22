import './style.css'
import { initAuth } from './auth'
import { showSettings } from './settings'
import { showBudget } from './budget'
import { setActiveTab } from './pets'
import { showOnly } from './views'
import { startClock } from './clock'

initAuth()
startClock()

document.getElementById('settingsBtn')?.addEventListener('click', () => {
  document.getElementById('accountPanel')?.classList.remove('open')
  showSettings()
})

document.getElementById('budgetBtn')?.addEventListener('click', () => {
  document.getElementById('accountPanel')?.classList.remove('open')
  showBudget()
})

document.getElementById('homeBtn')?.addEventListener('click', () => {
  showOnly('appMain')
  setActiveTab('profile')
})
