// 7ESAB ERP Service Worker - Secure Multi-Tenant Version
// Version: 4.3.0 - 2026-05-23 - Pages bypass SW completely (only static + supabase REST)
// ✅ Production Ready: No caching for dynamic/sensitive data
// ✅ v4.3.0: SW only handles static assets + supabase REST API; all pages bypass
const VERSION = '4.3.0-' + Date.now(); // Force unique version on each deployment
const BUILD_DATE = new Date().toISOString().split('T')[0];
const STATIC_CACHE = `7esab-static-v${VERSION}`;

console.log(`[SW v${VERSION}] Service Worker initializing... (Build: ${BUILD_DATE})`);

// ✅ قائمة شاملة للمسارات التي لا يجب تخزينها مؤقتاً أبداً
const NEVER_CACHE_PATTERNS = [
  // API Routes
  '/api/',
  '/rest/',
  '/auth/',
  
  // Supabase REST API
  '/rest/v1/',
  
  // Accounting & Financial Endpoints
  '/journal-entries',
  '/chart-of-accounts',
  '/account-balances',
  '/balance-sheet',
  '/income-statement',
  '/trial-balance',
  
  // Company & Multi-tenant Data
  '/companies',
  '/company-members',
  '/my-company',
  
  // Inventory & Products
  '/products',
  '/inventory',
  '/stock',

  // Financial Transactions (CRITICAL - Never cache!)
  '/expenses',
  '/invoices',
  '/bills',
  '/sales-orders',
  '/purchase-orders',

  // Reports
  '/reports/',
  '/report-',
  
  // Authentication & Session
  '/auth/',
  '/login',
  '/logout',
  '/session',
  
  // WebSocket & Real-time
  '/socket.io',
  '/_next/webpack-hmr',
  '/_next/static/webpack/',
  
  // Manifest (must be fresh)
  '/manifest.json',
  '/api/manifest',
];

// ✅ قائمة الملفات الثابتة المسموح بتخزينها مؤقتاً
const STATIC_ASSETS = [
  '/offline.html',
  '/icons/icon.svg',
];

/**
 * ✅ التحقق من أن الطلب يجب عدم تخزينه مؤقتاً (NetworkOnly)
 * يتحقق من المسار و Content-Type
 */
function shouldNeverCache(url, request) {
  const pathname = url.pathname.toLowerCase();
  const fullUrl = url.href.toLowerCase();
  
  // ✅ منع جميع طلبات POST, PUT, DELETE, PATCH
  if (request.method !== 'GET') {
    return true;
  }
  
  // ✅ منع جميع طلبات API و REST
  if (pathname.startsWith('/api/') || 
      pathname.startsWith('/rest/') || 
      pathname.startsWith('/auth/')) {
    return true;
  }
  
  // ✅ منع جميع المسارات الحساسة
  for (const pattern of NEVER_CACHE_PATTERNS) {
    if (pathname.includes(pattern.toLowerCase()) || 
        fullUrl.includes(pattern.toLowerCase())) {
      return true;
    }
  }
  
  // ✅ منع جميع طلبات JSON (API responses)
  const acceptHeader = request.headers.get('accept') || '';
  if (acceptHeader.includes('application/json')) {
    return true;
  }
  
  // ✅ السماح فقط للملفات الثابتة
  // /_next/static/* - Next.js static assets
  // *.css, *.js, *.woff, *.woff2, *.ttf, *.eot - Static resources
  // *.png, *.jpg, *.jpeg, *.gif, *.svg, *.webp - Images
  const isStaticAsset = 
    pathname.startsWith('/_next/static/') ||
    pathname.match(/\.(css|js|woff|woff2|ttf|eot|otf)$/i) ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i) ||
    pathname.match(/\.(mp4|webm|ogg|mp3|wav)$/i);
  
  return !isStaticAsset;
}

/**
 * ✅ التحقق من أن الملف ثابت وآمن للتخزين
 */
