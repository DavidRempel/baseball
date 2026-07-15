export function registerFieldStarServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    let controlled = Boolean(navigator.serviceWorker.controller)
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      void registration.update()
    }).catch(() => undefined)

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (controlled) {
        window.dispatchEvent(new Event('fieldstar:update-ready'))
      } else {
        controlled = true
      }
    })
  })
}
