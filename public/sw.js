const CACHE_PREFIX = 'fieldstar-shell-'
const CACHE_NAME = `${CACHE_PREFIX}v1`
const CORE_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/favicon.svg',
  '/favicon-32.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/fieldstar-mark.png',
  '/fieldstar-logo.png',
]

async function cacheCurrentShell() {
  const cache = await caches.open(CACHE_NAME)
  const indexResponse = await fetch(new Request('/', { cache: 'reload' }))
  if (!indexResponse.ok) throw new Error('Could not fetch the FieldStar shell')

  const html = await indexResponse.clone().text()
  await cache.put('/', indexResponse)
  const buildAssets = Array.from(html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g), (match) => match[1])
  const assets = [...new Set(CORE_ASSETS.slice(1).concat(buildAssets))]
  await Promise.all(assets.map(async (asset) => {
    try {
      const response = await fetch(new Request(asset, { cache: 'reload' }))
      if (response.ok) await cache.put(asset, response)
    } catch {
      // One optional icon should not prevent the app shell from installing.
    }
  }))
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheCurrentShell().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME)
          await cache.put('/', response.clone())
        }
        return response
      } catch {
        return (await caches.match('/')) || Response.error()
      }
    })())
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cached = await caches.match(url.pathname)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME)
        await cache.put(request, response.clone())
      }
      return response
    })())
    return
  }

  event.respondWith((async () => {
    try {
      const response = await fetch(request)
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME)
        await cache.put(request, response.clone())
      }
      return response
    } catch {
      return (await caches.match(url.pathname)) || Response.error()
    }
  })())
})
