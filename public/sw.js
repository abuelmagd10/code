// 7ESAB ERP Service Worker - Production Ready
// Version: 3.0.0 - 2025-12-23
const VERSION = '3.0.0';
const BUILD_DATE = '2025-12-23';
const CACHE_NAME = `7esab-erp-v${VERSION}`;
const STATIC_CACHE = `7esab-static-v${VERSION}`;
const DYNAMIC_CACHE = `7esab-dynamic-v${VERSION}`;

console.log(`[SW v${VERSION}] Service Worker initializing... (Build: ${BUILD_DATE})`);

// الموارد الأساسية للتخزين المؤقت (بدون manifest.json و API)
const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/icons/icon.svg',
  '/offline.html'
];

// ✅ قائمة الموارد التي لا يجب تخزينها مؤقتاً أبداً
const NEVER_CACHE = [
  '/api/',           // جميع API endpoints
  '/auth/',          // جميع صفحات المصادقة
  '/manifest.json',  // Manifest الثابت
  '/api/manifest',   // Manifest API endpoint
  '/_next/webpack-hmr', // Hot Module Replacement
  '/socket.io',      // WebSocket connections
  '/_next/static/webpack/', // Webpack HMR
];

// ✅ تثبيت Service Worker
self.addEventListener('install', (event) => {
  console.log(`[SW v${VERSION}] Installing...`);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log(`[SW v${VERSION}] Caching ${STATIC_ASSETS.length} static assets`);
        return cache.addAll(STATIC_ASSETS.filter(url => !url.includes('undefined')));
      })
      .then(() => {
        console.log(`[SW v${VERSION}] Installation complete`);
      })
      .catch((err) => {
        console.error(`[SW v${VERSION}] Installation failed:`, err);
      })
  );
  // ✅ تفعيل فوري للنسخة الجديدة
  self.skipWaiting();
});

// ✅ تفعيل Service Worker وتنظيف Cache القديم
self.addEventListener('activate', (event) => {
  console.log(`[SW v${VERSION}] Activating...`);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      const oldCaches = cacheNames.filter((name) =>
        name !== STATIC_CACHE &&
        name !== DYNAMIC_CACHE &&
        name.startsWith('7esab-')
      );

      if (oldCaches.length > 0) {
        console.log(`[SW v${VERSION}] Deleting ${oldCaches.length} old caches:`, oldCaches);
      }

      return Promise.all(
        oldCaches.map((name) => {
          console.log(`[SW v${VERSION}] Deleting cache: ${name}`);
          return caches.delete(name);
        })
      );
    }).then(() => {
      console.log(`[SW v${VERSION}] Activation complete`);
    })
  );
  // ✅ السيطرة على جميع الصفحات المفتوحة
  self.clients.claim();
});

/**
 * ✅ التحقق من أن الطلب يجب عدم تخزينه مؤقتاً
 */
function shouldNeverCache(url) {
  const shouldSkip = NEVER_CACHE.some(pattern => url.pathname.includes(pattern));
  if (shouldSkip) {
    console.log(`[SW v${VERSION}] Skipping cache for:`, url.pathname);
  }
  return shouldSkip;
}

/**
 * ✅ التحقق من أن الاستجابة صالحة للتخزين
 */
function isValidForCache(response) {
  return response &&
         response.status === 200 &&
         (response.type === 'basic' || response.type === 'cors') &&
         !response.headers.get('cache-control')?.includes('no-store');
}

// ✅ استراتيجية Network First مع Fallback للـ Cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ✅ تجاهل الطلبات التي لا يجب تخزينها مؤقتاً
  if (shouldNeverCache(url) || request.method !== 'GET') {
    // إرجاع الطلب مباشرة بدون تدخل من Service Worker
    event.respondWith(
      fetch(request).catch(err => {
        console.error(`[SW v${VERSION}] Fetch failed for:`, url.pathname, err);
        return new Response('Network Error', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
    );
    return;
  }

  // ✅ استراتيجية Network First للموارد الأخرى
  event.respondWith(
    fetch(request)
      .then((response) => {
        // تخزين النسخة الجديدة في الـ Cache فقط للاستجابات الصالحة
        if (isValidForCache(response)) {
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE)
            .then((cache) => {
              cache.put(request, responseClone);
              console.log(`[SW v${VERSION}] Cached:`, url.pathname);
            })
            .catch(err => {
              console.warn(`[SW v${VERSION}] Failed to cache:`, url.pathname, err);
            });
        } else if (response && response.status !== 200) {
          console.warn(`[SW v${VERSION}] Not caching (status ${response.status}):`, url.pathname);
        }
        return response;
      })
      .catch(async (error) => {
        console.warn(`[SW v${VERSION}] Network failed for:`, url.pathname, error);

        // محاولة جلب من الـ Cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
          console.log(`[SW v${VERSION}] Serving from cache:`, url.pathname);
          return cachedResponse;
        }

        // صفحة عدم الاتصال للتنقل
        if (request.mode === 'navigate') {
          const offlinePage = await caches.match('/offline.html');
          if (offlinePage) {
            console.log(`[SW v${VERSION}] Serving offline page`);
            return offlinePage;
          }
        }

        // استجابة افتراضية
        return new Response('Offline - No cached version available', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
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