function isStaticAsset(url) {
  const pathname = url.pathname.toLowerCase();
  
  // ✅ Next.js static files only
  if (pathname.startsWith('/_next/static/')) {
    return true;
  }
  
  // ✅ Static file extensions
  const staticExtensions = [
    '.css', '.js', '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
    '.mp4', '.webm', '.ogg', '.mp3', '.wav'
  ];
  
  return staticExtensions.some(ext => pathname.endsWith(ext));
}

// ✅ تثبيت Service Worker
self.addEventListener('install', (event) => {
  console.log(`[SW v${VERSION}] Installing...`);
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log(`[SW v${VERSION}] Caching static assets only`);
        // ✅ تخزين فقط الملفات الثابتة المحددة
        return cache.addAll(
          STATIC_ASSETS.filter(url => url && !url.includes('undefined'))
        );
      })
      .then(() => {
        console.log(`[SW v${VERSION}] Installation complete - Static assets only`);
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
    Promise.all([
      // ✅ حذف جميع الـ caches القديمة
      caches.keys().then((cacheNames) => {
        const oldCaches = cacheNames.filter((name) => 
          name !== STATIC_CACHE && name.startsWith('7esab-')
        );
        
        if (oldCaches.length > 0) {
          console.log(`[SW v${VERSION}] Deleting ${oldCaches.length} old caches:`, oldCaches);
          return Promise.all(
            oldCaches.map((name) => {
              console.log(`[SW v${VERSION}] Deleting cache: ${name}`);
              return caches.delete(name);
            })
          );
        }
        return Promise.resolve();
      }),
      // ✅ السيطرة على جميع الصفحات المفتوحة
      self.clients.claim()
    ]).then(() => {
      console.log(`[SW v${VERSION}] Activation complete - All old caches cleared`);
      
      // ✅ إرسال رسالة لجميع العملاء لإعادة تحميل الصفحة
      return self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: VERSION,
            message: 'Service Worker updated - Please refresh'
          });
        });
      });
    })
  );
});

// ✅ استراتيجية NetworkOnly للبيانات الديناميكية
// ✅ CacheFirst فقط للملفات الثابتة

/**
 * v4.2.0 — fetch with retry + long timeout, used for non-HTML API requests
 * عند فشل الـ network، يحاول مرات بـ exponential backoff قبل الفشل.
 * لو فشل نهائياً، نرمى الخطأ (لا نولّد 503 synthesized).
 */
