# 🔍 Browser Diagnostic — Permission Filter Issue

## الهدف
معرفة لماذا الـ Ctrl+K يَعرض كل الصفحات للـ accountant.

## الخطوات

### 1. افتح 7esab.com فى **incognito window** (Ctrl+Shift+N)
المهم: incognito حتى لا تَستخدم session cached من حساب owner.

### 2. سَجِّل دخول بـ `baikeyous1@gmail.com` (accountant)

### 3. افتح DevTools (F12) → Console tab

### 4. الصق هذا والاضغط Enter:

```javascript
(async () => {
  // 1. Clear all caches first
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const r of regs) await r.unregister();
  const keys = await caches.keys();
  for (const k of keys) await caches.delete(k);
  console.log('✓ SW + caches cleared. Reloading in 2s...');

  // 2. Reload after a moment
  setTimeout(() => location.reload(true), 2000);
})();
```

### 5. **بعد إعادة التَحميل**، اضغط Ctrl+K

### 6. الصق هذا فى Console وأَرسلى النتيجة:

```javascript
(async () => {
  // Find the React-rendered command items
  const items = document.querySelectorAll('[cmdk-item]');
  const visible = Array.from(items).filter(el => {
    const style = getComputedStyle(el);
    return style.display !== 'none' && el.offsetParent !== null;
  });

  // Try to access localStorage
  const stored = {
    appLang: localStorage.getItem('app_language') || localStorage.getItem('appLang'),
    company: localStorage.getItem('active_company_id'),
  };

  // Try to find any user info on the page (sidebar usually shows role)
  const pageText = document.body.innerText;
  const arabicRoles = ['مالك', 'مدير عام', 'مدير', 'محاسب', 'موظف', 'مسؤول مخزن'];
  const detectedRole = arabicRoles.find(r => pageText.includes(r)) || 'unknown';

  console.log('=== Permission Filter Diagnostic ===');
  console.log('Total command items in DOM:', items.length);
  console.log('Visible command items:', visible.length);
  console.log('Detected role in page:', detectedRole);
  console.log('localStorage state:', stored);
  console.log('First 10 visible commands:');
  visible.slice(0, 10).forEach((el, i) => console.log(`  ${i+1}. ${el.innerText.trim()}`));

  return {
    totalItems: items.length,
    visibleItems: visible.length,
    detectedRole,
    firstItems: visible.slice(0, 10).map(el => el.innerText.trim()),
  };
})()
```

## ما النتيجة المُتوَقَّعة

**لـ accountant:**
- `visibleItems`: حوالى 20-25 (وليس 80+)
- `detectedRole`: "محاسب"

**لو ظَهَر 80+ items:**
- إما الـ user فعلاً owner (`detectedRole: مالك`)
- أو `accessReady = false` عند الفَتح (نَحتاج تَأخير)

أَرسلى الـ output من Console.
