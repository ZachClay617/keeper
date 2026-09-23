const containers = ['appMain', 'memorialView', 'settingsView', 'budgetView', 'careGuidesView', 'photosView'] as const
type Container = (typeof containers)[number]

/** Shows exactly one of the app's top-level view containers, hiding the rest. */
export function showOnly(id: Container) {
  containers.forEach((c) => {
    const el = document.getElementById(c)
    if (el) el.style.display = c === id ? '' : 'none'
  })
}
