const CACHE_NAME = 'fitstack-v1'
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
]

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: caching assets')
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Ignore if assets don't exist yet (Vite dev mode)
      })
    })
  )
  self.skipWaiting()
})

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('Service Worker: deleting old cache', name)
            return caches.delete(name)
          })
      )
    })
  )
  self.clients.claim()
})

// Fetch: network-first, fall back to cache
self.addEventListener('fetch', (event) => {
  const { request } = event
  const { url } = request

  // Skip non-GET requests, external URLs, and API calls (let supabase handle those)
  if (request.method !== 'GET' || url.includes('supabase') || url.includes('api.')) {
    return
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const cache = caches.open(CACHE_NAME)
          cache.then((c) => c.put(request, response.clone()))
        }
        return response
      })
      .catch(() => {
        // Offline: return cached version if available
        return caches.match(request).then((response) => {
          if (response) {
            return response
          }
          // If not cached, return offline page for navigations
          if (request.mode === 'navigate') {
            return caches.match('/')
          }
          return new Response('Offline — content unavailable', { status: 503 })
        })
      })
  )
})
