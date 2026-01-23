/**
 * 🔄 Hook للاشتراك في جدول Realtime معين
 * 
 * يسهل استخدام Realtime في الصفحات والمكونات
 */

"use client"

import { useEffect, useRef, useCallback } from 'react'
import { useRealtime } from '@/lib/realtime-provider'
import type { RealtimeTable, RealtimeEvent, RealtimeEventHandler } from '@/lib/realtime-manager'

interface UseRealtimeTableOptions<T = any> {
  table: RealtimeTable
  enabled?: boolean
  onInsert?: (record: T) => void | Promise<void>
  onUpdate?: (newRecord: T, oldRecord: T) => void | Promise<void>
  onDelete?: (oldRecord: T) => void | Promise<void>
  onEvent?: (event: RealtimeEvent<T>) => void | Promise<void>
  filter?: (event: RealtimeEvent<T>) => boolean // فلتر إضافي للأحداث
}

/**
 * Hook للاشتراك في جدول Realtime
 * 
 * @example
 * ```tsx
 * const { isSubscribed } = useRealtimeTable({
 *   table: 'notifications',
 *   onInsert: (notification) => {
 *     setNotifications(prev => [notification, ...prev])
 *   },
 *   onUpdate: (newNotif, oldNotif) => {
 *     setNotifications(prev => prev.map(n => n.id === newNotif.id ? newNotif : n))
 *   },
 *   onDelete: (notification) => {
 *     setNotifications(prev => prev.filter(n => n.id !== notification.id))
 *   }
 * })
 * ```
 */
export function useRealtimeTable<T = any>({
  table,
  enabled = true,
  onInsert,
  onUpdate,
  onDelete,
  onEvent,
  filter,
}: UseRealtimeTableOptions<T>) {
  const { subscribe, isReady } = useRealtime()
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const handlersRef = useRef({ onInsert, onUpdate, onDelete, onEvent, filter })

  // تحديث المراجع عند تغيير المعالجات
  useEffect(() => {
    handlersRef.current = { onInsert, onUpdate, onDelete, onEvent, filter }
  }, [onInsert, onUpdate, onDelete, onEvent, filter])

  // معالج الأحداث الموحد
  const handleEvent = useCallback((event: RealtimeEvent<T>) => {
    const { onInsert, onUpdate, onDelete, onEvent, filter } = handlersRef.current

    // تطبيق الفلتر الإضافي إن وجد
    if (filter && !filter(event)) {
      return
    }

    // استدعاء المعالج العام
    if (onEvent) {
      try {
        onEvent(event)
      } catch (error) {
        console.error(`❌ [useRealtimeTable] Error in onEvent handler:`, error)
      }
    }

    // استدعاء المعالجات المخصصة حسب نوع الحدث
    switch (event.type) {
      case 'INSERT':
        if (onInsert && event.new) {
          try {
            onInsert(event.new)
          } catch (error) {
            console.error(`❌ [useRealtimeTable] Error in onInsert handler:`, error)
          }
        }
        break

      case 'UPDATE':
        if (onUpdate && event.new && event.old) {
          try {
            onUpdate(event.new, event.old)
          } catch (error) {
            console.error(`❌ [useRealtimeTable] Error in onUpdate handler:`, error)
          }
        }
        break

      case 'DELETE':
        if (onDelete && event.old) {
          try {
            onDelete(event.old)
          } catch (error) {
            console.error(`❌ [useRealtimeTable] Error in onDelete handler:`, error)
          }
        }
        break
    }
  }, [])

  // الاشتراك/إلغاء الاشتراك
  useEffect(() => {
    if (!enabled || !isReady) {
      return
    }

    // الاشتراك
    const unsubscribe = subscribe<T>(table, handleEvent)
    unsubscribeRef.current = unsubscribe

    // تنظيف عند إلغاء التثبيت
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
    }
  }, [table, enabled, isReady, subscribe, handleEvent])

  return {
    isSubscribed: enabled && isReady && unsubscribeRef.current !== null,
  }
}
