"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  CheckCircle2,
  CopyPlus,
  Factory,
  FileSearch,
  Loader2,
  Package2,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Trash2,
  WandSparkles,
} from "lucide-react"
import { PageGuard } from "@/components/page-guard"
import { CompanyHeader } from "@/components/company-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ERPPageHeader } from "@/components/erp-page-header"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { useAccess } from "@/lib/access-context"
import {
  BOM_LINE_TYPE_OPTIONS,
  BOM_USAGE_OPTIONS,
  type BomDetail,
  type BomLineDraft,
  type BomLineSubstituteDraft,
  type BomVersionCreatePayload,
  type BomVersionSnapshot,
  type BomVersionStatus,
  type BranchOption,
  type ExplosionPreviewPayload,
  type ExplosionPreviewResult,
  type ProductOption,
  approveBomVersion,
  bomSnapshotToDraftLines,
  buildBranchLabel,
  buildProductLabel,
  canApproveVersion,
  canDeleteVersion,
  canRejectVersion,
  canSetDefaultVersion,
  canSubmitVersion,
  createBomVersion,
  deleteBom,
  deleteBomVersion,
  fetchBomDetail,
  fetchBomVersionSnapshot,
  fetchBranchOptions,
  fetchManufacturingProductOptions,
  formatDateOnly,
  formatDateTime,
  formatQuantity,
  getVersionStatusLabel,
  getVersionStatusVariant,
  getBomLineProductFilterMessage,
  isBomLineProductOptionAllowed,
  isVersionHeaderEditable,
  isVersionStructureEditable,
  isoToLocalDateTimeInput,
  localDateTimeInputToIso,
  rejectBomVersion,
  runExplosionPreview,
  setDefaultBomVersion,
  submitBomVersion,
  updateBom,
  updateBomStructure,
  updateBomVersion,
} from "@/lib/manufacturing/bom-ui"
import { readAppLanguage, type AppLang } from "@/lib/manufacturing/manufacturing-ui"
import { WarehouseSelector } from "@/components/manufacturing/manufacturing-selectors"
import { RawMaterialWarehousePicker } from "@/components/manufacturing/raw-material-warehouse-picker"

interface BomDetailPageProps {
  bomId: string
}

interface BomHeaderFormState {
  bom_code: string
  bom_name: string
  description: string
  is_active: boolean
  /** Phase 1: default source warehouse for material issue */
  source_warehouse_id: string | null
}

interface BomVersionFormState {
  effective_from: string
  effective_to: string
  base_output_qty: string
  change_summary: string
  notes: string
}

const EMPTY_VERSION_FORM: BomVersionFormState = {
  effective_from: "",
  effective_to: "",
  base_output_qty: "1",
  change_summary: "",
  notes: "",
}

const EMPTY_CREATE_VERSION_FORM: BomVersionCreatePayload = {
  clone_from_version_id: null,
  effective_from: null,
  effective_to: null,
  base_output_qty: 1,
  change_summary: "",
  notes: "",
}

const EMPTY_PREVIEW_FORM: ExplosionPreviewPayload = {
  input_quantity: 1,
  as_of_date: null,
  include_substitutes: true,
  substitute_strategy: "primary_only",
  include_by_products: true,
  include_co_products: true,
  explode_levels: 1,
  respect_effective_dates: true,
}

function getVersionLockMessage(status: BomVersionStatus, lang: AppLang = "ar") {
  switch (status) {
    case "pending_approval":
      return lang === "en"
        ? "This version is locked during the approval cycle. You can only approve or reject it if you have the permission."
        : "هذه النسخة مقفلة أثناء دورة الاعتماد. يمكنك فقط اعتمادها أو رفضها إذا كانت لديك الصلاحية."
    case "approved":
      return lang === "en"
        ? "This version is already approved. Fields and structure are read-only, and it can only be set as the default version."
        : "هذه النسخة معتمدة بالفعل. الحقول والهيكل للقراءة فقط، ويمكن فقط تعيينها كنسخة افتراضية."
    case "superseded":
      return lang === "en"
        ? "This version has been superseded and is operationally read-only."
        : "هذه النسخة مستبدلة وتشغيلية للقراءة فقط."
    case "archived":
      return lang === "en"
        ? "This version is archived and does not accept any modification."
        : "هذه النسخة مؤرشفة ولا تقبل أي تعديل."
    default:
      return lang === "en" ? "This version is editable." : "هذه النسخة قابلة للتحرير."
  }
}

function createEmptyLine(nextLineNo: number): BomLineDraft {
  return {
    line_no: nextLineNo,
    component_product_id: "",
    line_type: "component",
    quantity_per: 1,
    scrap_percent: 0,
    issue_uom: "",
    is_optional: false,
    notes: "",
    substitutes: [],
  }
}

function createEmptySubstitute(): BomLineSubstituteDraft {
  return {
    substitute_product_id: "",
    substitute_quantity: 1,
    priority: 1,
    effective_from: "",
    effective_to: "",
    notes: "",
  }
}

