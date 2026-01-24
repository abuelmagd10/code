/**
 * 🔄 Realtime Provider - React Context Provider
 * 
 * يوفر Realtime Manager للصفحات والمكونات
 */

"use client"

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { getRealtimeManager, type RealtimeEvent, type RealtimeTable, type RealtimeEventHandler } from './realtime-manager'

// =====================================================
// Context Types
// =====================================================

interface RealtimeContextValue {
  isReady: boolean
  subscribe: <T = any>(table: RealtimeTable, handler: RealtimeEventHandler<T>) => () => void
  unsubscribe: (table: RealtimeTable) => Promise<void>
  getContext: () => ReturnType<typeof getRealtimeManager>['getContext'] extends () => infer R ? R : never
  updateContext: () => Promise<void>
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null)

// =====================================================
// Provider Component
// =====================================================

interface RealtimeProviderProps {
  children: React.ReactNode
  autoSubscribe?: RealtimeTable[] // جداول للاشتراك التلقائي
}

export function RealtimeProvider({ 
  children, 
  autoSubscribe = [] 
}: RealtimeProviderProps) {
  const [isReady, setIsReady] = useState(false)
  const managerRef = useRef<ReturnType<typeof getRealtimeManager> | null>(null)
  const handlersRef = useRef<Map<RealtimeTable, Set<RealtimeEventHandler>>>(new Map())

  // تهيئة Manager
  useEffect(() => {
    let mounted = true

    const init = async () => {
      try {
        const manager = getRealtimeManager()
        await manager.initialize()
        
        if (mounted) {
          managerRef.current = manager
          setIsReady(true)

          // الاشتراك التلقائي في الجداول المحددة
          if (autoSubscribe.length > 0) {
            for (const table of autoSubscribe) {
              await manager.subscribe(table)
            }
          }

          // دالة مساعدة لإعادة الاشتراك في الجداول التلقائية
          const resubscribeAutoTables = async () => {
            if (managerRef.current && autoSubscribe.length > 0 && mounted) {
              for (const table of autoSubscribe) {
                await managerRef.current.subscribe(table)
              }
              console.log('✅ [RealtimeProvider] Resubscribed to auto-subscribe tables:', autoSubscribe)
            }
          }

          // الاستماع لتغيير الشركة
          if (typeof window !== 'undefined') {
            const handleCompanyChange = async () => {
              if (managerRef.current) {
                await managerRef.current.updateContext()
                await resubscribeAutoTables()
              }
            }
            window.addEventListener('company_updated', handleCompanyChange)
            
            // 🔐 الاستماع لتغيير الفرع/المخزن
            const handleUserContextChanged = async () => {
              if (managerRef.current) {
                console.log('🔄 [RealtimeProvider] user_context_changed event received')
                await managerRef.current.updateContext()
                
                // ✅ إعادة الاشتراك في الجداول التلقائية بعد تحديث السياق
                await resubscribeAutoTables()
              }
            }
            window.addEventListener('user_context_changed', handleUserContextChanged)
            
            return () => {
              window.removeEventListener('company_updated', handleCompanyChange)
              window.removeEventListener('user_context_changed', handleUserContextChanged)
            }
          }
        }
      } catch (error) {
        console.error('❌ [RealtimeProvider] Initialization error:', error)
        if (mounted) {
          setIsReady(false)
        }
      }
    }

    init()

    return () => {
      mounted = false
      // تنظيف عند إلغاء التثبيت
      if (managerRef.current) {
        managerRef.current.unsubscribeAll().catch(console.error)
      }
    }
  }, [autoSubscribe])

  // دالة الاشتراك
  const subscribe = useCallback(<T = any>(
    table: RealtimeTable,
    handler: RealtimeEventHandler<T>
  ): (() => void) => {
    if (!managerRef.current) {
      console.warn(`⚠️ [RealtimeProvider] Manager not ready, handler will be registered when ready`)
      // تسجيل المعالج للاحتفاظ به حتى يصبح Manager جاهزاً
      if (!handlersRef.current.has(table)) {
        handlersRef.current.set(table, new Set())
      }
      handlersRef.current.get(table)!.add(handler as RealtimeEventHandler)
      
      // محاولة الاشتراك عند الجاهزية
      const checkReady = setInterval(() => {
        if (managerRef.current && isReady) {
          clearInterval(checkReady)
          managerRef.current.subscribe(table).catch(console.error)
          const unsubscribe = managerRef.current.on(table, handler as RealtimeEventHandler)
          return unsubscribe
        }
      }, 100)

      return () => {
        clearInterval(checkReady)
        const handlers = handlersRef.current.get(table)
        if (handlers) {
          handlers.delete(handler as RealtimeEventHandler)
        }
      }
    }

    // التأكد من الاشتراك في الجدول
    if (!managerRef.current.isSubscribed(table)) {
      managerRef.current.subscribe(table).catch(console.error)
    }

    // تسجيل المعالج
    const unsubscribe = managerRef.current.on(table, handler as RealtimeEventHandler)

    return unsubscribe
  }, [isReady])

  // دالة إلغاء الاشتراك
  const unsubscribe = useCallback(async (table: RealtimeTable) => {
    if (managerRef.current) {
      await managerRef.current.unsubscribe(table)
    }
  }, [])

  // الحصول على السياق
  const getContext = useCallback((): ReturnType<ReturnType<typeof getRealtimeManager>['getContext']> | null => {
    return managerRef.current?.getContext() || null
  }, [])

  // تحديث السياق
  const updateContext = useCallback(async () => {
    if (managerRef.current) {
      await managerRef.current.updateContext()
    }
  }, [])

  const value: RealtimeContextValue = {
    isReady,
    subscribe,
    unsubscribe,
    getContext,
    updateContext,
  }

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  )
}

// =====================================================
// Hook للاستخدام
// =====================================================

export function useRealtime(): RealtimeContextValue {
  const context = useContext(RealtimeContext)
  if (!context) {
    throw new Error('useRealtime must be used within RealtimeProvider')
  }
  return context
}
