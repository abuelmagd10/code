/**
 * 🗄️ Page Cache — Hybrid In-Memory Caching Utility
 * ────────────────────────────────────────────────────────────────────────────
 *
 * الميزات:
 *   1. Instant Navigation  — Cache Hit يُعيد البيانات فوراً
 *   2. SWR Behavior       — بعد الـ Hit يُطلق background revalidation اختيارياً
 *   3. TTL-based expiry   — 30 ثانية افتراضياً
 *   4. FIFO eviction      — عند تجاوز MAX_CACHE_ENTRIES
 *   5. Debug Mode         — console logging قابل للتشغيل/الإيقاف
 *
 * القواعد الإلزامية:
 *   ✅ key يحتوي دائماً على: entity + page + pageSize + الفلاتر
 *   ✅ لا يُكاش: create / update / delete
 *   ✅ Realtime events تستدعي invalidateCache تلقائياً
 */

// ════════════════════════════════════════════════════════
// § 1. TYPES
// ════════════════════════════════════════════════════════

export type CacheEntity =
  | 'purchase-orders'
  | 'bills'
  | 'inventory'
  | 'invoices'
  | string

export interface CacheEntry<T> {
  data: T
  cachedAt: number
  ttl: number
}

export interface PageCacheKey {
  entity: CacheEntity
  page: number
  pageSize: number
  filters?: Record<string, unknown>
}

/** دالة revalidation تُستدعى في الخلفية بعد cache hit */
export type RevalidateFn<T> = () => Promise<T>

// ════════════════════════════════════════════════════════
// § 2. CONFIGURATION
// ════════════════════════════════════════════════════════

/** مدة صلاحية الكاش الافتراضية */
const DEFAULT_TTL_MS = 30_000

/** الحد الأقصى لعدد الإدخالات (FIFO eviction) */
const MAX_CACHE_ENTRIES = 100

/**
 * Debug Mode — اضبطه على true محلياً لرؤية cache events في الـ console
 * يُعطَّل تلقائياً في الـ production
 */
const DEBUG_MODE = process.env.NODE_ENV === 'development' && false

// ════════════════════════════════════════════════════════
// § 3. CACHE STORE
// ════════════════════════════════════════════════════════

const store = new Map<string, CacheEntry<unknown>>()

// ════════════════════════════════════════════════════════
// § 4. INTERNAL HELPERS
// ════════════════════════════════════════════════════════

function log(event: 'HIT' | 'MISS' | 'WRITE' | 'INVALIDATE' | 'EXPIRE', key: string): void {
  if (!DEBUG_MODE) return
  const icons: Record<string, string> = {
    HIT: '⚡',
    MISS: '🔍',
    WRITE: '💾',
    INVALIDATE: '🗑️',
    EXPIRE: '⏱️',
  }
  console.debug(`[PageCache] ${icons[event]} ${event} → ${key}`)
}

// ════════════════════════════════════════════════════════
// § 5. KEY BUILDER
// ════════════════════════════════════════════════════════

/**
 * يبني مفتاح نصي حتمي فريد.
 * المفاتيح مُرتَّبة (sorted) لضمان نفس الـ key عند أي ترتيب للـ filters.
 */
export function buildCacheKey(params: PageCacheKey): string {
  const filtersStr =
    params.filters && Object.keys(params.filters).length > 0
      ? `::${JSON.stringify(params.filters, Object.keys(params.filters).sort())}`
      : ''
  return `${params.entity}::p${params.page}::ps${params.pageSize}${filtersStr}`
}

// ════════════════════════════════════════════════════════
// § 6. CORE API
// ════════════════════════════════════════════════════════

/**
 * يُعيد البيانات المكاشة إن كانت موجودة وصالحة.
 *
 * @param params     معاملات الصفحة والفلاتر
 * @param revalidate (اختياري) دالة SWR — تُشغَّل في الخلفية بعد الـ Hit
 *                   المستخدم يرى البيانات القديمة فوراً ثم تُحدَّث في الخلفية
 */
