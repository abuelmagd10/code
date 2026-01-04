"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { canAction } from "@/lib/authz"
import { Truck, Plus, Trash2, Edit2, Save, X, Eye, EyeOff, CheckCircle, XCircle, Globe, Key, Building2, Settings2, TestTube, Loader2, Shield, FlaskConical } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"

interface ShippingProvider {
  id: string
  provider_name: string
  provider_code: string | null
  base_url: string
  api_key: string | null
  api_secret: string | null
  account_number: string | null
  default_service: string | null
  auto_print_label: boolean
  is_active: boolean
  webhook_url: string | null
  created_at: string
  // الحقول الجديدة
  auth_type: 'api_key' | 'oauth2' | 'basic' | 'custom' | null
  environment: 'sandbox' | 'production' | null
  sandbox_url: string | null
  webhook_secret: string | null
}

export default function ShippingSettingsPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [providers, setProviders] = useState<ShippingProvider[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [canRead, setCanRead] = useState(false)
  const [canWrite, setCanWrite] = useState(false)
  const [permChecked, setPermChecked] = useState(false)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<ShippingProvider | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    provider_name: "",
    provider_code: "",
    base_url: "",
    api_key: "",
    api_secret: "",
    account_number: "",
    default_service: "",
    auto_print_label: false,
    is_active: true,
    webhook_url: "",
    // الحقول الجديدة
    auth_type: "api_key" as 'api_key' | 'oauth2' | 'basic' | 'custom',
    environment: "sandbox" as 'sandbox' | 'production',
    sandbox_url: "",
    webhook_secret: ""
  })

  // حالة اختبار الاتصال
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const t = (en: string, ar: string) => appLang === 'en' ? en : ar

  useEffect(() => {
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch { }
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])

  useEffect(() => {
    const checkPerms = async () => {
      const [read, write] = await Promise.all([
        canAction(supabase, "shipping_providers", "read"),
        canAction(supabase, "shipping_providers", "write")
      ])
      setCanRead(read)
      setCanWrite(write)
      setPermChecked(true)
    }
    checkPerms()
  }, [supabase])

  useEffect(() => {
    if (permChecked && canRead) {
      loadData()
    }

    // 🔄 إعادة تحميل البيانات عند تبديل الشركة
    const handleCompanyUpdate = () => {
      if (permChecked && canRead) {
        loadData()
      }
    }

    window.addEventListener('company_updated', handleCompanyUpdate)

    return () => {
      window.removeEventListener('company_updated', handleCompanyUpdate)
    }
  }, [permChecked, canRead])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const { getActiveCompanyId } = await import("@/lib/company")
      const cid = await getActiveCompanyId(supabase)
      if (!cid) return
      setCompanyId(cid)

      const { data, error } = await supabase
        .from("shipping_providers")
        .select("*")
        .eq("company_id", cid)
        .order("created_at", { ascending: false })

      if (error) throw error
      setProviders(data || [])
    } catch (err) {
      console.error("Error loading shipping providers:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const openAddDialog = () => {
    setEditingProvider(null)
    setFormData({
      provider_name: "", provider_code: "", base_url: "", api_key: "", api_secret: "",
      account_number: "", default_service: "", auto_print_label: false, is_active: true, webhook_url: "",
      auth_type: "api_key", environment: "sandbox", sandbox_url: "", webhook_secret: ""
    })
    setShowApiKey(false)
    setShowSecret(false)
    setTestResult(null)
    setIsDialogOpen(true)
  }

  const openEditDialog = (provider: ShippingProvider) => {
    setEditingProvider(provider)
    setFormData({
      provider_name: provider.provider_name || "",
      provider_code: provider.provider_code || "",
      base_url: provider.base_url || "",
      api_key: provider.api_key || "",
      api_secret: provider.api_secret || "",
      account_number: provider.account_number || "",
      default_service: provider.default_service || "",
      auto_print_label: provider.auto_print_label || false,
      is_active: provider.is_active !== false,
      webhook_url: provider.webhook_url || "",
      auth_type: provider.auth_type || "api_key",
      environment: provider.environment || "sandbox",
      sandbox_url: provider.sandbox_url || "",
      webhook_secret: provider.webhook_secret || ""
    })
    setShowApiKey(false)
    setShowSecret(false)
    setTestResult(null)
    setIsDialogOpen(true)
  }

  const handleSave = async () => {
    if (!companyId || !formData.provider_name || !formData.base_url) {
      toastActionError(toast, t("Save", "الحفظ"), t("Provider", "شركة الشحن"), t("Name and Base URL are required", "الاسم ورابط API مطلوبان"))
      return
    }

    try {
      setIsSaving(true)
      const { data: { user } } = await supabase.auth.getUser()

      const providerData = {
        company_id: companyId,
        provider_name: formData.provider_name,
        provider_code: formData.provider_code || null,
        base_url: formData.base_url,
        api_key: formData.api_key || null,
        api_secret: formData.api_secret || null,
        account_number: formData.account_number || null,
        default_service: formData.default_service || null,
        auto_print_label: formData.auto_print_label,
        is_active: formData.is_active,
        webhook_url: formData.webhook_url || null,
        auth_type: formData.auth_type,
        environment: formData.environment,
        sandbox_url: formData.sandbox_url || null,
        webhook_secret: formData.webhook_secret || null,
        updated_at: new Date().toISOString()
      }

      if (editingProvider) {
        const { error } = await supabase
          .from("shipping_providers")
          .update(providerData)
          .eq("id", editingProvider.id)
        if (error) throw error
        toastActionSuccess(toast, t("Update", "التحديث"), t("Shipping Provider", "شركة الشحن"))
      } else {
        const { error } = await supabase
          .from("shipping_providers")
          .insert({ ...providerData, created_by: user?.id })
        if (error) throw error
        toastActionSuccess(toast, t("Create", "الإنشاء"), t("Shipping Provider", "شركة الشحن"))
      }

      setIsDialogOpen(false)
      loadData()
    } catch (err: any) {
      console.error("Error saving provider:", err)
      toastActionError(toast, t("Save", "الحفظ"), t("Provider", "شركة الشحن"), err?.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t("Are you sure you want to delete this provider?", "هل أنت متأكد من حذف شركة الشحن هذه؟"))) return

    try {
      const { error } = await supabase.from("shipping_providers").delete().eq("id", id)
      if (error) throw error
      toastActionSuccess(toast, t("Delete", "الحذف"), t("Shipping Provider", "شركة الشحن"))
      loadData()
    } catch (err: any) {
      toastActionError(toast, t("Delete", "الحذف"), t("Provider", "شركة الشحن"), err?.message)
    }
  }

  const toggleActive = async (provider: ShippingProvider) => {
    try {
      const { error } = await supabase
        .from("shipping_providers")
        .update({ is_active: !provider.is_active, updated_at: new Date().toISOString() })
        .eq("id", provider.id)
      if (error) throw error
      loadData()
    } catch (err: any) {
      toastActionError(toast, t("Update", "التحديث"), t("Provider", "شركة الشحن"), err?.message)
    }
  }

  // اختبار الاتصال بشركة الشحن
  const testConnection = async () => {
    if (!formData.base_url) {
      setTestResult({ success: false, message: t("Base URL is required", "رابط API مطلوب") })
      return
    }

    setIsTesting(true)
    setTestResult(null)

    try {
      const response = await fetch('/api/shipping/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_config: {
            provider_name: formData.provider_name,
            provider_code: formData.provider_code,
            auth_type: formData.auth_type,
            environment: formData.environment,
            base_url: formData.base_url,
            sandbox_url: formData.sandbox_url,
            api_key: formData.api_key,
            api_secret: formData.api_secret,
            account_number: formData.account_number,
          }
        })
      })

      const result = await response.json()
      setTestResult({
        success: result.success,
        message: result.message || (result.success ? t("Connection successful!", "تم الاتصال بنجاح!") : t("Connection failed", "فشل الاتصال"))
      })
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || t("Connection test failed", "فشل اختبار الاتصال") })
    } finally {
      setIsTesting(false)
    }
  }

  // Permission check
  if (permChecked && !canRead) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
          <Alert className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
            <AlertDescription className="text-red-800 dark:text-red-200">
              {t("You do not have permission to view shipping settings.", "ليس لديك صلاحية لعرض إعدادات الشحن.")}
            </AlertDescription>
          </Alert>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <div className="space-y-6">
          {/* Header */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardContent className="py-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl shadow-lg">
                    <Truck className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {t("Shipping Integration", "تكامل الشحن")}
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {t("Configure shipping providers and API settings", "إعداد شركات الشحن وبيانات API")}
                    </p>
                  </div>
                </div>
                {canWrite && (
                  <Button onClick={openAddDialog} className="bg-cyan-600 hover:bg-cyan-700">
                    <Plus className="w-4 h-4 ml-2" />
                    {t("Add Provider", "إضافة شركة شحن")}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Instructions Card */}
          <Card className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border-blue-200 dark:border-blue-800">
            <CardContent className="py-5">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                  <Settings2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                    {t("How to configure shipping options", "كيفية إعداد خيارات الشحن")}
                  </h3>
                  <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-2 list-disc mr-5">
                    <li>
                      <strong>{t("External shipping company:", "شركة شحن خارجية:")}</strong> {t("Add the company name (e.g., Aramex, SMSA) and enter API details if available for integration.", "أضف اسم الشركة (مثل أرامكس، سمسا) وأدخل بيانات API إن وجدت للتكامل.")}
                    </li>
                    <li>
                      <strong>{t("Branch Pickup:", "الاستلام من الموقع:")}</strong> {t("Add an entry named 'Branch Pickup' or 'استلام من الموقع' with any value in the API URL field (e.g., 'manual').", "أضف شركة باسم 'استلام من الموقع' وضع أي قيمة في حقل رابط API (مثل 'manual').")}
                    </li>
                    <li>
                      <strong>{t("Internal Delivery:", "مندوب داخلي:")}</strong> {t("Add an entry named 'Internal Delivery' or 'مندوب داخلي' for your own delivery staff.", "أضف شركة باسم 'مندوب داخلي' لطاقم التوصيل الخاص بك.")}
                    </li>
                    <li>
                      <strong>{t("Express/Standard Shipping:", "شحن سريع/عادي:")}</strong> {t("You can create separate entries for different service levels.", "يمكنك إنشاء إدخالات منفصلة لمستويات الخدمة المختلفة.")}
                    </li>
                  </ul>
                  <p className="text-xs text-blue-600 dark:text-blue-300 mt-3 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    {t("All shipping options added here will appear in invoice and order forms.", "جميع خيارات الشحن المضافة هنا ستظهر في نماذج الفواتير والأوامر.")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Providers List */}
          {isLoading ? (
            <Card className="dark:bg-gray-800">
              <CardContent className="py-8 text-center text-gray-500">
                {t("Loading...", "جاري التحميل...")}
              </CardContent>
            </Card>
          ) : providers.length === 0 ? (
            <Card className="dark:bg-gray-800">
              <CardContent className="py-12 text-center">
                <Truck className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  {t("No shipping providers configured yet", "لم يتم إعداد شركات شحن بعد")}
                </p>
                {canWrite && (
                  <Button onClick={openAddDialog} variant="outline">
                    <Plus className="w-4 h-4 ml-2" />
                    {t("Add Your First Provider", "أضف شركة الشحن الأولى")}
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {providers.map((provider) => (
                <Card key={provider.id} className="dark:bg-gray-800 hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${provider.is_active ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
                          <Truck className={`w-5 h-5 ${provider.is_active ? 'text-green-600' : 'text-gray-400'}`} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white">{provider.provider_name}</h3>
                          {provider.provider_code && (
                            <p className="text-xs text-gray-500">{provider.provider_code}</p>
                          )}
                        </div>
                      </div>
                      <Badge variant={provider.is_active ? "default" : "secondary"} className={provider.is_active ? "bg-green-100 text-green-700" : ""}>
                        {provider.is_active ? (
                          <><CheckCircle className="w-3 h-3 ml-1" />{t("Active", "نشط")}</>
                        ) : (
                          <><XCircle className="w-3 h-3 ml-1" />{t("Inactive", "غير نشط")}</>
                        )}
                      </Badge>
                    </div>

                    {/* شارات البيئة ونوع المصادقة */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      <Badge variant="outline" className={provider.environment === 'production' ? 'border-green-500 text-green-600' : 'border-yellow-500 text-yellow-600'}>
                        {provider.environment === 'production' ? (
                          <><Shield className="w-3 h-3 ml-1" />{t("Production", "إنتاج")}</>
                        ) : (
                          <><FlaskConical className="w-3 h-3 ml-1" />{t("Sandbox", "تجريبي")}</>
                        )}
                      </Badge>
                      {provider.auth_type && (
                        <Badge variant="outline" className="border-blue-500 text-blue-600">
                          <Key className="w-3 h-3 ml-1" />
                          {provider.auth_type === 'api_key' ? 'API Key' :
                            provider.auth_type === 'oauth2' ? 'OAuth2' :
                              provider.auth_type === 'basic' ? 'Basic Auth' : 'Custom'}
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                        <Globe className="w-4 h-4" />
                        <span className="truncate">{provider.base_url}</span>
                      </div>
                      {provider.account_number && (
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                          <Building2 className="w-4 h-4" />
                          <span>{t("Account:", "الحساب:")} {provider.account_number}</span>
                        </div>
                      )}
                      {provider.default_service && (
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                          <Settings2 className="w-4 h-4" />
                          <span>{t("Service:", "الخدمة:")} {provider.default_service}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                        <Key className="w-4 h-4" />
                        <span>{provider.api_key ? "••••••••" : t("No API Key", "بدون مفتاح API")}</span>
                      </div>
                    </div>

                    {canWrite && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t dark:border-gray-700">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">{t("Auto Print", "طباعة تلقائية")}</span>
                          <Badge variant="outline" className="text-xs">
                            {provider.auto_print_label ? t("Yes", "نعم") : t("No", "لا")}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => toggleActive(provider)}>
                            {provider.is_active ? t("Deactivate", "تعطيل") : t("Activate", "تفعيل")}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(provider)}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => handleDelete(provider.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Add/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Truck className="w-5 h-5" />
                {editingProvider ? t("Edit Shipping Provider", "تعديل شركة الشحن") : t("Add Shipping Provider", "إضافة شركة شحن")}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* الاسم والرمز */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>{t("Provider Name", "اسم شركة الشحن")} <span className="text-red-500">*</span></Label>
                  <Input value={formData.provider_name} onChange={(e) => setFormData({ ...formData, provider_name: e.target.value })} placeholder={t("e.g. Aramex, DHL", "مثال: أرامكس، DHL")} />
                </div>
                <div>
                  <Label>{t("Provider Code", "رمز الشركة")}</Label>
                  <Input value={formData.provider_code} onChange={(e) => setFormData({ ...formData, provider_code: e.target.value })} placeholder="aramex, bosta, dhl, manual" />
                </div>
              </div>

              {/* نوع المصادقة والبيئة */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>{t("Authentication Type", "نوع المصادقة")}</Label>
                  <Select value={formData.auth_type} onValueChange={(v: any) => setFormData({ ...formData, auth_type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="api_key">API Key</SelectItem>
                      <SelectItem value="basic">Basic Auth (Username/Password)</SelectItem>
                      <SelectItem value="oauth2">OAuth 2.0</SelectItem>
                      <SelectItem value="custom">{t("Custom", "مخصص")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("Environment", "البيئة")}</Label>
                  <Select value={formData.environment} onValueChange={(v: any) => setFormData({ ...formData, environment: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sandbox">
                        <div className="flex items-center gap-2">
                          <FlaskConical className="w-4 h-4 text-yellow-500" />
                          {t("Sandbox (Testing)", "تجريبي (اختبار)")}
                        </div>
                      </SelectItem>
                      <SelectItem value="production">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-green-500" />
                          {t("Production (Live)", "إنتاج (فعلي)")}
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* روابط API */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>{t("Production URL", "رابط الإنتاج")} <span className="text-red-500">*</span></Label>
                  <Input value={formData.base_url} onChange={(e) => setFormData({ ...formData, base_url: e.target.value })} placeholder="https://api.provider.com/v1" dir="ltr" />
                </div>
                <div>
                  <Label>{t("Sandbox URL", "رابط الاختبار")}</Label>
                  <Input value={formData.sandbox_url} onChange={(e) => setFormData({ ...formData, sandbox_url: e.target.value })} placeholder="https://sandbox.provider.com/v1" dir="ltr" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>{t("API Key", "مفتاح API")}</Label>
                  <div className="relative">
                    <Input type={showApiKey ? "text" : "password"} value={formData.api_key} onChange={(e) => setFormData({ ...formData, api_key: e.target.value })} dir="ltr" />
                    <Button type="button" variant="ghost" size="sm" className="absolute left-1 top-1/2 -translate-y-1/2" onClick={() => setShowApiKey(!showApiKey)}>
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                <div>
                  <Label>{t("API Secret / Password", "كلمة السر / Secret")}</Label>
                  <div className="relative">
                    <Input type={showSecret ? "text" : "password"} value={formData.api_secret} onChange={(e) => setFormData({ ...formData, api_secret: e.target.value })} dir="ltr" />
                    <Button type="button" variant="ghost" size="sm" className="absolute left-1 top-1/2 -translate-y-1/2" onClick={() => setShowSecret(!showSecret)}>
                      {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>{t("Account Number", "رقم الحساب")}</Label>
                  <Input value={formData.account_number} onChange={(e) => setFormData({ ...formData, account_number: e.target.value })} />
                </div>
                <div>
                  <Label>{t("Default Service", "الخدمة الافتراضية")}</Label>
                  <Input value={formData.default_service} onChange={(e) => setFormData({ ...formData, default_service: e.target.value })} placeholder={t("e.g. Express, Standard", "مثال: Express, Standard")} />
                </div>
              </div>

              {/* Webhook */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>{t("Webhook URL", "رابط Webhook")}</Label>
                  <Input value={formData.webhook_url} onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })} placeholder="https://your-domain.com/api/shipping/webhook/provider" dir="ltr" />
                </div>
                <div>
                  <Label>{t("Webhook Secret", "مفتاح Webhook السري")}</Label>
                  <Input value={formData.webhook_secret} onChange={(e) => setFormData({ ...formData, webhook_secret: e.target.value })} placeholder={t("For signature verification", "للتحقق من التوقيع")} dir="ltr" />
                </div>
              </div>

              {/* الخيارات */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800 rounded-lg">
                <div className="flex items-center gap-3">
                  <Switch checked={formData.auto_print_label} onCheckedChange={(v) => setFormData({ ...formData, auto_print_label: v })} />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{t("Auto Print Label", "طباعة الملصق تلقائياً")}</p>
                    <p className="text-xs text-gray-500">{t("Automatically print shipping label after creation", "طباعة ملصق الشحن تلقائياً بعد إنشاء الشحنة")}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800 rounded-lg">
                <div className="flex items-center gap-3">
                  <Switch checked={formData.is_active} onCheckedChange={(v) => setFormData({ ...formData, is_active: v })} />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{t("Active", "نشط")}</p>
                    <p className="text-xs text-gray-500">{t("Enable this provider for shipments", "تفعيل هذه الشركة للشحنات")}</p>
                  </div>
                </div>
              </div>

              {/* زر اختبار الاتصال */}
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-blue-900 dark:text-blue-100">{t("Test Connection", "اختبار الاتصال")}</p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">{t("Verify API credentials before saving", "تحقق من بيانات API قبل الحفظ")}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={testConnection}
                    disabled={isTesting || !formData.base_url}
                    className="border-blue-300 text-blue-700 hover:bg-blue-100"
                  >
                    {isTesting ? (
                      <><Loader2 className="w-4 h-4 ml-2 animate-spin" />{t("Testing...", "جاري الاختبار...")}</>
                    ) : (
                      <><TestTube className="w-4 h-4 ml-2" />{t("Test", "اختبار")}</>
                    )}
                  </Button>
                </div>
                {testResult && (
                  <div className={`mt-3 p-2 rounded text-sm flex items-center gap-2 ${testResult.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {testResult.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    {testResult.message}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                <X className="w-4 h-4 ml-2" />
                {t("Cancel", "إلغاء")}
              </Button>
              <Button onClick={handleSave} disabled={isSaving} className="bg-cyan-600 hover:bg-cyan-700">
                <Save className="w-4 h-4 ml-2" />
                {isSaving ? t("Saving...", "جاري الحفظ...") : t("Save", "حفظ")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}