async function fetchWithRetry(request, { maxAttempts = 3, timeoutMs = 45000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // ✅ Clone the request so subsequent attempts work
      const reqClone = attempt === 1 ? request : request.clone();
      const response = await fetch(reqClone, { signal: controller.signal });
      clearTimeout(timer);
      return response;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < maxAttempts) {
        // exponential backoff: 1000ms, 2000ms, 4000ms
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
        console.warn(`[SW v${VERSION}] Fetch attempt ${attempt} failed for ${new URL(request.url).pathname}, retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * v4.3.0 — Determine if SW should handle this request at all
 *
 * SW handles ONLY:
 *   1. Static assets (_next/static, *.css, *.js, *.png, etc.)
 *   2. Supabase REST API (supabase.co/rest/v1/*)
 *
 * SW BYPASSES (returns from listener without respondWith):
 *   - All same-origin pages (/dashboard, /auth/callback, /, etc.)
 *   - All Next.js internal API (/api/*)
 *   - Anything else (let browser handle natively)
 */
function shouldSWHandle(url) {
  // External API: Supabase REST/Auth
  if (url.hostname.includes('supabase.co')) {
    return true; // SW will handle with retry logic
  }

  // Same-origin: only handle static assets
  if (url.pathname.startsWith('/_next/static/')) return true;
  if (url.pathname.match(/\.(css|js|woff|woff2|ttf|eot|otf|png|jpg|jpeg|gif|svg|webp|ico|mp4|webm|ogg|mp3|wav)$/i)) {
    return true;
  }

  // Everything else (pages, /api/*, etc.) → bypass SW
  return false;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ✅ تجاهل الطلبات من schemes غير مدعومة (chrome-extension, etc.)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    console.debug(`[SW v${VERSION}] Ignoring request from unsupported scheme: ${url.protocol}`);
    event.respondWith(fetch(request).catch(() => new Response('', { status: 0 })));
    return;
  }

  // ✅ تجاهل الطلبات غير GET
  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  // ✅ v4.3.0: If SW shouldn't handle this URL, bypass entirely
  //   - Pages (/dashboard, /, /auth/callback, etc.) — browser native
  //   - Same-origin /api/* — browser native
  //   - Only static assets + Supabase REST go through SW logic
  if (!shouldSWHandle(url)) {
    // Let browser handle natively (no respondWith) — fastest path, no overhead
    return;
  }

  // ✅ Supabase REST API: NetworkOnly with retry
  if (url.hostname.includes('supabase.co')) {
    console.log(`[SW v${VERSION}] Supabase API: ${url.pathname}`);
    event.respondWith(
      fetchWithRetry(request, { maxAttempts: 2, timeoutMs: 30000 })
        .catch((error) => {
          console.error(`[SW v${VERSION}] Supabase API failed: ${url.pathname}`, error);
          throw error;
        })
    );
    return;
  }
  
  // ✅ CacheFirst فقط للملفات الثابتة
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            console.log(`[SW v${VERSION}] Serving static asset from cache: ${url.pathname}`);
            return cachedResponse;
          }
          
          // ✅ جلب من الشبكة وتخزين في cache
          return fetch(request)
            .then((response) => {
              // ✅ التحقق من أن الاستجابة صالحة وأن الـ scheme مدعوم
              if (response && response.status === 200) {
                // ✅ التحقق من أن الطلب من scheme مدعوم (http/https فقط)
                const requestUrl = new URL(request.url);
                const isSupportedScheme = requestUrl.protocol === 'http:' || requestUrl.protocol === 'https:';
                
                if (isSupportedScheme) {
                  const responseClone = response.clone();
                  caches.open(STATIC_CACHE)
                    .then((cache) => {
                      // ✅ محاولة تخزين فقط إذا كان الـ scheme مدعوم
                      cache.put(request, responseClone)
                        .then(() => {
                          console.log(`[SW v${VERSION}] Cached static asset: ${url.pathname}`);
                        })
                        .catch((err) => {
                          // ✅ تجاهل الأخطاء الصامتة للـ schemes غير المدعومة
                          if (err.message && err.message.includes('chrome-extension')) {
                            console.debug(`[SW v${VERSION}] Skipping cache for unsupported scheme: ${requestUrl.protocol}`);
                          } else {
                            console.warn(`[SW v${VERSION}] Failed to cache static asset:`, err);
                          }
                        });
                    })
                    .catch((err) => {
                      console.warn(`[SW v${VERSION}] Failed to open cache:`, err);
                    });
                } else {
                  // ✅ تجاهل الطلبات من schemes غير مدعومة (chrome-extension, etc.)
                  console.debug(`[SW v${VERSION}] Skipping cache for unsupported scheme: ${requestUrl.protocol}`);
                }
              }
              return response;
            })
            .catch((error) => {
              console.error(`[SW v${VERSION}] Failed to fetch static asset: ${url.pathname}`, error);
              // ✅ إرجاع صفحة offline للتنقل فقط
              if (request.mode === 'navigate') {
                return caches.match('/offline.html');
              }
              throw error;
            });
        })
    );
    return;
  }
  
  // ✅ للصفحات (navigation requests) - NetworkFirst بدون cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => {
          // ✅ فقط في حالة عدم الاتصال، عرض صفحة offline
          return caches.match('/offline.html');
        })
    );
    return;
  }
  
  // ✅ افتراضي: NetworkOnly (لا cache)
  event.respondWith(fetch(request));
});

// ✅ معالجة الإشعارات
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

// ✅ معالجة الضغط على الإشعار
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

// ✅ Background Sync (للمزامنة المستقبلية)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    console.log(`[SW v${VERSION}] Background sync triggered`);
    // ✅ لا تقم بمزامنة البيانات الحساسة في الخلفية
    // يمكن استخدام هذا للمزامنة الآمنة فقط
  }
});

console.log(`[SW v${VERSION}] Service Worker loaded - Secure mode enabled`);