export function getCachedPage<T>(
  params: PageCacheKey,
  revalidate?: RevalidateFn<T>
): T | null {
  const key = buildCacheKey(params)
  const entry = store.get(key) as CacheEntry<T> | undefined

  if (!entry) {
    log('MISS', key)
    return null
  }

  const now = Date.now()
  if (now - entry.cachedAt > entry.ttl) {
    // انتهت الصلاحية
    store.delete(key)
    log('EXPIRE', key)
    return null
  }

  log('HIT', key)

  // ─── SWR: background revalidation ─────────────────────────────────────────
  // نُعيد البيانات القديمة فوراً، ونُشغّل الـ fetch في الخلفية بدون انتظار
  if (revalidate) {
    revalidate()
      .then((freshData) => {
        // تحديث الكاش بالبيانات الجديدة بدون التأثير على الـ render الحالي
        store.set(key, { data: freshData, cachedAt: Date.now(), ttl: entry.ttl })
        log('WRITE', `${key} [SWR]`)
      })
      .catch(() => {
        // فشل الـ revalidation — نتجاهله، البيانات القديمة لا تزال معروضة
      })
  }

  return entry.data
}

/**
 * يحفظ البيانات في الكاش.
 */
export function setCachedPage<T>(
  params: PageCacheKey,
  data: T,
  ttlMs: number = DEFAULT_TTL_MS
): void {
  // FIFO eviction عند تجاوز الحد الأقصى
  if (store.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = store.keys().next().value
    if (oldestKey) store.delete(oldestKey)
  }

  const key = buildCacheKey(params)
  store.set(key, { data, cachedAt: Date.now(), ttl: ttlMs })
  log('WRITE', key)
}

/**
 * يُبطل الكاش:
 *   - بدون معامل → يحذف كل شيء
 *   - مع entity  → يحذف مدخلات ذلك الـ entity فقط
 *
 * يُستدعى من Realtime event handlers.
 */
export function invalidateCache(entity?: CacheEntity): void {
  if (!entity) {
    const count = store.size
    store.clear()
    if (DEBUG_MODE) console.debug(`[PageCache] 🗑️ INVALIDATE ALL (${count} entries cleared)`)
    return
  }

  let count = 0
  for (const key of store.keys()) {
    if (key.startsWith(`${entity}::`)) {
      store.delete(key)
      count++
    }
  }
  log('INVALIDATE', `${entity}:: (${count} entries)`)
}

/**
 * Prefetch مسبق — يجلب صفحة ويكاشها دون عرض البيانات
 * يُستدعى بعد تحميل الصفحة الحالية لاستعداد الصفحة التالية
 */
export async function prefetchPage<T>(
  params: PageCacheKey,
  fetchFn: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<void> {
  const key = buildCacheKey(params)

  // لا تُعيد الجلب إذا كان موجوداً وصالحاً
  const existing = store.get(key) as CacheEntry<T> | undefined
  if (existing && Date.now() - existing.cachedAt <= existing.ttl) {
    log('HIT', `${key} [prefetch-skip]`)
    return
  }

  try {
    const data = await fetchFn()
    setCachedPage(params, data, ttlMs)
    log('WRITE', `${key} [prefetch]`)
  } catch {
    // صمت تام — prefetch فشل لا يؤثر على المستخدم
  }
}

// ════════════════════════════════════════════════════════
// § 7. DEBUG / DIAGNOSTICS
// ════════════════════════════════════════════════════════

/** يُعيد عدد الإدخالات الحالية في الكاش */
export function getCacheSize(): number {
  return store.size
}

/** يُعيد مفاتيح الكاش الحالية (dev only) */
export function getCacheKeys(): string[] {
  return Array.from(store.keys())
}

/**
 * تشغيل Debug Mode ديناميكياً من الـ console
 * الاستخدام في browser devtools:
 *   window.__pageCache?.enableDebug()
 */
if (typeof window !== 'undefined') {
  ;(window as any).__pageCache = {
    enableDebug: () => {
      ;(globalThis as any).__pageCacheDebug = true
      console.info('[PageCache] Debug mode enabled. Use window.__pageCache.keys() to inspect.')
    },
    keys: getCacheKeys,
    size: getCacheSize,
    invalidate: invalidateCache,
  }
}
