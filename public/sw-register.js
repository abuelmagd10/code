// Service Worker Registration - Secure Multi-Tenant ERP
// Version: 4.0.0
(function() {
  'use strict';
  
  if (!('serviceWorker' in navigator)) {
    console.log('[SW] Service Workers not supported');
    return;
  }

  const SW_VERSION = '4.0.0';
  const SW_URL = '/sw.js?v=' + SW_VERSION;

  // ✅ إزالة جميع Service Workers القديمة
  function unregisterOldServiceWorkers() {
    return navigator.serviceWorker.getRegistrations().then(function(registrations) {
      const unregisterPromises = registrations.map(function(reg) {
        // ✅ التحقق من أن Service Worker ليس النسخة الجديدة
        if (reg.active && reg.active.scriptURL) {
          const scriptURL = reg.active.scriptURL;
          // ✅ إزالة جميع النسخ القديمة
          if (!scriptURL.includes('v=4.0.0') && !scriptURL.includes('v4.0.0')) {
            console.log('[SW] Unregistering old Service Worker:', scriptURL);
            return reg.unregister().then(function(success) {
              if (success) {
                console.log('[SW] Old Service Worker unregistered successfully');
              } else {
                console.warn('[SW] Failed to unregister old Service Worker');
              }
            }).catch(function(err) {
              console.warn('[SW] Error unregistering old Service Worker:', err);
            });
          }
        }
        return Promise.resolve();
      });
      return Promise.all(unregisterPromises);
    });
  }

  // ✅ تنظيف جميع الـ Caches القديمة
  function clearOldCaches() {
    if ('caches' in window) {
      return caches.keys().then(function(cacheNames) {
        const deletePromises = cacheNames.map(function(cacheName) {
          // ✅ حذف جميع الـ caches التي تبدأ بـ '7esab-' وليست النسخة الجديدة
          if (cacheName.startsWith('7esab-') && 
              !cacheName.includes('v4.0.0') && 
              !cacheName.includes('v' + SW_VERSION.replace(/\./g, '-'))) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        });
        return Promise.all(deletePromises);
      }).catch(function(err) {
        console.warn('[SW] Error clearing old caches:', err);
      });
    }
    return Promise.resolve();
  }

  // ✅ تسجيل Service Worker الجديد
  function registerServiceWorker() {
    return navigator.serviceWorker.register(SW_URL)
      .then(function(registration) {
        console.log('[SW] Service Worker v' + SW_VERSION + ' registered:', registration.scope);

        // ✅ التحقق من وجود نسخة جديدة في الانتظار
        if (registration.waiting) {
          console.log('[SW] New Service Worker waiting - triggering skipWaiting');
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          registration.update();
        }

        // ✅ الاستماع لتحديثات Service Worker
        registration.addEventListener('updatefound', function() {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', function() {
            if (newWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // ✅ يوجد Service Worker جديد - إعادة تحميل الصفحة
                console.log('[SW] New Service Worker installed - reloading page');
                window.location.reload();
              } else {
                console.log('[SW] Service Worker installed for the first time');
              }
            }
          });
        });

        // ✅ الاستماع لرسائل من Service Worker
        navigator.serviceWorker.addEventListener('message', function(event) {
          if (event.data && event.data.type === 'SW_UPDATED') {
            console.log('[SW] Service Worker updated:', event.data.version);
            if (event.data.message) {
              console.log('[SW]', event.data.message);
            }
            // ✅ إعادة تحميل الصفحة عند التحديث
            setTimeout(function() {
              window.location.reload();
            }, 1000);
          }
        });

        return registration;
      })
      .catch(function(err) {
        console.error('[SW] Service Worker registration failed:', err);
      });
  }

  // ✅ تنفيذ التسجيل بعد تحميل الصفحة
  window.addEventListener('load', function() {
    console.log('[SW] Initializing Service Worker registration...');
    
    // ✅ أولاً: إزالة النسخ القديمة
    unregisterOldServiceWorkers()
      .then(function() {
        // ✅ ثانياً: تنظيف الـ Caches القديمة
        return clearOldCaches();
      })
      .then(function() {
        // ✅ ثالثاً: تسجيل Service Worker الجديد
        return registerServiceWorker();
      })
      .then(function() {
        console.log('[SW] Service Worker initialization complete');
      })
      .catch(function(err) {
        console.error('[SW] Service Worker initialization failed:', err);
      });
  });

  // ✅ إعادة تسجيل Service Worker عند العودة للصفحة (للتأكد من التحديثات)
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(function(registration) {
        if (registration) {
          registration.update();
        }
      });
    }
  });
})();

