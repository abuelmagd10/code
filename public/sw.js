// 7ESAB ERP Service Worker - Professional Version
const VERSION = '2.0.0';
const CACHE_NAME = `7esab-erp-v${VERSION}`;
const STATIC_CACHE = `7esab-static-v${VERSION}`;
const DYNAMIC_CACHE = `7esab-dynamic-v${VERSION}`;

// الموارد الأساسية للتخزين المؤقت (بدون manifest.json)
const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/icons/icon.svg',
  '/offline.html'
];

// قائمة الموارد التي لا يجب تخزينها مؤقتاً
const NEVER_CACHE = [
  '/api/',
  '/auth/',
  '/manifest.json',
  '/_next/webpack-hmr',
  '/socket.io'
];

// تثبيت Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS.filter(url => !url.includes('undefined')));
      })
      .catch((err) => console.log('[SW] Cache error:', err))
  );
  self.skipWaiting();
});

// تفعيل Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

/**
 * التحقق من أن الطلب يجب عدم تخزينه مؤقتاً
 */
function shouldNeverCache(url) {
  return NEVER_CACHE.some(pattern => url.pathname.includes(pattern));
}

// استراتيجية Network First مع Fallback للـ Cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ✅ تجاهل الطلبات التي لا يجب تخزينها مؤقتاً
  if (shouldNeverCache(url) || request.method !== 'GET') {
    // إرجاع الطلب مباشرة بدون تدخل
    event.respondWith(fetch(request));
    return;
  }

  // ✅ استراتيجية Network First للموارد الأخرى
  event.respondWith(
    fetch(request)
      .then((response) => {
        // تخزين النسخة الجديدة في الـ Cache فقط للاستجابات الناجحة
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
          }).catch(err => {
            console.warn('[SW] Failed to cache:', err);
          });
        }
        return response;
      })
      .catch(async () => {
        // محاولة جلب من الـ Cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
          console.log('[SW] Serving from cache:', request.url);
          return cachedResponse;
        }
        // صفحة عدم الاتصال للتنقل
        if (request.mode === 'navigate') {
          const offlinePage = await caches.match('/offline.html');
          if (offlinePage) return offlinePage;
        }
        return new Response('Offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' }
        });
      })
  );
});

// معالجة الإشعارات
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const options = {
    body: data.body || 'لديك إشعار جديد',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/dashboard' },
    actions: [
      { action: 'open', title: 'فتح' },
      { action: 'close', title: 'إغلاق' }
    ],
    dir: 'rtl',
    lang: 'ar'
  };
  event.waitUntil(
    self.registration.showNotification(data.title || '7ESAB ERP', options)
  );
});

// معالجة الضغط على الإشعار
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    const url = event.notification.data?.url || '/dashboard';
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(url) && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
    );
  }
});

// تحديث في الخلفية
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    console.log('[SW] Background sync triggered');
  }
});

console.log('[SW] Service Worker loaded');