export function BomDetailPage({ bomId }: BomDetailPageProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { canAction, isReady: accessReady } = useAccess()

  const canRead = accessReady ? canAction("manufacturing_boms", "read") : false
  const canWrite = accessReady ? canAction("manufacturing_boms", "write") : false
  const canUpdate = accessReady ? canAction("manufacturing_boms", "update") : false
  const canDelete = accessReady ? canAction("manufacturing_boms", "delete") : false
  const canApprove = accessReady ? canAction("manufacturing_boms", "approve") : false

  const [appLang, setAppLang] = useState<AppLang>("ar")

  useEffect(() => {
    const handler = () => setAppLang(readAppLanguage())
    const storageHandler = (event: StorageEvent) => {
      if (event.key === "app_language") handler()
    }
    handler()
    window.addEventListener("app_language_changed", handler)
    window.addEventListener("storage", storageHandler)

    return () => {
      window.removeEventListener("app_language_changed", handler)
      window.removeEventListener("storage", storageHandler)
    }
  }, [])

  const t = (en: string, ar: string) => (appLang === "en" ? en : ar)

  const [bom, setBom] = useState<BomDetail | null>(null)
  const [versionSnapshot, setVersionSnapshot] = useState<BomVersionSnapshot | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])

  const [loadingBom, setLoadingBom] = useState(true)
  const [loadingVersion, setLoadingVersion] = useState(false)
  const [savingHeader, setSavingHeader] = useState(false)
  const [savingVersionHeader, setSavingVersionHeader] = useState(false)
  const [savingStructure, setSavingStructure] = useState(false)
  const [runningAction, setRunningAction] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const [headerForm, setHeaderForm] = useState<BomHeaderFormState>({
    bom_code: "",
    bom_name: "",
    description: "",
    is_active: true,
    source_warehouse_id: null,
  })
  const [versionForm, setVersionForm] = useState<BomVersionFormState>(EMPTY_VERSION_FORM)
  const [structureDraft, setStructureDraft] = useState<BomLineDraft[]>([])
  const [createVersionOpen, setCreateVersionOpen] = useState(false)
  const [createVersionForm, setCreateVersionForm] = useState<BomVersionCreatePayload>(EMPTY_CREATE_VERSION_FORM)
  const [confirmAction, setConfirmAction] = useState<null | "delete-bom" | "delete-version" | "approve" | "set-default">(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const [previewForm, setPreviewForm] = useState<ExplosionPreviewPayload>(EMPTY_PREVIEW_FORM)
  const [previewResult, setPreviewResult] = useState<ExplosionPreviewResult | null>(null)

  const branchMap = useMemo(
    () => Object.fromEntries(branches.map((branch) => [branch.id, branch])),
    [branches]
  )

  const productMap = useMemo(
    () => Object.fromEntries(products.map((product) => [product.id, product])),
    [products]
  )

  const ownerProduct = useMemo(() => {
    if (!bom?.product_id) return null
    return productMap[bom.product_id] || bom.product || null
  }, [bom, productMap])

  const selectedVersion = versionSnapshot?.version || bom?.versions.find((version) => version.id === selectedVersionId) || null
  const versionEditable = selectedVersion ? isVersionHeaderEditable(selectedVersion.status) : false
  const structureEditable = selectedVersion ? isVersionStructureEditable(selectedVersion.status) : false
  const selectedVersionPersistedLineCount =
    versionSnapshot?.version.id === selectedVersionId ? versionSnapshot.lines.length : null
  const selectedVersionHasNoPersistedLines = selectedVersionPersistedLineCount === 0

  const hydrateHeaderForm = useCallback((detail: BomDetail) => {
    setHeaderForm({
      bom_code: detail.bom_code || "",
      bom_name: detail.bom_name || "",
      description: detail.description || "",
      is_active: Boolean(detail.is_active),
      source_warehouse_id: detail.source_warehouse_id ?? null,
    })
  }, [])

  const hydrateVersionState = useCallback((snapshot: BomVersionSnapshot) => {
    setVersionSnapshot(snapshot)
    setVersionForm({
      effective_from: isoToLocalDateTimeInput(snapshot.version.effective_from),
      effective_to: isoToLocalDateTimeInput(snapshot.version.effective_to),
      base_output_qty: String(snapshot.version.base_output_qty ?? 1),
      change_summary: snapshot.version.change_summary || "",
      notes: snapshot.version.notes || "",
    })
    setStructureDraft(bomSnapshotToDraftLines(snapshot.lines))
    setPreviewResult(null)
  }, [])

  const resetVersionState = useCallback(() => {
    setVersionSnapshot(null)
    setVersionForm(EMPTY_VERSION_FORM)
    setStructureDraft([])
    setPreviewResult(null)
  }, [])

  const loadLookups = useCallback(async () => {
    try {
      const [branchOptions, productOptions] = await Promise.all([
        fetchBranchOptions(),
        fetchManufacturingProductOptions(),
      ])
      setBranches(branchOptions)
      setProducts(productOptions)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t("Failed to load reference data", "تعذر تحميل البيانات المرجعية"),
        description: error?.message || t("An error occurred while loading branches and products", "حدث خطأ أثناء تحميل الفروع والمنتجات"),
      })
    }
  }, [toast, appLang])

  const loadBomDetailData = useCallback(async (preferredVersionId?: string | null) => {
    try {
      setLoadingBom(true)
      const detail = await fetchBomDetail(bomId)
      setBom(detail)
      hydrateHeaderForm(detail)

      const resolvedVersionId =
        (preferredVersionId && detail.versions.some((version) => version.id === preferredVersionId) && preferredVersionId) ||
        (selectedVersionId && detail.versions.some((version) => version.id === selectedVersionId) && selectedVersionId) ||
        detail.versions[0]?.id ||
        null

      setSelectedVersionId(resolvedVersionId)
      if (!resolvedVersionId) {
        resetVersionState()
      }

      return resolvedVersionId
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t("Failed to load BOM details", "تعذر تحميل تفاصيل هيكل المواد"),
        description: error?.message || t("An error occurred while loading the record", "حدث خطأ أثناء تحميل السجل"),
      })
      setBom(null)
      setSelectedVersionId(null)
      resetVersionState()
      return null
    } finally {
      setLoadingBom(false)
    }
  }, [bomId, hydrateHeaderForm, resetVersionState, selectedVersionId, toast, appLang])

  const loadSelectedVersion = useCallback(async (versionId: string) => {
    try {
      setLoadingVersion(true)
      const snapshot = await fetchBomVersionSnapshot(versionId)
      hydrateVersionState(snapshot)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t("Failed to load version data", "تعذر تحميل بيانات النسخة"),
        description: error?.message || t("An error occurred while loading the selected version", "حدث خطأ أثناء تحميل النسخة المحددة"),
      })
      resetVersionState()
    } finally {
      setLoadingVersion(false)
    }
  }, [hydrateVersionState, resetVersionState, toast, appLang])

  const refreshWorkspace = useCallback(async (preferredVersionId?: string | null) => {
    const resolvedVersionId = await loadBomDetailData(preferredVersionId)
    if (resolvedVersionId) {
      await loadSelectedVersion(resolvedVersionId)
    }
  }, [loadBomDetailData, loadSelectedVersion])

  useEffect(() => {
    loadLookups()
  }, [loadLookups])

  useEffect(() => {
    if (!canRead) return
    loadBomDetailData()
  }, [canRead, loadBomDetailData])

  useEffect(() => {
    if (!selectedVersionId) return
    loadSelectedVersion(selectedVersionId)
  }, [selectedVersionId, loadSelectedVersion])

  const handleSaveHeader = async () => {
    if (!bom) return
    if (!headerForm.bom_code.trim() || !headerForm.bom_name.trim()) {
      toast({
        variant: "destructive",
        title: t("Basic details required", "البيانات الأساسية مطلوبة"),
        description: t("The BOM code and name are required before saving.", "كود هيكل المواد واسمه مطلوبان قبل الحفظ."),
      })
      return
    }
    // v3.74.268 — اشتراط مخزن صرف الخامات: أمر الإنتاج بيرث منه
    if (!headerForm.source_warehouse_id) {
      toast({
        variant: "destructive",
        title: t("Raw material issue warehouse required", "محتاجين مخزن صرف الخامات"),
        description: t("Select a warehouse — every production order created from this BOM will draw its raw materials from it.", "اختر مخزن، عشان كل أمر إنتاج بيتعمل من القائمة دى يسحب منه الخامات."),
      })
      return
    }

    try {
      setSavingHeader(true)
      await updateBom(bom.id, {
        bom_code: headerForm.bom_code.trim(),
        bom_name: headerForm.bom_name.trim(),
        description: headerForm.description.trim() || null,
        is_active: headerForm.is_active,
        source_warehouse_id: headerForm.source_warehouse_id || null,
      })

      toast({
        title: t("BOM details saved", "تم حفظ بيانات هيكل المواد"),
        description: t("The main details were updated successfully.", "تم تحديث البيانات الرئيسية بنجاح."),
      })

      await refreshWorkspace(selectedVersionId)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t("Failed to save BOM details", "تعذر حفظ بيانات هيكل المواد"),
        description: error?.message || t("An error occurred while saving", "حدث خطأ أثناء الحفظ"),
      })
      await refreshWorkspace(selectedVersionId)
    } finally {
      setSavingHeader(false)
    }
  }

  const handleDeleteBom = async () => {
    if (!bom) return

    try {
      setRunningAction("delete-bom")
      await deleteBom(bom.id)
      toast({
        title: t("BOM deleted", "تم حذف هيكل المواد"),
        description: t("The BOM and all its versions were deleted successfully.", "تم حذف هيكل المواد وجميع نسخه بنجاح."),
      })
      router.push("/manufacturing/boms")
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t("Failed to delete BOM", "تعذر حذف هيكل المواد"),
        description: error?.message || t("Deletion is not possible because approved versions exist or permissions are insufficient.", "لا يمكن الحذف لوجود نسخ معتمدة أو لعدم كفاية الصلاحيات."),
      })
      setRunningAction(null)
      await refreshWorkspace(selectedVersionId)
    }
  }

  const handleCreateVersion = async () => {
    if (!bom) return
    try {
      setRunningAction("create-version")
      const result = await createBomVersion(bom.id, {
        clone_from_version_id: createVersionForm.clone_from_version_id || null,
        effective_from: createVersionForm.effective_from || null,
        effective_to: createVersionForm.effective_to || null,
        base_output_qty: Number(createVersionForm.base_output_qty || 1),
        change_summary: typeof createVersionForm.change_summary === "string" ? createVersionForm.change_summary.trim() || null : null,
        notes: typeof createVersionForm.notes === "string" ? createVersionForm.notes.trim() || null : null,
      })

      setCreateVersionOpen(false)
      setCreateVersionForm(EMPTY_CREATE_VERSION_FORM)
      toast({
        title: t("New version created", "تم إنشاء نسخة جديدة"),
        description: result.version_no
          ? t(`Version v${result.version_no} is now ready for editing.`, `النسخة v${result.version_no} جاهزة للتحرير الآن.`)
          : t("The version was created successfully.", "تم إنشاء النسخة بنجاح."),
      })
      await refreshWorkspace(result.bom_version_id || selectedVersionId)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t("Failed to create version", "تعذر إنشاء النسخة"),
        description: error?.message || t("An error occurred while creating the BOM version", "حدث خطأ أثناء إنشاء نسخة هيكل المواد"),
      })
    } finally {
      setRunningAction(null)
    }
  }

  const handleSaveVersionHeader = async () => {
    if (!selectedVersionId) return

    try {
      setSavingVersionHeader(true)
      await updateBomVersion(selectedVersionId, {
        effective_from: localDateTimeInputToIso(versionForm.effective_from),
        effective_to: localDateTimeInputToIso(versionForm.effective_to),
        base_output_qty: Number(versionForm.base_output_qty || 1),
        change_summary: versionForm.change_summary.trim() || null,
        notes: versionForm.notes.trim() || null,
      })

      toast({
        title: t("Version details saved", "تم حفظ بيانات النسخة"),
        description: t("The version details were updated successfully.", "تم تحديث بيانات النسخة بنجاح."),
      })

      await refreshWorkspace(selectedVersionId)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t("Failed to save version details", "تعذر حفظ بيانات النسخة"),
        description: error?.message || t("An error occurred while saving", "حدث خطأ أثناء الحفظ"),
      })
      await refreshWorkspace(selectedVersionId)
    } finally {
      setSavingVersionHeader(false)
    }
  }

  const handleDeleteVersion = async () => {
    if (!selectedVersionId || !selectedVersion) return

    try {
      setRunningAction("delete-version")
      await deleteBomVersion(selectedVersionId)
      toast({
        title: t("Version deleted", "تم حذف النسخة"),
        description: t(`Version v${selectedVersion.version_no} was deleted successfully.`, `تم حذف v${selectedVersion.version_no} بنجاح.`),
      })

      const nextVersionId = bom?.versions.find((version) => version.id !== selectedVersionId)?.id || null
      await refreshWorkspace(nextVersionId)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t("Failed to delete version", "تعذر حذف النسخة"),
        description: error?.message || t("Deletion was rejected due to the current version status.", "الحذف مرفوض بسبب حالة النسخة الحالية."),
      })
      await refreshWorkspace(selectedVersionId)
    } finally {
      setRunningAction(null)
    }
  }

  const handleSaveStructure = async () => {
    if (!selectedVersionId) return

    const sanitizedLines = structureDraft.map((line) => ({
      line_no: Number(line.line_no),
      component_product_id: line.component_product_id,
      line_type: line.line_type,
      quantity_per: Number(line.quantity_per),
      scrap_percent: Number(line.scrap_percent || 0),
      issue_uom: line.issue_uom?.trim() || null,
      is_optional: Boolean(line.is_optional),
      notes: line.notes?.trim() || null,
      substitutes: (line.substitutes || []).map((substitute) => ({
        substitute_product_id: substitute.substitute_product_id,
        substitute_quantity: Number(substitute.substitute_quantity),
        priority: Number(substitute.priority || 1),
        effective_from: localDateTimeInputToIso(substitute.effective_from),
        effective_to: localDateTimeInputToIso(substitute.effective_to),
        notes: substitute.notes?.trim() || null,
      })),
    }))

    try {
      setSavingStructure(true)
      await updateBomStructure(selectedVersionId, sanitizedLines)
      toast({
        title: t("Version structure saved", "تم حفظ هيكل النسخة"),
        description: t("Lines and substitutes are now in sync with the database.", "الـ lines والـ substitutes أصبحت متزامنة مع قاعدة البيانات."),
      })
      await refreshWorkspace(selectedVersionId)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t("Failed to save structure", "تعذر حفظ الهيكل"),
        description: error?.message || t("An error occurred while updating the structure", "حدث خطأ أثناء تحديث structure"),
      })
      await refreshWorkspace(selectedVersionId)
    } finally {
      setSavingStructure(false)
    }
  }

  const executeVersionAction = async (action: string, operation: () => Promise<unknown>, successTitle: string, successDescription: string) => {
    try {
      setRunningAction(action)
      await operation()
      toast({
        title: successTitle,
        description: successDescription,
      })
      await refreshWorkspace(selectedVersionId)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t("Failed to execute the operation", "تعذر تنفيذ العملية"),
        description: error?.message || t("The operation was rejected due to status or concurrency constraints", "تم رفض العملية بسبب قيود الحالة أو التزامن"),
      })
      await refreshWorkspace(selectedVersionId)
    } finally {
      setRunningAction(null)
    }
  }

  const handleSubmitVersionForApproval = async () => {
    if (!selectedVersionId) return

    if (selectedVersionHasNoPersistedLines) {
      toast({
        variant: "destructive",
        title: t("Cannot submit an empty version", "لا يمكن إرسال نسخة فارغة"),
        description: t("Add at least one material, then click Save Materials before submitting for approval.", "أضف مادة واحدة على الأقل ثم اضغط حفظ الخامات قبل الإرسال للاعتماد."),
      })
      return
    }

    await executeVersionAction(
      "submit",
      () => submitBomVersion(selectedVersionId),
      t("Version submitted for approval", "تم إرسال النسخة للاعتماد"),
      t("The version is now in pending_approval status.", "أصبحت النسخة في حالة pending_approval.")
    )
  }

  const handleReject = async () => {
    if (!selectedVersionId || !rejectionReason.trim()) {
      toast({
        variant: "destructive",
        title: t("Rejection reason required", "سبب الرفض مطلوب"),
        description: t("Enter a clear reason before rejecting the version.", "أدخل سببًا واضحًا قبل رفض النسخة."),
      })
      return
    }

    await executeVersionAction(
      "reject",
      () => rejectBomVersion(selectedVersionId, rejectionReason.trim()),
      t("Version rejected", "تم رفض النسخة"),
      t("The version is now in rejected status and can be edited again later.", "أصبحت النسخة في حالة rejected ويمكن إعادة تعديلها لاحقًا.")
    )
    setRejectOpen(false)
    setRejectionReason("")
  }

  const handleRunPreview = async () => {
    if (!selectedVersionId) return
    try {
      setPreviewLoading(true)
      const result = await runExplosionPreview(selectedVersionId, {
        ...previewForm,
        as_of_date: localDateTimeInputToIso(previewForm.as_of_date),
        input_quantity: Number(previewForm.input_quantity || 1),
      })
      setPreviewResult(result)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t("Failed to run Explosion Preview", "تعذر تشغيل Explosion Preview"),
        description: error?.message || t("An error occurred while running the preview", "حدث خطأ أثناء تنفيذ المعاينة"),
      })
      setPreviewResult(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const addLine = () => {
    const nextLineNo = structureDraft.length > 0
      ? Math.max(...structureDraft.map((line) => Number(line.line_no || 0))) + 1
      : 1
    setStructureDraft((current) => [...current, createEmptyLine(nextLineNo)])
  }

  const getLineProductOptions = (line: BomLineDraft) => {
    const allowedProducts = products.filter((product) =>
      isBomLineProductOptionAllowed(product, line.line_type, ownerProduct?.id)
    )

    const selectedProduct = productMap[line.component_product_id]
    if (
      selectedProduct &&
      !allowedProducts.some((product) => product.id === selectedProduct.id)
    ) {
      return [selectedProduct, ...allowedProducts]
    }

    return allowedProducts
  }

  const getSubstituteProductOptions = (line: BomLineDraft, substituteProductId?: string) => {
    const allowedProducts = products.filter((product) =>
      isBomLineProductOptionAllowed(product, "component", ownerProduct?.id) &&
      product.id !== line.component_product_id
    )

    const selectedProduct = substituteProductId ? productMap[substituteProductId] : null
    if (
      selectedProduct &&
      !allowedProducts.some((product) => product.id === selectedProduct.id)
    ) {
      return [selectedProduct, ...allowedProducts]
    }

    return allowedProducts
  }

  const updateLine = (lineIndex: number, patch: Partial<BomLineDraft>) => {
    setStructureDraft((current) =>
      current.map((line, index) => (index === lineIndex ? { ...line, ...patch } : line))
    )
  }

  const handleLineTypeChange = (lineIndex: number, lineType: BomLineDraft["line_type"]) => {
    const currentLine = structureDraft[lineIndex]
    const currentProduct = productMap[currentLine?.component_product_id || ""]
    const keepSelectedProduct = currentProduct
      ? isBomLineProductOptionAllowed(currentProduct, lineType, ownerProduct?.id)
      : false

    updateLine(lineIndex, {
      line_type: lineType,
      component_product_id: keepSelectedProduct ? currentLine.component_product_id : "",
      substitutes: lineType === "component" ? currentLine.substitutes : [],
    })
  }

  const getProductOptionLabel = (product: ProductOption, lineType: BomLineDraft["line_type"]) => {
    const allowed = isBomLineProductOptionAllowed(product, lineType, ownerProduct?.id)
    return allowed ? buildProductLabel(product) : `${buildProductLabel(product)} — ${t("not suitable for this line type", "غير مناسب لنوع الإضافة")}`
  }

  const removeLine = (lineIndex: number) => {
    setStructureDraft((current) => current.filter((_, index) => index !== lineIndex))
  }

  const addSubstitute = (lineIndex: number) => {
    setStructureDraft((current) =>
      current.map((line, index) =>
        index === lineIndex
          ? { ...line, substitutes: [...line.substitutes, createEmptySubstitute()] }
          : line
      )
    )
  }

  const updateSubstitute = (lineIndex: number, substituteIndex: number, patch: Partial<BomLineSubstituteDraft>) => {
    setStructureDraft((current) =>
      current.map((line, index) => {
        if (index !== lineIndex) return line
        return {
          ...line,
          substitutes: line.substitutes.map((substitute, innerIndex) =>
            innerIndex === substituteIndex ? { ...substitute, ...patch } : substitute
          ),
        }
      })
    )
  }

  const removeSubstitute = (lineIndex: number, substituteIndex: number) => {
    setStructureDraft((current) =>
      current.map((line, index) => {
        if (index !== lineIndex) return line
        return {
          ...line,
          substitutes: line.substitutes.filter((_, innerIndex) => innerIndex !== substituteIndex),
        }
      })
    )
  }

  const confirmDialogMeta = useMemo(() => {
    if (!confirmAction) return null

    switch (confirmAction) {
      case "delete-bom":
        return {
          title: t("Delete BOM", "حذف هيكل المواد"),
          description: bom
            ? t(`${bom.bom_code} will be permanently deleted if the conditions are met. This action cannot be undone.`, `سيتم حذف ${bom.bom_code} نهائياً إذا كانت الشروط متحققة. هذا الإجراء لا يمكن التراجع عنه.`)
            : t("The BOM will be deleted if the deletion conditions are met.", "سيتم حذف هيكل المواد إذا كانت شروط الحذف متحققة."),
          actionLabel: t("Delete BOM", "حذف هيكل المواد"),
          actionClassName: "bg-red-600 hover:bg-red-700",
        }
      case "delete-version":
        return {
          title: t("Delete current version", "حذف النسخة الحالية"),
          description: selectedVersion
            ? t(`Version v${selectedVersion.version_no} will be deleted if its status allows it. This action cannot be undone.`, `سيتم حذف النسخة v${selectedVersion.version_no} إذا كانت حالتها تسمح بذلك. لا يمكن التراجع عن هذا الإجراء.`)
            : t("The current version will be deleted if its status allows it.", "سيتم حذف النسخة الحالية إذا كانت حالتها تسمح بذلك."),
          actionLabel: t("Delete Version", "حذف النسخة"),
          actionClassName: "bg-red-600 hover:bg-red-700",
        }
      case "approve":
        return {
          title: t("Approve current version", "اعتماد الإصدار الحالية"),
          description: selectedVersion
            ? t(`Version v${selectedVersion.version_no} will be approved. After approval it becomes read-only and can be set as the default version.`, `سيتم اعتماد النسخة v${selectedVersion.version_no}. بعد الاعتماد ستصبح للقراءة فقط ويمكن تعيينها كنسخة افتراضية.`)
            : t("The current version will be approved.", "سيتم اعتماد النسخة الحالية."),
          actionLabel: t("Approve", "اعتماد"),
          actionClassName: "",
        }
      case "set-default":
        return {
          title: t("Set this version as the primary version", "تعيين هذه النسخة كنسخة رئيسية"),
          description: selectedVersion
            ? t(`Version ${selectedVersion.version_no} will be set as the primary production version for this product.`, `سيتم تعيين النسخة ${selectedVersion.version_no} كنسخة الإنتاج الرئيسية لهذا المنتج.`)
            : t("The current version will be set as the primary version.", "سيتم تعيين النسخة الحالية كنسخة رئيسية."),
          actionLabel: t("Set as primary version", "تعيين كنسخة رئيسية"),
          actionClassName: "",
        }
      default:
        return null
    }
  }, [bom, confirmAction, selectedVersion, appLang])

  const handleConfirmAction = async () => {
    const action = confirmAction
    setConfirmAction(null)

    if (!action) return

    if (action === "delete-bom") {
      await handleDeleteBom()
      return
    }

    if (action === "delete-version") {
      await handleDeleteVersion()
      return
    }

    if (!selectedVersionId) return

    if (action === "approve") {
      await executeVersionAction(
        "approve",
        () => approveBomVersion(selectedVersionId),
        t("Version approved", "تم اعتماد النسخة"),
        t("This version has been approved and is now ready to be activated and used in production orders.", "تم اعتماد هذه النسخة وأصبحت جاهزة للتفعيل والاستخدام في أوامر الإنتاج.")
      )
      return
    }

    if (action === "set-default") {
      await executeVersionAction(
        "set-default",
        () => setDefaultBomVersion(selectedVersionId),
        t("Default version set", "تم تعيين النسخة الافتراضية"),
        t("This version is now the primary version used automatically in production.", "أصبحت هذه النسخة هي النسخة الرئيسية المستخدمة في الإنتاج تلقائياً.")
      )
    }
  }

  return (
    <PageGuard resource="manufacturing_boms">
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
          <CompanyHeader />
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <ERPPageHeader
          title={loadingBom ? t("Loading bill of materials...", "جارٍ تحميل قائمة المكوّنات...") : bom ? `${bom.bom_code} — ${bom.bom_name}` : t("BOM not available", "القائمة مش متاحة")}
          description={t("Manage the bill of materials and its versions. Every version approval is recorded and kept for auditing.", "إدارة قائمة المكوّنات وإصداراتها. اعتماد كل إصدار مسجّل ومحفوظ للتدقيق.")}
          variant="detail"
          backHref="/manufacturing/boms"
          backLabel={t("Back to BOMs", "رجوع لقوائم المكوّنات")}
          extra={
            <div className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">
              <Factory className="h-3.5 w-3.5" />
              {t("Manufacturing Module", "مديول التصنيع")}
            </div>
          }
          actions={
            <>
              <Button variant="outline" className="gap-2" onClick={() => refreshWorkspace(selectedVersionId)} disabled={loadingBom || loadingVersion}>
                <RefreshCw className={`h-4 w-4 ${(loadingBom || loadingVersion) ? "animate-spin" : ""}`} />
                {t("Refresh", "تحديث")}
              </Button>
              <Button onClick={() => setCreateVersionOpen(true)} disabled={!canWrite || !bom} className="gap-2" data-ai-help="manufacturing_bom_detail.create_version_button">
                <CopyPlus className="h-4 w-4" />
                {t("Create New Version", "إنشاء إصدار جديد")}
              </Button>
            </>
          }
            />
          </div>

        <div className="space-y-6">
          {/* v3.74.283 — banner explaining the version workflow in plain Arabic */}
          {!loadingBom && bom && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40">
              <div className="text-blue-600 dark:text-blue-400 text-xl leading-none">ℹ️</div>
              <div className="text-sm text-blue-900 dark:text-blue-200 leading-relaxed">
                <div className="font-semibold mb-1">{t('What does a BOM "version" mean?', 'إيه يعنى "إصدار" قائمة المكوّنات؟')}</div>
                <p className="text-blue-800 dark:text-blue-300">
                  {appLang === "en" ? (
                    <>Each BOM has one approved version at a time. That version defines the raw materials and their quantities used when the product is manufactured. When you want to change the recipe, you create a <strong>new version</strong>, edit it, and submit it for approval. Older versions remain archived as an audit trail for any past production orders made against them.</>
                  ) : (
                    <>كل قائمة لها إصدار واحد معتمد فى المرة. الإصدار ده بيحدد الخامات وكمياتها وقت إنتاج المنتج. لما تحب تغيّر الوصفة، تنشئ <strong>إصدار جديد</strong>، تعدّل عليه، وترسله للاعتماد. الإصدارات القديمة تفضل محفوظة كأثر لأى أمر إنتاج قديم اتعمل عليها.</>
                  )}
                </p>
              </div>
            </div>
          )}

          {loadingBom && !bom ? (
                <div className="flex min-h-[280px] items-center justify-center text-slate-500">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {t("Loading bill of materials data...", "جارٍ تحميل بيانات قائمة المكوّنات...")}
                </div>
              ) : !bom ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
                  <div className="mx-auto flex max-w-lg flex-col items-center gap-3">
                    <AlertTriangle className="h-10 w-10 text-amber-500" />
                    <h2 className="text-xl font-semibold text-slate-900">{t("This BOM does not exist", "القائمة دى مش موجودة")}</h2>
                    <p className="text-sm leading-6 text-slate-600">
                      {t("It may have been deleted, you may not have permission to view it, or it belongs to a different branch.", "يا ترى انمسحت، يا ترى مش عندك صلاحية تشوفها، يا ترى الفرع الحالى مش هو فرعها.")}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-6">
                    {/* Quick info bar */}
                    <div className="grid gap-4 md:grid-cols-3">
                      <Card className="border-cyan-200 bg-cyan-50/80">
                        <CardContent className="p-4">
                          <div className="mb-1 text-xs text-slate-500">{t("Manufactured Product", "المنتج المصنّع")}</div>
                          <div className="text-base font-semibold text-slate-900">{buildProductLabel(ownerProduct)}</div>
                          <div className="mt-1.5 text-xs text-slate-500">
                            {BOM_USAGE_OPTIONS.find((o) => o.value === bom.bom_usage)?.[appLang === "en" ? "label" : "labelAr"] || bom.bom_usage}
                          </div>
                        </CardContent>
                      </Card>
                      <Card className="border-indigo-200 bg-indigo-50/80">
                        <CardContent className="p-4">
                          <div className="mb-1 text-xs text-slate-500">{t("Branch", "الفرع")}</div>
                          <div className="text-base font-semibold text-slate-900">{buildBranchLabel(branchMap[bom.branch_id])}</div>
                          {bom.source_warehouse_id ? (
                            <div className="mt-1.5 text-xs text-emerald-600">{t("✓ Issue warehouse set", "✓ مخزن صرف محدد")}</div>
                          ) : (
                            <div className="mt-1.5 text-xs text-slate-400">{t("No default issue warehouse", "لا يوجد مخزن صرف افتراضي")}</div>
                          )}
                        </CardContent>
                      </Card>
                      <Card className="border-slate-200 bg-slate-50/80">
                        <CardContent className="p-4">
                          <div className="mb-1 text-xs text-slate-500">{t("Active Version", "النسخة النشطة")}</div>
                          {bom.versions.length === 0 ? (
                            <div className="text-sm text-slate-500">{t("No versions yet", "لا توجد نسخ بعد")}</div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <Select value={selectedVersionId || ""} onValueChange={setSelectedVersionId}>
                                <SelectTrigger className="h-8 flex-1 text-sm">
                                  <SelectValue placeholder={t("Select version", "اختر النسخة")} />
                                </SelectTrigger>
                                <SelectContent>
                                  {bom.versions.map((v) => (
                                    <SelectItem key={v.id} value={v.id}>
                                      v{v.version_no} · {getVersionStatusLabel(v.status, appLang)}{v.is_default ? " ★" : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {selectedVersion && (
                                <Badge variant={getVersionStatusVariant(selectedVersion.status)} className="shrink-0">
                                  {getVersionStatusLabel(selectedVersion.status, appLang)}
                                </Badge>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    {/* Main content: raw materials editor */}
                    <Card className="border-slate-200 bg-white/90" data-ai-help="manufacturing_bom_detail.components_table">
                      <CardHeader>
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <CardTitle className="flex items-center gap-2 text-lg">
                              <Package2 className="h-5 w-5 text-cyan-700" />
                              {t("Product Raw Materials", "الخامات المُكوّنة للمنتج")}
                            </CardTitle>
                            <CardDescription>
                              {selectedVersion
                                ? structureEditable
                                  ? t("This version is editable. Add the materials and their quantities, then save.", "الإصدار ده قابل للتعديل. أضف الخامات وكمياتها واحفظ.")
                                  : getVersionLockMessage(selectedVersion.status, appLang)
                                : bom.versions.length === 0
                                ? t("Create the first version to start adding materials.", "أنشئ الإصدار الأول علشان تبدأ تضيف الخامات.")
                                : t("Select a version above to view its components.", "اختر إصدار من اللى فوق علشان تشوف مكوّناته.")}
                            </CardDescription>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {bom.versions.length === 0 && (
                              <Button onClick={() => setCreateVersionOpen(true)} disabled={!canWrite} className="gap-2">
                                <CopyPlus className="h-4 w-4" />
                                {t("Create First Version", "إنشاء الإصدار الأول")}
                              </Button>
                            )}
                            {structureEditable && canUpdate && (
                              <>
                                <Button variant="outline" onClick={addLine} className="gap-2" data-ai-help="manufacturing_bom_detail.components_table">
                                  {t("Add Material", "إضافة خامة")}
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => setStructureDraft(versionSnapshot ? bomSnapshotToDraftLines(versionSnapshot.lines) : [])}
                                  disabled={savingStructure}
                                >
                                  {t("Reload", "إعادة تحميل")}
                                </Button>
                                <Button
                                  onClick={handleSaveStructure}
                                  disabled={!selectedVersionId || savingStructure}
                                  className="gap-2"
                                  data-ai-help="manufacturing_bom_detail.components_table"
                                >
                                  {savingStructure ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                  {t("Save Materials", "حفظ المواد")}
                                </Button>
                              </>
                            )}
                            {selectedVersion && canSubmitVersion(selectedVersion.status) && (
                              <Button
                                variant="outline"
                                onClick={() => {
                                  void handleSubmitVersionForApproval()
                                }}
                                disabled={!canUpdate || runningAction === "submit" || loadingVersion}
                                className="gap-2"
                                data-ai-help="manufacturing_bom_detail.submit_approval_button"
                                title={selectedVersionHasNoPersistedLines ? t("Add at least one material and save the materials before submitting for approval", "أضف مادة واحدة على الأقل واحفظ المواد قبل الإرسال للاعتماد") : undefined}
                              >
                                {runningAction === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                {t("Submit for Approval", "إرسال للاعتماد")}
                              </Button>
                            )}
                            {selectedVersion && canApproveVersion(selectedVersion.status) && (
                              <Button
                                variant="outline"
                                onClick={() => setConfirmAction("approve")}
                                disabled={!canApprove || runningAction === "approve"}
                                className="gap-2"
                                data-ai-help="manufacturing_bom_detail.approve_button"
                              >
                                {runningAction === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                {t("Approve Version", "اعتماد النسخة")}
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {bom.versions.length === 0 ? (
                          <div className="rounded-2xl border border-dashed p-10 text-center">
                            <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                              <Package2 className="h-8 w-8 text-slate-300" />
                              <div className="text-lg font-medium text-slate-900">{t("No version yet", "مفيش إصدار لسه")}</div>
                              <p className="text-sm leading-6 text-slate-500">
                                {t("The BOM needs a version before you can add materials.", "القائمة محتاجة إصدار علشان تقدر تضيف الخامات.")}
                              </p>
                              <Button onClick={() => setCreateVersionOpen(true)} disabled={!canWrite} className="gap-2">
                                <CopyPlus className="h-4 w-4" />
                                {t("Create First Version", "إنشاء النسخة الأولى")}
                              </Button>
                            </div>
                          </div>
                        ) : !selectedVersion || !versionSnapshot ? (
                          loadingVersion ? (
                            <div className="flex min-h-[160px] items-center justify-center text-slate-500">
                              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                              {t("Loading version...", "جارٍ تحميل الإصدار...")}
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-dashed p-8 text-center">
                              <WandSparkles className="mx-auto h-8 w-8 text-slate-300" />
                              <div className="mt-3 text-base font-medium text-slate-900">{t("Select a version from above", "اختر إصدار من اللى فوق")}</div>
                            </div>
                          )
                        ) : structureDraft.length === 0 ? (
                              <div className="rounded-2xl border border-dashed p-10 text-center">
                                <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                                  <Package2 className="h-8 w-8 text-slate-300" />
                                  <div className="text-lg font-medium text-slate-900">{t("This version is still empty", "الإصدار ده لسه فاضى")}</div>
                                  <p className="text-sm leading-6 text-slate-500">
                                    {t("Add the raw materials that go into manufacturing the product, along with their quantities.", "أضف الخامات اللى بتدخل فى تصنيع المنتج وكمياتها.")}
                                  </p>
                                  {structureEditable && (
                                    <Button onClick={addLine} disabled={!canUpdate}>{t("Add Component", "إضافة مكوّن")}</Button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                {structureDraft.map((line, lineIndex) => (
                                  <Card key={`line-${lineIndex}`} className="border-slate-200" data-ai-help="manufacturing_bom_detail.components_table">
                                    <CardHeader className="pb-4">
                                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                        <div>
                                          <CardTitle className="text-base">{t("BOM Line", "سطر BOM")} #{line.line_no}</CardTitle>
                                          <CardDescription>
                                            {productMap[line.component_product_id]
                                              ? buildProductLabel(productMap[line.component_product_id])
                                              : t("Product not selected yet", "لم يُحدد المنتج بعد")}
                                          </CardDescription>
                                        </div>
                                        <Button
                                          variant="destructive"
                                          size="sm"
                                          onClick={() => removeLine(lineIndex)}
                                          disabled={!structureEditable || !canUpdate}
                                        >
                                          {t("Delete", "حذف")}
                                        </Button>
                                      </div>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                        <div className="space-y-2">
                                          <Label>{t("Order", "الترتيب")}</Label>
                                          <Input
                                            type="number"
                                            min="1"
                                            value={line.line_no}
                                            onChange={(event) => updateLine(lineIndex, { line_no: Number(event.target.value || 1) })}
                                            disabled={!structureEditable || !canUpdate}
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label>{t("Line Type", "نوع الإضافة")}</Label>
                                          <select
                                            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                                            value={line.line_type}
                                            onChange={(event) => handleLineTypeChange(lineIndex, event.target.value as BomLineDraft["line_type"])}
                                            disabled={!structureEditable || !canUpdate}
                                          >
                                            {BOM_LINE_TYPE_OPTIONS.map((option) => (
                                              <option key={option.value} value={option.value}>
                                                {appLang === "en" ? option.label : option.labelAr}
                                              </option>
                                            ))}
                                          </select>
                                          {/* Contextual hint for the selected line type */}
                                          {line.line_type === "component" && (
                                            <div className="flex gap-2 rounded-lg border border-blue-100 bg-blue-50 p-2.5">
                                              <span className="mt-0.5 text-base leading-none">•</span>
                                              <div>
                                                <p className="text-xs font-semibold text-blue-800">{t("Manufacturing Component", "مكوّن تصنيع")}</p>
                                                <p className="mt-0.5 text-xs leading-5 text-blue-700">
                                                  {t("A material fully consumed during manufacturing and issued from inventory.", "مادة تُستهلك بالكامل في التصنيع وتُصرف من المخزون.")}
                                                </p>
                                                <p className="mt-1 text-xs text-blue-600">
                                                  <span className="font-medium">{t("Example:", "مثال:")}</span> {t("Flour + sugar + oil in biscuit manufacturing.", "دقيق + سكر + زيت في تصنيع البسكويت.")}
                                                </p>
                                              </div>
                                            </div>
                                          )}
                                          {line.line_type === "co_product" && (
                                            <div className="flex gap-2 rounded-lg border border-emerald-100 bg-emerald-50 p-2.5">
                                              <span className="mt-0.5 text-base leading-none">•</span>
                                              <div>
                                                <p className="text-xs font-semibold text-emerald-800">{t("Co-Product", "منتج مشترك")}</p>
                                                <p className="mt-0.5 text-xs leading-5 text-emerald-700">
                                                  {t("Another main product that intentionally comes out of the same manufacturing run, with comparable economic value.", "منتج رئيسي آخر يخرج من نفس دورة التصنيع بشكل مقصود، وله قيمة اقتصادية مماثلة.")}
                                                </p>
                                                <p className="mt-1 text-xs text-emerald-600">
                                                  <span className="font-medium">{t("Example:", "مثال:")}</span> {t("Oil refining: gasoline + diesel + kerosene at the same time.", "عند تكرير النفط: بنزين + ديزل + كيروسين في آنٍ واحد.")}
                                                </p>
                                                <p className="mt-1 text-xs text-emerald-600">
                                                  <span className="font-medium">{t("When to use it:", "متى تستخدمه:")}</span> {t("When you want to record an additional main output received into inventory.", "عندما تريد تسجيل مخرج رئيسي إضافي يُستلم في المخزون.")}
                                                </p>
                                              </div>
                                            </div>
                                          )}
                                          {line.line_type === "by_product" && (
                                            <div className="flex gap-2 rounded-lg border border-amber-100 bg-amber-50 p-2.5">
                                              <span className="mt-0.5 text-base leading-none">•</span>
                                              <div>
                                                <p className="text-xs font-semibold text-amber-800">{t("By-Product", "منتج ثانوي")}</p>
                                                <p className="mt-0.5 text-xs leading-5 text-amber-700">
                                                  {t("An unintended incidental output produced during manufacturing, usually of lower economic value.", "ناتج عرضي غير مقصود يخرج أثناء التصنيع، وعادةً له قيمة اقتصادية أقل.")}
                                                </p>
                                                <p className="mt-1 text-xs text-amber-600">
                                                  <span className="font-medium">{t("Example:", "مثال:")}</span> {t("Sawdust when sawing boards, or the heat generated.", "نشارة الخشب عند نشر الألواح، أو الحرارة الناتجة.")}
                                                </p>
                                                <p className="mt-1 text-xs text-amber-600">
                                                  <span className="font-medium">{t("When to use it:", "متى تستخدمه:")}</span> {t("When you want to track or sell the by-product separately.", "عندما تريد تتبع أو بيع الناتج الثانوي بشكل منفصل.")}
                                                </p>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                        <div className="space-y-2 xl:col-span-2" data-ai-help="manufacturing_bom_detail.component_product">
                                          <Label>{line.line_type === "component" ? t("Raw Material", "المادة الخام") : t("Output Product", "المنتج الناتج")}</Label>
                                          <select
                                            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                                            value={line.component_product_id}
                                            onChange={(event) => updateLine(lineIndex, { component_product_id: event.target.value })}
                                            disabled={!structureEditable || !canUpdate}
                                          >
                                            <option value="">
                                              {line.line_type === "component" ? t("Select the raw material", "اختر المادة الخام") : t("Select the output product", "اختر المنتج الناتج")}
                                            </option>
                                            {getLineProductOptions(line).map((product) => (
                                              <option key={product.id} value={product.id}>
                                                {getProductOptionLabel(product, line.line_type)}
                                              </option>
                                            ))}
                                          </select>
                                          <p className="text-xs leading-5 text-slate-500">
                                            {getBomLineProductFilterMessage(line.line_type, appLang)}
                                          </p>
                                          {getLineProductOptions(line).length === 0 && (
                                            <p className="text-xs leading-5 text-amber-700">
                                              {t("No products are suitable for the current line type. Review the product type from the products page.", "لا توجد منتجات مناسبة لنوع الإضافة الحالي. راجع نوع المنتج من صفحة المنتجات.")}
                                            </p>
                                          )}
                                        </div>
                                      </div>

                                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                        <div className="space-y-2" data-ai-help="manufacturing_bom_detail.quantity_per_unit">
                                          <Label>{t("Quantity needed to manufacture one unit", "الكمية اللازمة لتصنيع وحدة واحدة")}</Label>
                                          <Input
                                            type="number"
                                            min="0.0001"
                                            step="0.0001"
                                            value={line.quantity_per}
                                            onChange={(event) => updateLine(lineIndex, { quantity_per: Number(event.target.value || 0) })}
                                            disabled={!structureEditable || !canUpdate}
                                          />
                                        </div>
                                        <div className="space-y-2" data-ai-help="manufacturing_bom_detail.scrap_percent">
                                          <Label>{t("Scrap Percentage %", "نسبة الهالك %")}</Label>
                                          <Input
                                            type="number"
                                            min="0"
                                            max="99.9999"
                                            step="0.0001"
                                            value={line.scrap_percent}
                                            onChange={(event) => updateLine(lineIndex, { scrap_percent: Number(event.target.value || 0) })}
                                            disabled={!structureEditable || !canUpdate}
                                          />
                                        </div>
                                        <div className="space-y-2" data-ai-help="manufacturing_bom_detail.issue_uom">
                                          <Label>{t("Unit of measure when issued to the factory", "وحدة القياس عند الصرف للمصنع")}</Label>
                                          <Input
                                            value={line.issue_uom || ""}
                                            onChange={(event) => updateLine(lineIndex, { issue_uom: event.target.value })}
                                            disabled={!structureEditable || !canUpdate}
                                          />
                                        </div>
                                        <div className="flex items-center gap-3 rounded-xl border px-4 py-3">
                                          <Checkbox
                                            checked={line.is_optional}
                                            onCheckedChange={(checked) => updateLine(lineIndex, { is_optional: Boolean(checked) })}
                                            disabled={!structureEditable || !canUpdate}
                                          />
                                          <div className="space-y-1">
                                            <div className="font-medium text-slate-900">{t("This material is optional", "هذه المادة غير إلزامية")}</div>
                                            <div className="text-xs text-slate-500">{t("Manufacturing can be completed without it if it is not available in the warehouse.", "يمكن إتمام التصنيع بدونها إذا لم تتوفر في المخزن.")}</div>
                                          </div>
                                        </div>
                                      </div>

                                      <div className="space-y-2" data-ai-help="manufacturing_bom_detail.notes">
                                        <Label>{t("Notes", "ملاحظات")}</Label>
                                        <Textarea
                                          value={line.notes || ""}
                                          onChange={(event) => updateLine(lineIndex, { notes: event.target.value })}
                                          disabled={!structureEditable || !canUpdate}
                                        />
                                      </div>

                                      <Separator />

                                      <div className="space-y-3" data-ai-help="manufacturing_bom_detail.substitutes">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                          <div>
                                            <div className="text-sm font-semibold text-slate-900">{t("Substitute Components", "المكونات البديلة")}</div>
                                            <div className="text-xs text-slate-500">
                                               {t("If this component runs short in the warehouse, the system automatically uses one of these substitutes.", "في حال نقص هذا المكوّن من المخزن، يستخدم النظام إحدى هذه البدائل تلقائياً.")}
                                            </div>
                                          </div>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => addSubstitute(lineIndex)}
                                            disabled={!structureEditable || !canUpdate || line.line_type !== "component"}
                                            data-ai-help="manufacturing_bom_detail.substitutes"
                                          >
                                            {t("Add Substitute", "إضافة بديل")}
                                          </Button>
                                        </div>

                                        {line.substitutes.length === 0 ? (
                                          <div className="rounded-xl border border-dashed p-4 text-center text-sm text-slate-500">
                                            {t("No substitutes for this line.", "لا توجد بدائل لهذا السطر.")}
                                          </div>
                                        ) : (
                                          <div className="space-y-3">
                                            {line.substitutes.map((substitute, substituteIndex) => (
                                              <div key={`sub-${lineIndex}-${substituteIndex}`} className="rounded-xl border bg-slate-50 p-4">
                                                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                                  <div className="space-y-2 xl:col-span-2" data-ai-help="manufacturing_bom_detail.substitutes">
                                                    <Label>{t("Substitute Product", "المنتج البديل")}</Label>
                                                    <select
                                                      className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                                                      value={substitute.substitute_product_id}
                                                      onChange={(event) => updateSubstitute(lineIndex, substituteIndex, { substitute_product_id: event.target.value })}
                                                      disabled={!structureEditable || !canUpdate}
                                                    >
                                                      <option value="">{t("Select substitute", "اختر البديل")}</option>
                                                      {getSubstituteProductOptions(line, substitute.substitute_product_id).map((product) => (
                                                        <option key={product.id} value={product.id}>
                                                          {getProductOptionLabel(product, "component")}
                                                        </option>
                                                      ))}
                                                    </select>
                                                    <p className="text-xs leading-5 text-slate-500">
                                                      {t("Only products valid as manufacturing inputs are shown, excluding the primary component and the finished product.", "تظهر فقط المنتجات الصالحة كمدخلات تصنيع، مع استبعاد المكوّن الأساسي والمنتج النهائي.")}
                                                    </p>
                                                  </div>
                                                  <div className="space-y-2" data-ai-help="manufacturing_bom_detail.quantity_per_unit">
                                                    <Label>{t("Quantity", "الكمية")}</Label>
                                                    <Input
                                                      type="number"
                                                      min="0.0001"
                                                      step="0.0001"
                                                      value={substitute.substitute_quantity}
                                                      onChange={(event) => updateSubstitute(lineIndex, substituteIndex, { substitute_quantity: Number(event.target.value || 0) })}
                                                      disabled={!structureEditable || !canUpdate}
                                                    />
                                                  </div>
                                                  <div className="space-y-2" data-ai-help="manufacturing_bom_detail.substitutes">
                                                    <Label>{t("Priority", "الأولوية")}</Label>
                                                    <Input
                                                      type="number"
                                                      min="1"
                                                      step="1"
                                                      value={substitute.priority}
                                                      onChange={(event) => updateSubstitute(lineIndex, substituteIndex, { priority: Number(event.target.value || 1) })}
                                                      disabled={!structureEditable || !canUpdate}
                                                    />
                                                  </div>
                                                </div>
                                                <div className="mt-4 grid gap-4 md:grid-cols-2">
                                                  <div className="space-y-2" data-ai-help="manufacturing_bom_detail.effective_dates">
                                                    <Label>{t("Effective From", "ساري من")}</Label>
                                                    <Input
                                                      type="datetime-local"
                                                      value={substitute.effective_from || ""}
                                                      onChange={(event) => updateSubstitute(lineIndex, substituteIndex, { effective_from: event.target.value })}
                                                      disabled={!structureEditable || !canUpdate}
                                                    />
                                                  </div>
                                                  <div className="space-y-2" data-ai-help="manufacturing_bom_detail.effective_dates">
                                                    <Label>{t("Effective To", "ساري حتى")}</Label>
                                                    <Input
                                                      type="datetime-local"
                                                      value={substitute.effective_to || ""}
                                                      onChange={(event) => updateSubstitute(lineIndex, substituteIndex, { effective_to: event.target.value })}
                                                      disabled={!structureEditable || !canUpdate}
                                                    />
                                                  </div>
                                                </div>
                                                <div className="mt-4 space-y-2">
                                                  <Label>{t("Notes", "ملاحظات")}</Label>
                                                  <Textarea
                                                    value={substitute.notes || ""}
                                                    onChange={(event) => updateSubstitute(lineIndex, substituteIndex, { notes: event.target.value })}
                                                    disabled={!structureEditable || !canUpdate}
                                                  />
                                                </div>
                                                <div className="mt-3 flex justify-end">
                                                  <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    onClick={() => removeSubstitute(lineIndex, substituteIndex)}
                                                    disabled={!structureEditable || !canUpdate}
                                                  >
                                                    {t("Delete Substitute", "حذف البديل")}
                                                  </Button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>

                    {/* Advanced accordions: version management, BOM settings, production analysis */}
                    <Accordion type="multiple" className="space-y-3">

                      <AccordionItem value="version-management" className="rounded-2xl border border-slate-200 bg-white/90 px-0" data-ai-help="manufacturing_bom_detail.version_selector">
                        <AccordionTrigger className="px-6 py-4 text-base font-semibold hover:no-underline">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-indigo-600" />
                            {t("Version Management & Approval", "إدارة النسخ والاعتماد")}
                            {bom.versions.length > 0 && (
                              <Badge variant="secondary" className="text-xs">{bom.versions.length} {t("versions", "نسخة")}</Badge>
                            )}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-6 pb-6">
                          <div className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                              <Button onClick={() => setCreateVersionOpen(true)} disabled={!canWrite} variant="outline" className="gap-2">
                                <CopyPlus className="h-4 w-4" />
                                {t("Create New Version", "إنشاء نسخة جديدة")}
                              </Button>
                            </div>
                            {bom.versions.length === 0 ? (
                              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">{t("No versions yet.", "لا توجد نسخ بعد.")}</div>
                            ) : (
                              <div className="space-y-2">
                                {bom.versions.map((version) => (
                                  <button
                                    key={version.id}
                                    type="button"
                                    onClick={() => setSelectedVersionId(version.id)}
                                    data-ai-help="manufacturing_bom_detail.version_selector"
                                    className={`w-full rounded-2xl border p-4 text-right transition ${
                                      selectedVersionId === version.id
                                        ? "border-cyan-300 bg-cyan-50 shadow-sm"
                                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="space-y-2">
                                        <div className="text-base font-semibold text-slate-900">v{version.version_no}</div>
                                        <div className="flex flex-wrap gap-2">
                                          <Badge variant={getVersionStatusVariant(version.status)} data-ai-help="manufacturing_bom_detail.version_status">
                                            {getVersionStatusLabel(version.status, appLang)}
                                          </Badge>
                                          {version.is_default ? <Badge variant="outline" data-ai-help="manufacturing_bom_detail.default_version">{t("Default", "افتراضية")}</Badge> : null}
                                        </div>
                                      </div>
                                      <div className="text-xs text-slate-500">{formatDateOnly(version.updated_at)}</div>
                                    </div>
                                    <div className="mt-3 space-y-1 text-xs text-slate-500">
                                      <div>{t("Effective from", "سريان من")}: {formatDateOnly(version.effective_from)}</div>
                                      <div>{t("Effective to", "سريان إلى")}: {formatDateOnly(version.effective_to)}</div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                            {selectedVersion && versionSnapshot ? (
                              <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4" data-ai-help="manufacturing_bom_detail.version_status">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="text-lg font-semibold text-slate-900">v{selectedVersion.version_no}</div>
                                      <Badge variant={getVersionStatusVariant(selectedVersion.status)} data-ai-help="manufacturing_bom_detail.version_status">
                                        {getVersionStatusLabel(selectedVersion.status, appLang)}
                                      </Badge>
                                      {selectedVersion.is_default ? <Badge variant="outline" data-ai-help="manufacturing_bom_detail.default_version">{t("Default", "افتراضية")}</Badge> : null}
                                    </div>
                                    <p className="max-w-xl text-sm leading-6 text-slate-600">{getVersionLockMessage(selectedVersion.status, appLang)}</p>
                                  </div>
                                  <div className="grid gap-2 text-xs text-slate-500">
                                    <div>{t("Last updated", "آخر تحديث")}: {formatDateTime(selectedVersion.updated_at)}</div>
                                    <div>{t("Approval date", "تاريخ الاعتماد")}: {formatDateTime(selectedVersion.approved_at)}</div>
                                  </div>
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                  <div className="space-y-2" data-ai-help="manufacturing_bom_detail.effective_dates">
                                    <Label>{t("Effective From", "تاريخ السريان من")}</Label>
                                    <Input type="datetime-local" value={versionForm.effective_from}
                                      onChange={(event) => setVersionForm((current) => ({ ...current, effective_from: event.target.value }))}
                                      disabled={!versionEditable || !canUpdate} />
                                  </div>
                                  <div className="space-y-2" data-ai-help="manufacturing_bom_detail.effective_dates">
                                    <Label>{t("Effective To", "تاريخ السريان إلى")}</Label>
                                    <Input type="datetime-local" value={versionForm.effective_to}
                                      onChange={(event) => setVersionForm((current) => ({ ...current, effective_to: event.target.value }))}
                                      disabled={!versionEditable || !canUpdate} />
                                  </div>
                                </div>
                                <div className="space-y-2" data-ai-help="manufacturing_bom_detail.quantity_per_unit">
                                  <Label>{t("Base Output Quantity", "كمية الإنتاج الأساسية")}</Label>
                                  <Input type="number" min="0.0001" step="0.0001" value={versionForm.base_output_qty}
                                    onChange={(event) => setVersionForm((current) => ({ ...current, base_output_qty: event.target.value }))}
                                    disabled={!versionEditable || !canUpdate} />
                                </div>
                                <div className="space-y-2"><Label>{t("Change Summary", "ملخص التغيير")}</Label>
                                  <Textarea value={versionForm.change_summary}
                                    onChange={(event) => setVersionForm((current) => ({ ...current, change_summary: event.target.value }))}
                                    disabled={!versionEditable || !canUpdate} />
                                </div>
                                <div className="space-y-2"><Label>{t("Notes", "ملاحظات")}</Label>
                                  <Textarea value={versionForm.notes}
                                    onChange={(event) => setVersionForm((current) => ({ ...current, notes: event.target.value }))}
                                    disabled={!versionEditable || !canUpdate} />
                                </div>
                                <Separator />
                                <div className="flex flex-wrap gap-2">
                                  <Button onClick={handleSaveVersionHeader} disabled={!versionEditable || !canUpdate || savingVersionHeader} className="gap-2">
                                    {savingVersionHeader ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                    {t("Save Version Header", "حفظ رأس النسخة")}
                                  </Button>
                                  <Button variant="outline"
                                    onClick={() => { void handleSubmitVersionForApproval() }}
                                    disabled={!selectedVersionId || !canUpdate || !canSubmitVersion(selectedVersion.status) || runningAction === "submit" || loadingVersion}
                                    className="gap-2" data-ai-help="manufacturing_bom_detail.submit_approval_button"
                                    title={selectedVersionHasNoPersistedLines ? t("Add at least one material and save the materials before submitting for approval", "أضف مادة واحدة على الأقل واحفظ المواد قبل الإرسال للاعتماد") : undefined}>
                                    {runningAction === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    {t("Submit for Approval", "إرسال للاعتماد")}
                                  </Button>
                                  <Button variant="outline" onClick={() => setConfirmAction("approve")}
                                    disabled={!selectedVersionId || !canApprove || !canApproveVersion(selectedVersion.status) || runningAction === "approve"}
                                    className="gap-2" data-ai-help="manufacturing_bom_detail.approve_button">
                                    {runningAction === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                    {t("Approve", "اعتماد")}
                                  </Button>
                                  <Button variant="outline" onClick={() => setRejectOpen(true)}
                                    disabled={!selectedVersionId || !canApprove || !canRejectVersion(selectedVersion.status) || runningAction === "reject"}
                                    className="gap-2" data-ai-help="manufacturing_bom_detail.reject_button">
                                    <ShieldX className="h-4 w-4" /> {t("Reject", "رفض")}
                                  </Button>
                                  <Button variant="outline" onClick={() => setConfirmAction("set-default")}
                                    disabled={!selectedVersionId || !canUpdate || !canSetDefaultVersion(selectedVersion.status, selectedVersion.is_default) || runningAction === "set-default"}
                                    className="gap-2" data-ai-help="manufacturing_bom_detail.set_default_button">
                                    {runningAction === "set-default" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                    {t("Set as Default", "تعيين كافتراضية")}
                                  </Button>
                                  <Button variant="destructive" onClick={() => setConfirmAction("delete-version")}
                                    disabled={!selectedVersionId || !canDelete || !canDeleteVersion(selectedVersion.status) || runningAction === "delete-version"}
                                    className="gap-2">
                                    {runningAction === "delete-version" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                    {t("Delete Version", "حذف النسخة")}
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      {/* BOM settings accordion */}
                      <AccordionItem value="bom-settings" className="rounded-2xl border border-slate-200 bg-white/90 px-0">
                        <AccordionTrigger className="px-6 py-4 text-base font-semibold hover:no-underline">
                          <div className="flex items-center gap-2">
                            <Package2 className="h-4 w-4 text-cyan-600" />
                            {t("BOM Settings", "إعدادات قائمة المواد")}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-6 pb-6">
                          <div className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="space-y-2" data-ai-help="manufacturing_bom_detail.bom_code">
                                <Label>{t("BOM Code", "كود هيكل المواد")}</Label>
                                <Input value={headerForm.bom_code}
                                  onChange={(event) => setHeaderForm((current) => ({ ...current, bom_code: event.target.value }))}
                                  disabled={!canUpdate} />
                              </div>
                              <div className="space-y-2" data-ai-help="manufacturing_bom_detail.bom_name">
                                <Label>{t("BOM Name", "اسم هيكل المواد")}</Label>
                                <Input value={headerForm.bom_name}
                                  onChange={(event) => setHeaderForm((current) => ({ ...current, bom_name: event.target.value }))}
                                  disabled={!canUpdate} />
                              </div>
                            </div>
                            <div className="grid gap-4 md:grid-cols-3">
                              <div className="space-y-2">
                                <Label>{t("Usage", "الاستخدام")}</Label>
                                <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                  {BOM_USAGE_OPTIONS.find((option) => option.value === bom.bom_usage)?.[appLang === "en" ? "label" : "labelAr"] || bom.bom_usage}
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label>{t("Branch", "الفرع")}</Label>
                                <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                  {buildBranchLabel(branchMap[bom.branch_id])}
                                </div>
                              </div>
                              <div className="space-y-2" data-ai-help="manufacturing_bom_detail.finished_product">
                                <Label>{t("Owner Product", "المنتج المالك")}</Label>
                                <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                  {buildProductLabel(ownerProduct)}
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2" data-ai-help="manufacturing_bom_detail.notes">
                              <Label>{t("Description", "الوصف")}</Label>
                              <Textarea value={headerForm.description}
                                onChange={(event) => setHeaderForm((current) => ({ ...current, description: event.target.value }))}
                                disabled={!canUpdate} />
                            </div>
                            <div className="space-y-2">
                              <Label className="flex items-center gap-1">
                                {t("Raw Material Issue Warehouse", "مخزن صرف الخامات")}
                                <span className="text-red-500">*</span>
                              </Label>
                              <RawMaterialWarehousePicker
                                value={headerForm.source_warehouse_id || ""}
                                onChange={(warehouseId) => setHeaderForm((current) => ({ ...current, source_warehouse_id: warehouseId || null }))}
                                branchId={bom?.branch_id || null}
                                disabled={!canUpdate}
                                lang={appLang} />
                              <p className="text-xs text-muted-foreground">
                                {t("Required — every production order created from this BOM will draw its raw materials from this warehouse.", "إجبارى — كل أمر إنتاج بيتعمل من القائمة دى هيسحب الخامات من المخزن ده.")}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-slate-50 px-4 py-3">
                              <div className="space-y-1">
                                <div className="font-medium text-slate-900">{t("BOM Active Status", "نشاط BOM")}</div>
                                <div className="text-sm text-slate-500">{t("The record can be deactivated without losing version or approval history.", "يمكن تعطيل السجل دون فقد تاريخ النسخ أو الاعتماد.")}</div>
                              </div>
                              <div className="flex items-center gap-3">
                                <Badge variant={headerForm.is_active ? "default" : "outline"}>
                                  {headerForm.is_active ? t("Active", "نشط") : t("Inactive", "غير نشط")}
                                </Badge>
                                <Switch checked={headerForm.is_active}
                                  onCheckedChange={(checked) => setHeaderForm((current) => ({ ...current, is_active: Boolean(checked) }))}
                                  disabled={!canUpdate} />
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="text-xs text-slate-500">{t("Last updated", "آخر تحديث")}: {formatDateTime(bom.updated_at)}</div>
                              <div className="flex flex-wrap gap-2">
                                <Button variant="outline" onClick={() => hydrateHeaderForm(bom)} disabled={savingHeader}>{t("Reset", "إعادة تعيين")}</Button>
                                <Button onClick={handleSaveHeader} disabled={!canUpdate || savingHeader} className="gap-2" data-ai-help="manufacturing_bom_detail.bom_name">
                                  {savingHeader ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                  {t("Save Details", "حفظ البيانات")}
                                </Button>
                                <Button variant="destructive" onClick={() => setConfirmAction("delete-bom")}
                                  disabled={!canDelete || runningAction === "delete-bom"} className="gap-2">
                                  {runningAction === "delete-bom" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                  {t("Delete BOM", "حذف BOM")}
                                </Button>
                              </div>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      {/* Production analysis accordion (advanced) */}
                      <AccordionItem value="preview" className="rounded-2xl border border-slate-200 bg-white/90 px-0" data-ai-help="manufacturing_bom_detail.preview_results">
                        <AccordionTrigger className="px-6 py-4 text-base font-semibold hover:no-underline">
                          <div className="flex items-center gap-2">
                            <FileSearch className="h-4 w-4 text-slate-500" />
                            {t("Production Components Analysis (Advanced)", "تحليل مكونات الإنتاج (متقدم)")}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-0 pb-0">
                        <Card className="border-0 shadow-none bg-transparent">
                          <CardHeader>
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                              <div>
                                <CardTitle className="text-lg">{t("Material Explosion Preview", "معاينة تفجير المواد")}</CardTitle>
                                <CardDescription>
                                  {t("A read-only, single-level preview. It performs no reservation, consumption, or stock decisions.", "معاينة قراءة فقط، single-level فقط، ولا تقوم بأي حجز أو استهلاك أو اتخاذ قرار stock.")}
                                </CardDescription>
                              </div>
                              <Button onClick={handleRunPreview} disabled={!selectedVersionId || previewLoading} className="gap-2" data-ai-help="manufacturing_bom_detail.explosion_preview_button">
                                {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
                                {t("Run Preview", "تشغيل المعاينة")}
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-6">
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                              <div className="space-y-2" data-ai-help="manufacturing_bom_detail.preview_quantity">
                                <Label>{t("Input Quantity", "كمية الإدخال")}</Label>
                                <Input
                                  type="number"
                                  min="0.0001"
                                  step="0.0001"
                                  value={previewForm.input_quantity}
                                  onChange={(event) => setPreviewForm((current) => ({ ...current, input_quantity: Number(event.target.value || 1) }))}
                                />
                              </div>
                              <div className="space-y-2" data-ai-help="manufacturing_bom_detail.effective_dates">
                                <Label>{t("As of Date", "بتاريخ")}</Label>
                                <Input
                                  type="datetime-local"
                                  value={previewForm.as_of_date || ""}
                                  onChange={(event) => setPreviewForm((current) => ({ ...current, as_of_date: event.target.value }))}
                                />
                              </div>
                              <div className="space-y-2" data-ai-help="manufacturing_bom_detail.substitutes">
                                <Label>{t("Substitute Strategy", "استراتيجية البدائل")}</Label>
                                <Select
                                  value={previewForm.substitute_strategy || "primary_only"}
                                  onValueChange={(value) => setPreviewForm((current) => ({ ...current, substitute_strategy: value as ExplosionPreviewPayload["substitute_strategy"] }))}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="primary_only">{t("Primary only", "الأساسي فقط")}</SelectItem>
                                    <SelectItem value="none">{t("No substitutes", "بدون بدائل")}</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2 rounded-2xl border px-4 py-3">
                                <div className="text-sm font-medium text-slate-900">{t("Preview Options", "خيارات المعاينة")}</div>
                                <div className="mt-3 space-y-3 text-sm">
                                  <label className="flex items-center gap-2">
                                    <Checkbox
                                      checked={Boolean(previewForm.include_substitutes)}
                                      onCheckedChange={(checked) => setPreviewForm((current) => ({ ...current, include_substitutes: Boolean(checked) }))}
                                    />
                                    {t("Include substitutes", "تضمين البدائل")}
                                  </label>
                                  <label className="flex items-center gap-2">
                                    <Checkbox
                                      checked={Boolean(previewForm.include_co_products)}
                                      onCheckedChange={(checked) => setPreviewForm((current) => ({ ...current, include_co_products: Boolean(checked) }))}
                                    />
                                    {t("Include co-products", "تضمين المنتجات المشتركة")}
                                  </label>
                                  <label className="flex items-center gap-2">
                                    <Checkbox
                                      checked={Boolean(previewForm.include_by_products)}
                                      onCheckedChange={(checked) => setPreviewForm((current) => ({ ...current, include_by_products: Boolean(checked) }))}
                                    />
                                    {t("Include by-products", "تضمين المنتجات الثانوية")}
                                  </label>
                                  <label className="flex items-center gap-2">
                                    <Checkbox
                                      checked={Boolean(previewForm.respect_effective_dates)}
                                      onCheckedChange={(checked) => setPreviewForm((current) => ({ ...current, respect_effective_dates: Boolean(checked) }))}
                                    />
                                    {t("Respect effective dates", "مراعاة تواريخ السريان")}
                                  </label>
                                </div>
                              </div>
                            </div>

                            {!previewResult ? (
                              <div className="rounded-2xl border border-dashed p-10 text-center">
                                <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                                  <FileSearch className="h-8 w-8 text-slate-300" />
                                  <div className="text-lg font-medium text-slate-900">{t("No preview yet", "لا توجد معاينة بعد")}</div>
                                  <p className="text-sm leading-6 text-slate-500">
                                    {t("Enter the input quantity and click Run Preview to view the components, substitutes, and secondary outputs.", "أدخل كمية الإدخال واضغط تشغيل المعاينة لعرض المكونات والبدائل والمخرجات الثانوية.")}
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-6">
                                <div className="grid gap-4 md:grid-cols-4">
                                  <Card className="border-cyan-200 bg-cyan-50/80">
                                    <CardContent className="p-4">
                                      <div className="text-sm text-slate-500">{t("Scale Factor", "معامل التحجيم")}</div>
                                      <div className="mt-1 text-2xl font-semibold text-slate-900">{formatQuantity(previewResult.scale_factor, 6)}</div>
                                    </CardContent>
                                  </Card>
                                  <Card className="border-indigo-200 bg-indigo-50/80">
                                    <CardContent className="p-4">
                                      <div className="text-sm text-slate-500">{t("Components", "المكونات")}</div>
                                      <div className="mt-1 text-2xl font-semibold text-slate-900">{previewResult.components.length}</div>
                                    </CardContent>
                                  </Card>
                                  <Card className="border-emerald-200 bg-emerald-50/80">
                                    <CardContent className="p-4">
                                      <div className="text-sm text-slate-500">{t("Co-Products", "المنتجات المشتركة")}</div>
                                      <div className="mt-1 text-2xl font-semibold text-slate-900">{previewResult.co_products.length}</div>
                                    </CardContent>
                                  </Card>
                                  <Card className="border-amber-200 bg-amber-50/80">
                                    <CardContent className="p-4">
                                      <div className="text-sm text-slate-500">{t("By-Products", "المنتجات الثانوية")}</div>
                                      <div className="mt-1 text-2xl font-semibold text-slate-900">{previewResult.by_products.length}</div>
                                    </CardContent>
                                  </Card>
                                </div>

                                <Card data-ai-help="manufacturing_bom_detail.preview_results">
                                  <CardHeader>
                                    <CardTitle className="text-base">{t("Required Components", "المكونات المطلوبة")}</CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>{t("Line", "السطر")}</TableHead>
                                          <TableHead data-ai-help="manufacturing_bom_detail.component_product">{t("Component", "المكوّن")}</TableHead>
                                          <TableHead data-ai-help="manufacturing_bom_detail.quantity_per_unit">{t("Required Quantity", "الكمية المطلوبة")}</TableHead>
                                          <TableHead data-ai-help="manufacturing_bom_detail.quantity_per_unit">{t("Gross Quantity", "الكمية الإجمالية")}</TableHead>
                                          <TableHead data-ai-help="manufacturing_bom_detail.scrap_percent">{t("Scrap %", "الهالك %")}</TableHead>
                                          <TableHead data-ai-help="manufacturing_bom_detail.substitutes">{t("Substitutes", "البدائل")}</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {previewResult.components.length === 0 ? (
                                          <TableRow>
                                            <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                                              {t("No component lines in this version.", "لا توجد component lines في هذه النسخة.")}
                                            </TableCell>
                                          </TableRow>
                                        ) : (
                                          previewResult.components.map((component) => (
                                            <TableRow key={component.line_id}>
                                              <TableCell>#{component.line_no}</TableCell>
                                              <TableCell className="max-w-sm whitespace-normal">
                                                <div className="font-medium text-slate-900">{component.component_name || component.component_product_id}</div>
                                                <div className="text-xs text-slate-500">{component.component_sku || t("No SKU", "بدون رمز")}</div>
                                              </TableCell>
                                              <TableCell>{formatQuantity(component.required_quantity)}</TableCell>
                                              <TableCell>{formatQuantity(component.gross_required_quantity)}</TableCell>
                                              <TableCell>{formatQuantity(component.scrap_percent, 4)}</TableCell>
                                              <TableCell className="max-w-sm whitespace-normal">
                                                {component.substitutes.length === 0 ? (
                                                  <span className="text-slate-400">—</span>
                                                ) : (
                                                  <div className="space-y-1">
                                                    {component.substitutes.map((substitute) => (
                                                      <div key={substitute.substitute_id} className="rounded-lg border bg-slate-50 px-2 py-1 text-xs">
                                                        <div className="font-medium text-slate-900">{substitute.substitute_name || substitute.substitute_product_id}</div>
                                                        <div className="text-slate-500">
                                                          {t("Quantity", "الكمية")}: {formatQuantity(substitute.substitute_quantity)} · {t("Priority", "الأولوية")}: {substitute.priority}
                                                        </div>
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}
                                              </TableCell>
                                            </TableRow>
                                          ))
                                        )}
                                      </TableBody>
                                    </Table>
                                  </CardContent>
                                </Card>

                                <div className="grid gap-4 xl:grid-cols-2">
                                  <Card>
                                    <CardHeader>
                                      <CardTitle className="text-base">{t("Co-Products", "المنتجات المشتركة")}</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                      {previewResult.co_products.length === 0 ? (
                                        <div className="text-sm text-slate-500">{t("No co-products in this preview.", "لا توجد co-products في هذه المعاينة.")}</div>
                                      ) : (
                                        previewResult.co_products.map((item) => (
                                          <div key={item.line_id} className="rounded-xl border p-3">
                                            <div className="font-medium text-slate-900">{item.product_name || item.product_id}</div>
                                            <div className="mt-1 text-sm text-slate-500">
                                              {t("Output", "ناتج")}: {formatQuantity(item.output_quantity)} {t("from line", "من السطر")} #{item.line_no}
                                            </div>
                                          </div>
                                        ))
                                      )}
                                    </CardContent>
                                  </Card>
                                  <Card>
                                    <CardHeader>
                                      <CardTitle className="text-base">{t("By-Products", "المنتجات الثانوية")}</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                      {previewResult.by_products.length === 0 ? (
                                        <div className="text-sm text-slate-500">{t("No by-products in this preview.", "لا توجد by-products في هذه المعاينة.")}</div>
                                      ) : (
                                        previewResult.by_products.map((item) => (
                                          <div key={item.line_id} className="rounded-xl border p-3">
                                            <div className="font-medium text-slate-900">{item.product_name || item.product_id}</div>
                                            <div className="mt-1 text-sm text-slate-500">
                                              {t("Output", "ناتج")}: {formatQuantity(item.output_quantity)} {t("from line", "من السطر")} #{item.line_no}
                                            </div>
                                          </div>
                                        ))
                                      )}
                                    </CardContent>
                                  </Card>
                                </div>

                                {(previewResult.warnings.length > 0 || previewResult.limitations.length > 0) && (
                                  <div className="grid gap-4 xl:grid-cols-2">
                                    <Card className="border-amber-200 bg-amber-50/70">
                                      <CardHeader>
                                        <CardTitle className="text-base text-amber-900">{t("Warnings", "تحذيرات")}</CardTitle>
                                      </CardHeader>
                                      <CardContent className="space-y-2 text-sm text-amber-900">
                                        {previewResult.warnings.length === 0 ? (
                                          <div>{t("No warnings.", "لا توجد تحذيرات.")}</div>
                                        ) : (
                                          previewResult.warnings.map((warning, index) => <div key={`warning-${index}`}>• {warning}</div>)
                                        )}
                                      </CardContent>
                                    </Card>
                                    <Card className="border-slate-200 bg-slate-50">
                                      <CardHeader>
                                        <CardTitle className="text-base">{t("Known Limitations", "قيود معروفة")}</CardTitle>
                                      </CardHeader>
                                      <CardContent className="space-y-2 text-sm text-slate-700">
                                        {previewResult.limitations.map((limitation, index) => (
                                          <div key={`limitation-${index}`}>• {limitation}</div>
                                        ))}
                                      </CardContent>
                                    </Card>
                                  </div>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </div>
                </>
              )}
        </div>

        <Dialog
          open={createVersionOpen}
          onOpenChange={(open) => {
            setCreateVersionOpen(open)
            if (!open) setCreateVersionForm(EMPTY_CREATE_VERSION_FORM)
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t("Create New BOM Version", "إنشاء BOM Version جديدة")}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2" data-ai-help="manufacturing_bom_detail.create_version_button">
                <Label>{t("Clone from a version (optional)", "استنساخ من نسخة (اختياري)")}</Label>
                <Select
                  value={createVersionForm.clone_from_version_id || "none"}
                  onValueChange={(value) => setCreateVersionForm((current) => ({ ...current, clone_from_version_id: value === "none" ? null : value }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("Start from an empty version", "ابدأ من نسخة فارغة")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("No cloning", "بدون استنساخ")}</SelectItem>
                    {(bom?.versions || []).map((version) => (
                      <SelectItem key={version.id} value={version.id}>
                        v{version.version_no} — {getVersionStatusLabel(version.status, appLang)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2" data-ai-help="manufacturing_bom_detail.effective_dates">
                <Label>{t("Effective From", "ساري من")}</Label>
                <Input
                  type="datetime-local"
                  value={isoToLocalDateTimeInput(createVersionForm.effective_from)}
                  onChange={(event) => setCreateVersionForm((current) => ({ ...current, effective_from: localDateTimeInputToIso(event.target.value) }))}
                />
              </div>
              <div className="space-y-2" data-ai-help="manufacturing_bom_detail.effective_dates">
                <Label>{t("Effective To", "ساري حتى")}</Label>
                <Input
                  type="datetime-local"
                  value={isoToLocalDateTimeInput(createVersionForm.effective_to)}
                  onChange={(event) => setCreateVersionForm((current) => ({ ...current, effective_to: localDateTimeInputToIso(event.target.value) }))}
                />
              </div>
              <div className="space-y-2" data-ai-help="manufacturing_bom_detail.quantity_per_unit">
                <Label>{t("Base Output Quantity", "كمية الإنتاج الأساسية")}</Label>
                <Input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={createVersionForm.base_output_qty || 1}
                  onChange={(event) => setCreateVersionForm((current) => ({ ...current, base_output_qty: Number(event.target.value || 1) }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2" data-ai-help="manufacturing_bom_detail.notes">
                <Label>{t("Change Summary", "ملخص التغيير")}</Label>
                <Textarea
                  value={typeof createVersionForm.change_summary === "string" ? createVersionForm.change_summary : ""}
                  onChange={(event) => setCreateVersionForm((current) => ({ ...current, change_summary: event.target.value }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2" data-ai-help="manufacturing_bom_detail.notes">
                <Label>{t("Notes", "ملاحظات")}</Label>
                <Textarea
                  value={typeof createVersionForm.notes === "string" ? createVersionForm.notes : ""}
                  onChange={(event) => setCreateVersionForm((current) => ({ ...current, notes: event.target.value }))}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setCreateVersionOpen(false)}>
                {t("Cancel", "إلغاء")}
              </Button>
              <Button onClick={handleCreateVersion} disabled={runningAction === "create-version"} data-ai-help="manufacturing_bom_detail.create_version_button">
                {runningAction === "create-version" ? t("Creating...", "جاري الإنشاء...") : t("Create Version", "إنشاء النسخة")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("Reject Current Version", "رفض النسخة الحالية")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-2" data-ai-help="manufacturing_bom_detail.reject_button">
              <Label>{t("Rejection Reason", "سبب الرفض")}</Label>
              <Textarea
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                placeholder={t("Enter a direct reason that helps the manufacturing or engineering team revise the version and resubmit it.", "أدخل سببًا مباشرًا يساعد فريق التصنيع أو الهندسة على تعديل النسخة وإعادة إرسالها.")}
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setRejectOpen(false)}>
                {t("Cancel", "إلغاء")}
              </Button>
              <Button variant="destructive" onClick={handleReject} disabled={runningAction === "reject"} data-ai-help="manufacturing_bom_detail.reject_button">
                {runningAction === "reject" ? t("Rejecting...", "جاري الرفض...") : t("Reject Version", "رفض النسخة")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={Boolean(confirmDialogMeta)} onOpenChange={(open) => { if (!open) setConfirmAction(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmDialogMeta?.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirmDialogMeta?.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={Boolean(runningAction)}>{t("Cancel", "إلغاء")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  void handleConfirmAction()
                }}
                disabled={Boolean(runningAction)}
                className={confirmDialogMeta?.actionClassName}
                data-ai-help={confirmAction === "approve" ? "manufacturing_bom_detail.approve_button" : confirmAction === "set-default" ? "manufacturing_bom_detail.set_default_button" : "manufacturing_bom_detail.version_status"}
              >
                {runningAction === "delete-bom" || runningAction === "delete-version" || runningAction === "approve" || runningAction === "set-default"
                  ? t("Processing...", "جاري التنفيذ...")
                  : confirmDialogMeta?.actionLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </main>
      </div>
    </PageGuard>
  )
}
