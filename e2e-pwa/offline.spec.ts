import { expect, test } from '@playwright/test'

test('the app shell reopens offline after one online visit', async ({ context, page }) => {
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
      })
    }
  })

  const shellCache = await page.evaluate(async () => {
    const keys = await caches.keys()
    const entries = await Promise.all(keys.map(async (key) => {
      const requests = await (await caches.open(key)).keys()
      return { key, urls: requests.map((request) => new URL(request.url).pathname) }
    }))
    return {
      controller: navigator.serviceWorker.controller?.scriptURL,
      entries,
    }
  })
  expect(shellCache.controller).toContain('/sw.js')
  expect(shellCache.entries.some(({ urls }) => urls.includes('/') && urls.some((url) => url.startsWith('/assets/index-')))).toBe(true)

  await page.goto('/t/offline-team/Offline-Team', { waitUntil: 'domcontentloaded' })
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByText('fieldstar', { exact: true }).first()).toBeVisible()
  await expect(page).toHaveURL(/\/t\/offline-team\/Offline-Team$/)
  await context.setOffline(false)
})
