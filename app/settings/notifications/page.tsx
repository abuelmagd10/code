'use client'

/**
 * /settings/notifications — Notification Preferences UI (Phase K v3.38.0)
 *
 * User chooses which categories notify them, and via which channels.
 * Critical-severity notifications always deliver regardless of these
 * settings (enforced at the should_user_be_notified() DB function).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Bell, Mail, Loader2, Save, RotateCcw, AlertTriangle,
  ArrowLeft, CheckCircle2, Info, Sparkles,
  CreditCard, DollarSign, ShoppingCart, ShieldCheck,
  Settings as SettingsIcon, Package, Users, Factory,
} from 'lucide-react'

interface PreferencesMatrix {
  [category: string]: {
    [channel: string]: boolean
  }
}

interface PreferencesResponse {
  categories: string[]
  channels: string[]
  preferences: PreferencesMatrix
}

const CATEGORY_META: Record<string, { label: string; description: string; icon: React.ReactNode; color: string }> = {
  billing:       { label: 'الفوترة والاشتراك', description: 'تذكير التجديد، انتهاء الاشتراك، الدفعات، التفعيل', icon: <CreditCard className="w-5 h-5" />,    color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/20' },
  finance:       { label: 'المالية',            description: 'الفواتير، المدفوعات، القيود المحاسبية، المصروفات',     icon: <DollarSign className="w-5 h-5" />,    color: 'text-green-600 bg-green-50 dark:bg-green-900/20' },
  sales:         { label: 'المبيعات',           description: 'طلبات البيع، الفواتير، المردودات، العملاء',           icon: <ShoppingCart className="w-5 h-5" />,  color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
  approvals:     { label: 'الموافقات',          description: 'طلبات الاعتماد، التحويلات الإدارية، التصاريح',         icon: <ShieldCheck className="w-5 h-5" />,   color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' },
  system:        { label: 'النظام',             description: 'تحديثات النظام، تنبيهات الصيانة، الأمان',              icon: <SettingsIcon className="w-5 h-5" />,  color: 'text-gray-600 bg-gray-50 dark:bg-gray-800' },
  inventory:     { label: 'المخزون',            description: 'حركات المخزون، التحويلات، الإهلاك، نواقص الكميات',     icon: <Package className="w-5 h-5" />,       color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20' },
  hr:            { label: 'الموارد البشرية',    description: 'الموظفون، الإجازات، الرواتب، الحضور',                 icon: <Users className="w-5 h-5" />,         color: 'text-pink-600 bg-pink-50 dark:bg-pink-900/20' },
  manufacturing: { label: 'التصنيع',            description: 'أوامر الإنتاج، استلام المواد، تحويلات الإنتاج',        icon: <Factory className="w-5 h-5" />,       color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' },
}

const CHANNEL_META: Record<string, { label: string; icon: React.ReactNode }> = {
  in_app: { label: 'داخل التطبيق', icon: <Bell className="w-4 h-4" /> },
  email:  { label: 'بريد إلكترونى', icon: <Mail className="w-4 h-4" /> },
}

export default function NotificationPreferencesPage() {
  const [data, setData] = useState<PreferencesResponse | null>(null)
  const [originalData, setOriginalData] = useState<PreferencesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/notifications/preferences')
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error || 'تعذر جلب التفضيلات')
        return
      }
      setData(json)
      setOriginalData(JSON.parse(JSON.stringify(json)))  // deep clone
    } catch {
      setError('خطأ فى الاتصال بالخادم')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const hasChanges = useMemo(() => {
    if (!data || !originalData) return false
    return JSON.stringify(data.preferences) !== JSON.stringify(originalData.preferences)
  }, [data, originalData])

  const toggle = (cat: string, ch: string) => {
    if (!data) return
    setData({
      ...data,
      preferences: {
        ...data.preferences,
        [cat]: {
          ...data.preferences[cat],
          [ch]: !data.preferences[cat][ch],
        },
      },
    })
  }

  const setAllInCategory = (cat: string, enabled: boolean) => {
    if (!data) return
    const updated = { ...data.preferences[cat] }
    for (const ch of data.channels) updated[ch] = enabled
    setData({ ...data, preferences: { ...data.preferences, [cat]: updated } })
  }

  const setAllInChannel = (ch: string, enabled: boolean) => {
    if (!data) return
    const updated: PreferencesMatrix = {}
    for (const cat of data.categories) {
      // Billing channel = email cannot be muted for the owner
      // (handled by critical-severity bypass on the server, but UI hint here)
      updated[cat] = { ...data.preferences[cat], [ch]: enabled }
    }
    setData({ ...data, preferences: updated })
  }

  const reset = () => {
    if (!originalData) return
    setData(JSON.parse(JSON.stringify(originalData)))
  }

  const save = async () => {
    if (!data) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: data.preferences }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error || 'فشل حفظ التفضيلات')
        return
      }
      setData(json)
      setOriginalData(JSON.parse(JSON.stringify(json)))
      setSavedAt(new Date())
    } catch (e: any) {
      setError(e?.message || 'خطأ فى الاتصال')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950">
        <Loader2 className="w-10 h-10 animate-spin text-violet-600" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-6">
        <div className="text-center max-w-sm">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-700 dark:text-gray-300 mb-4">{error}</p>
          <button onClick={fetchData} className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700">
            إعادة المحاولة
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950" dir="rtl">
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Link href="/settings" className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
                <ArrowLeft className="w-5 h-5 text-gray-500 rotate-180" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">تفضيلات الإشعارات</h1>
                <p className="text-sm text-gray-500">تحكم فى نوع الإشعارات التى تستلمها وقنوات الاستلام</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasChanges && (
                <button
                  onClick={reset}
                  disabled={saving}
                  className="px-3 py-2 bg-white dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg border border-gray-200 dark:border-slate-700 transition-colors flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  تراجع
                </button>
              )}
              <button
                onClick={save}
                disabled={!hasChanges || saving}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-sm"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                حفظ التفضيلات
              </button>
            </div>
          </div>

          {/* Saved indicator */}
          {savedAt && !hasChanges && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-green-800 dark:text-green-200">
                تم حفظ التفضيلات بنجاح فى {savedAt.toLocaleTimeString('ar-EG')}
              </span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Critical override notice */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-900 dark:text-amber-200">
              <p className="font-semibold mb-1">الإشعارات الحرجة تتجاوز هذه الإعدادات</p>
              <p className="text-amber-800 dark:text-amber-300">
                إيقاف الحساب، فشل دفعة، أو أى تنبيه أمنى حرج سيصل دائماً بغض النظر عن تفضيلاتك. هذا لحمايتك ولحماية شركتك.
              </p>
            </div>
          </div>

          {/* Channel-level Bulk Actions */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-5">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">اختصارات سريعة</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {data.channels.map((ch) => {
                const meta = CHANNEL_META[ch]
                return (
                  <div key={ch} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      {meta?.icon}
                      {meta?.label || ch}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setAllInChannel(ch, true)}
                        className="px-2.5 py-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                      >
                        تفعيل الكل
                      </button>
                      <button
                        onClick={() => setAllInChannel(ch, false)}
                        className="px-2.5 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                      >
                        كتم الكل
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Categories Matrix */}
          <div className="space-y-3">
            {data.categories.map((cat) => {
              const meta = CATEGORY_META[cat]
              if (!meta) return null
              const catPrefs = data.preferences[cat] || {}
              const allOff = data.channels.every((ch) => !catPrefs[ch])
              const allOn = data.channels.every((ch) => catPrefs[ch])

              return (
                <div
                  key={cat}
                  className={`bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 overflow-hidden transition-all ${
                    allOff ? 'opacity-60' : ''
                  }`}
                >
                  <div className="p-5 flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3 flex-1 min-w-[200px]">
                      <div className={`p-2.5 rounded-lg ${meta.color}`}>
                        {meta.icon}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-0.5">{meta.label}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{meta.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {data.channels.map((ch) => {
                        const chMeta = CHANNEL_META[ch]
                        const enabled = catPrefs[ch]
                        return (
                          <button
                            key={ch}
                            onClick={() => toggle(cat, ch)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                              enabled
                                ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-900/50'
                                : 'bg-gray-100 dark:bg-slate-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-slate-700'
                            }`}
                            title={`${enabled ? 'مفعّل' : 'مكتوم'}: ${chMeta?.label || ch}`}
                          >
                            {chMeta?.icon}
                            <span>{chMeta?.label || ch}</span>
                            <span
                              className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                                enabled ? 'bg-violet-600' : 'bg-gray-300 dark:bg-slate-600'
                              }`}
                            >
                              <span
                                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                                  enabled ? 'translate-x-3 rtl:-translate-x-3' : 'translate-x-0.5 rtl:-translate-x-0.5'
                                }`}
                              />
                            </span>
                          </button>
                        )
                      })}

                      <div className="flex flex-col gap-1 border-r border-gray-200 dark:border-slate-700 pr-3">
                        <button
                          onClick={() => setAllInCategory(cat, true)}
                          disabled={allOn}
                          className="px-2 py-0.5 text-[10px] text-green-700 dark:text-green-400 hover:underline disabled:opacity-30 disabled:no-underline"
                        >
                          تفعيل
                        </button>
                        <button
                          onClick={() => setAllInCategory(cat, false)}
                          disabled={allOff}
                          className="px-2 py-0.5 text-[10px] text-red-700 dark:text-red-400 hover:underline disabled:opacity-30 disabled:no-underline"
                        >
                          كتم
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Help footer */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-900 dark:text-blue-200">
              <p className="font-semibold mb-1">كيف يعمل النظام؟</p>
              <ul className="space-y-1 text-blue-800 dark:text-blue-300 list-disc pr-5">
                <li>الإشعارات تُرسَل افتراضياً بكل الفئات والقنوات</li>
                <li>تكتم الفئة لتتوقف عن استلامها (إلا الحرجة)</li>
                <li>تفضيلاتك خاصة بك فقط — لا تؤثر على باقى الفريق</li>
                <li>التغيير يسرى فوراً على الإشعارات الجديدة</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
