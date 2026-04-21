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
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

interface BomDetailPageProps {
  bomId: string
}

interface BomHeaderFormState {
  bom_code: string
  bom_name: string
  description: string
  is_active: boolean
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

function getVersionLockMessage(status: BomVersionStatus) {
  switch (status) {
    case "pending_approval":
      return "هذه النسخة مقفلة أثناء دورة الاعتماد. يمكنك فقط اعتمادها أو رفضها إذا كانت لديك الصلاحية."
    case "approved":
      return "هذه النسخة معتمدة بالفعل. الحقول والهيكل للقراءة فقط، ويمكن فقط تعيينها كنسخة افتراضية."
    case "superseded":
      return "هذه النسخة مستبدلة وتشغيلية للقراءة فقط."
    case "archived":
      return "هذه النسخة مؤرشفة ولا تقبل أي تعديل."
    default:
      return "هذه النسخة قابلة للتحرير."
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

  const branchCompatibleProducts = useMemo(() => {
    if (!bom?.branch_id) return products
    return products.filter((product) => !product.branch_id || product.branch_id === bom.branch_id)
  }, [products, bom?.branch_id])

  const ownerProduct = useMemo(() => {
    if (!bom?.product_id) return null
    return productMap[bom.product_id] || bom.product || null
  }, [bom, productMap])

  const selectedVersion = versionSnapshot?.version || bom?.versions.find((version) => version.id === selectedVersionId) || null
  const versionEditable = selectedVersion ? isVersionHeaderEditable(selectedVersion.status) : false
  const structureEditable = selectedVersion ? isVersionStructureEditable(selectedVersion.status) : false

  const hydrateHeaderForm = useCallback((detail: BomDetail) => {
    setHeaderForm({
      bom_code: detail.bom_code || "",
      bom_name: detail.bom_name || "",
      description: detail.description || "",
      is_active: Boolean(detail.is_active),
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
        title: "تعذر تحميل البيانات المرجعية",
        description: error?.message || "حدث خطأ أثناء تحميل الفروع والمنتجات",
      })
    }
  }, [toast])

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
        title: "تعذر تحميل تفاصيل BOM",
        description: error?.message || "حدث خطأ أثناء تحميل السجل",
      })
      setBom(null)
      setSelectedVersionId(null)
      resetVersionState()
      return null
    } finally {
      setLoadingBom(false)
    }
  }, [bomId, hydrateHeaderForm, resetVersionState, selectedVersionId, toast])

  const loadSelectedVersion = useCallback(async (versionId: string) => {
    try {
      setLoadingVersion(true)
      const snapshot = await fetchBomVersionSnapshot(versionId)
      hydrateVersionState(snapshot)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر تحميل نسخة BOM",
        description: error?.message || "حدث خطأ أثناء تحميل النسخة المحددة",
      })
      resetVersionState()
    } finally {
      setLoadingVersion(false)
    }
  }, [hydrateVersionState, resetVersionState, toast])

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
        title: "البيانات الأساسية مطلوبة",
        description: "الكود والاسم مطلوبان قبل حفظ BOM.",
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
      })

      toast({
        title: "تم حفظ BOM header",
        description: "تم تحديث بيانات السجل الرئيسية بنجاح.",
      })

      await refreshWorkspace(selectedVersionId)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر حفظ BOM",
        description: error?.message || "حدث خطأ أثناء الحفظ",
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
        title: "تم حذف BOM",
        description: "تم حذف السجل بنجاح.",
      })
      router.push("/manufacturing/boms")
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر حذف BOM",
        description: error?.message || "الحذف مرفوض بسبب قيود النسخ أو الصلاحيات.",
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
        title: "تم إنشاء نسخة جديدة",
        description: result.version_no ? `النسخة v${result.version_no} جاهزة للتحرير الآن.` : "تم إنشاء النسخة بنجاح.",
      })
      await refreshWorkspace(result.bom_version_id || selectedVersionId)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر إنشاء النسخة",
        description: error?.message || "حدث خطأ أثناء إنشاء BOM version",
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
        title: "تم حفظ version header",
        description: "تم تحديث بيانات النسخة بنجاح.",
      })

      await refreshWorkspace(selectedVersionId)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر حفظ النسخة",
        description: error?.message || "حدث خطأ أثناء حفظ header",
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
        title: "تم حذف النسخة",
        description: `تم حذف v${selectedVersion.version_no} بنجاح.`,
      })

      const nextVersionId = bom?.versions.find((version) => version.id !== selectedVersionId)?.id || null
      await refreshWorkspace(nextVersionId)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر حذف النسخة",
        description: error?.message || "الحذف مرفوض بسبب حالة النسخة الحالية.",
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
        title: "تم حفظ هيكل النسخة",
        description: "الـ lines والـ substitutes أصبحت متزامنة مع قاعدة البيانات.",
      })
      await refreshWorkspace(selectedVersionId)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر حفظ الهيكل",
        description: error?.message || "حدث خطأ أثناء تحديث structure",
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
        title: "تعذر تنفيذ العملية",
        description: error?.message || "تم رفض العملية بسبب قيود الحالة أو التزامن",
      })
      await refreshWorkspace(selectedVersionId)
    } finally {
      setRunningAction(null)
    }
  }

  const handleReject = async () => {
    if (!selectedVersionId || !rejectionReason.trim()) {
      toast({
        variant: "destructive",
        title: "سبب الرفض مطلوب",
        description: "أدخل سببًا واضحًا قبل رفض النسخة.",
      })
      return
    }

    await executeVersionAction(
      "reject",
      () => rejectBomVersion(selectedVersionId, rejectionReason.trim()),
      "تم رفض النسخة",
      "أصبحت النسخة في حالة rejected ويمكن إعادة تعديلها لاحقًا."
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
        title: "تعذر تشغيل Explosion Preview",
        description: error?.message || "حدث خطأ أثناء تنفيذ المعاينة",
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

  const updateLine = (lineIndex: number, patch: Partial<BomLineDraft>) => {
    setStructureDraft((current) =>
      current.map((line, index) => (index === lineIndex ? { ...line, ...patch } : line))
    )
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
          title: "حذف BOM",
          description: bom
            ? `سيتم حذف ${bom.bom_code} إذا كانت شروط الحذف متحققة. هذا الإجراء لا يمكن التراجع عنه.`
            : "سيتم حذف BOM الحالية إذا كانت شروط الحذف متحققة.",
          actionLabel: "حذف BOM",
          actionClassName: "bg-red-600 hover:bg-red-700",
        }
      case "delete-version":
        return {
          title: "حذف النسخة الحالية",
          description: selectedVersion
            ? `سيتم حذف النسخة v${selectedVersion.version_no} إذا كانت حالتها تسمح بذلك. لا يمكن التراجع عن هذا الإجراء.`
            : "سيتم حذف النسخة الحالية إذا كانت حالتها تسمح بذلك.",
          actionLabel: "حذف النسخة",
          actionClassName: "bg-red-600 hover:bg-red-700",
        }
      case "approve":
        return {
          title: "اعتماد النسخة الحالية",
          description: selectedVersion
            ? `سيتم اعتماد النسخة v${selectedVersion.version_no}. بعد الاعتماد ستصبح للقراءة فقط ويمكن تعيينها كنسخة افتراضية.`
            : "سيتم اعتماد النسخة الحالية.",
          actionLabel: "اعتماد",
          actionClassName: "",
        }
      case "set-default":
        return {
          title: "تعيين النسخة الافتراضية",
          description: selectedVersion
            ? `سيتم تعيين النسخة v${selectedVersion.version_no} كنسخة BOM الافتراضية لهذا المنتج.`
            : "سيتم تعيين النسخة الحالية كنسخة افتراضية.",
          actionLabel: "تعيين كافتراضية",
          actionClassName: "",
        }
      default:
        return null
    }
  }, [bom, confirmAction, selectedVersion])

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
        "تم اعتماد النسخة",
        "النسخة الآن Approved وجاهزة للتعيين الافتراضي أو الاستخدام الزمني."
      )
      return
    }

    if (action === "set-default") {
      await executeVersionAction(
        "set-default",
        () => setDefaultBomVersion(selectedVersionId),
        "تم تعيين النسخة الافتراضية",
        "أصبحت هذه النسخة هي الـ default operational version."
      )
    }
  }

  return (
    <PageGuard resource="manufacturing_boms">
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(99,102,241,0.10),_transparent_25%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)]">
        <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 pb-12 pt-20 md:px-8 md:pt-10">
          <Card className="overflow-hidden border-slate-200/70 shadow-lg shadow-slate-200/50">
            <CardHeader className="border-b bg-white/80 backdrop-blur">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">
                    <Factory className="h-3.5 w-3.5" />
                    Manufacturing Phase 2A
                  </div>
                  <div className="space-y-2">
                    <CardTitle className="text-2xl font-semibold text-slate-900">
                      {loadingBom ? "جاري تحميل BOM..." : bom ? `${bom.bom_code} — ${bom.bom_name}` : "BOM غير متاحة"}
                    </CardTitle>
                    <CardDescription className="max-w-3xl text-sm leading-6 text-slate-600">
                      هذه الصفحة هي workspace كاملة لإدارة BOM header والنسخ والهيكل وعمليات الاعتماد والـ explosion preview، وكل عملية حساسة فيها تمر حصريًا عبر B6 APIs الذرّية.
                    </CardDescription>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="outline" className="gap-2" onClick={() => refreshWorkspace(selectedVersionId)} disabled={loadingBom || loadingVersion}>
                    <RefreshCw className={`h-4 w-4 ${(loadingBom || loadingVersion) ? "animate-spin" : ""}`} />
                    تحديث السجل
                  </Button>
                  <Button variant="outline" onClick={() => router.push("/manufacturing/boms")}>
                    العودة للقائمة
                  </Button>
                  <Button onClick={() => setCreateVersionOpen(true)} disabled={!canWrite || !bom} className="gap-2">
                    <CopyPlus className="h-4 w-4" />
                    إنشاء نسخة
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 p-6">
              {loadingBom && !bom ? (
                <div className="flex min-h-[280px] items-center justify-center text-slate-500">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  جاري تحميل BOM workspace...
                </div>
              ) : !bom ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
                  <div className="mx-auto flex max-w-lg flex-col items-center gap-3">
                    <AlertTriangle className="h-10 w-10 text-amber-500" />
                    <h2 className="text-xl font-semibold text-slate-900">تعذر الوصول إلى هذا السجل</h2>
                    <p className="text-sm leading-6 text-slate-600">
                      قد يكون السجل غير موجود، أو أن الوصول إليه محجوب بالصلاحيات أو قيود الفرع الحالية.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid gap-4 xl:grid-cols-[320px,minmax(0,1fr)]">
                    <Card className="border-slate-200 bg-white/90">
                      <CardHeader className="border-b pb-4">
                        <CardTitle className="text-lg">نسخ BOM</CardTitle>
                        <CardDescription>
                          اختر النسخة التي تريد مراجعتها أو تعديلها. كل تبديل يعيد تحميل snapshot جديدة من الـ API.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 p-4">
                        {bom.versions.length === 0 ? (
                          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">
                            لا توجد نسخ بعد. أنشئ النسخة الأولى لبدء بناء الهيكل.
                          </div>
                        ) : (
                          bom.versions.map((version) => (
                            <button
                              key={version.id}
                              type="button"
                              onClick={() => setSelectedVersionId(version.id)}
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
                                    <Badge variant={getVersionStatusVariant(version.status)}>
                                      {getVersionStatusLabel(version.status)}
                                    </Badge>
                                    {version.is_default ? <Badge variant="outline">Default</Badge> : null}
                                  </div>
                                </div>
                                <div className="text-xs text-slate-500">{formatDateOnly(version.updated_at)}</div>
                              </div>
                              <div className="mt-3 space-y-1 text-xs text-slate-500">
                                <div>Effective from: {formatDateOnly(version.effective_from)}</div>
                                <div>Effective to: {formatDateOnly(version.effective_to)}</div>
                              </div>
                            </button>
                          ))
                        )}
                      </CardContent>
                    </Card>

                    <Tabs defaultValue="overview" className="space-y-4">
                      <TabsList className="w-full justify-start gap-1 overflow-x-auto">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="structure" disabled={!selectedVersionId}>
                          Structure Editor
                        </TabsTrigger>
                        <TabsTrigger value="preview" disabled={!selectedVersionId}>
                          Explosion Preview
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="overview" className="space-y-4">
                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr),minmax(0,1fr)]">
                          <Card className="border-slate-200 bg-white/90">
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2 text-lg">
                                <Package2 className="h-5 w-5 text-cyan-700" />
                                BOM Header
                              </CardTitle>
                              <CardDescription>
                                owner product و branch و usage للقراءة فقط. التعديل هنا يقتصر على الكود والاسم والوصف والحالة.
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                  <Label>كود BOM</Label>
                                  <Input
                                    value={headerForm.bom_code}
                                    onChange={(event) => setHeaderForm((current) => ({ ...current, bom_code: event.target.value }))}
                                    disabled={!canUpdate}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>اسم BOM</Label>
                                  <Input
                                    value={headerForm.bom_name}
                                    onChange={(event) => setHeaderForm((current) => ({ ...current, bom_name: event.target.value }))}
                                    disabled={!canUpdate}
                                  />
                                </div>
                              </div>
                              <div className="grid gap-4 md:grid-cols-3">
                                <div className="space-y-2">
                                  <Label>الاستخدام</Label>
                                  <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                    {BOM_USAGE_OPTIONS.find((option) => option.value === bom.bom_usage)?.labelAr || bom.bom_usage}
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label>الفرع</Label>
                                  <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                    {buildBranchLabel(branchMap[bom.branch_id])}
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label>المنتج المالك</Label>
                                  <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                    {buildProductLabel(ownerProduct)}
                                  </div>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label>الوصف</Label>
                                <Textarea
                                  value={headerForm.description}
                                  onChange={(event) => setHeaderForm((current) => ({ ...current, description: event.target.value }))}
                                  disabled={!canUpdate}
                                />
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-slate-50 px-4 py-3">
                                <div className="space-y-1">
                                  <div className="font-medium text-slate-900">نشاط BOM</div>
                                  <div className="text-sm text-slate-500">يمكن تعطيل السجل دون فقد تاريخ النسخ أو الاعتماد.</div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <Badge variant={headerForm.is_active ? "default" : "outline"}>
                                    {headerForm.is_active ? "نشط" : "غير نشط"}
                                  </Badge>
                                  <Switch
                                    checked={headerForm.is_active}
                                    onCheckedChange={(checked) => setHeaderForm((current) => ({ ...current, is_active: Boolean(checked) }))}
                                    disabled={!canUpdate}
                                  />
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="text-xs text-slate-500">
                                  آخر تحديث: {formatDateTime(bom.updated_at)}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Button variant="outline" onClick={() => hydrateHeaderForm(bom)} disabled={savingHeader}>
                                    إعادة تعيين
                                  </Button>
                                  <Button onClick={handleSaveHeader} disabled={!canUpdate || savingHeader} className="gap-2">
                                    {savingHeader ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                    حفظ Header
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    onClick={() => setConfirmAction("delete-bom")}
                                    disabled={!canDelete || runningAction === "delete-bom"}
                                    className="gap-2"
                                  >
                                    {runningAction === "delete-bom" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                    حذف BOM
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="border-slate-200 bg-white/90">
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2 text-lg">
                                <ShieldCheck className="h-5 w-5 text-indigo-700" />
                                Version Workspace
                              </CardTitle>
                              <CardDescription>
                                إدارة حالة النسخة الحالية، تعديل header الخاص بها، وتنفيذ أوامر الاعتماد والتعيين الافتراضي بشكل ذري.
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              {loadingVersion && selectedVersionId ? (
                                <div className="flex min-h-[220px] items-center justify-center text-slate-500">
                                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                  جاري تحميل النسخة المحددة...
                                </div>
                              ) : !selectedVersion || !versionSnapshot ? (
                                <div className="rounded-2xl border border-dashed p-8 text-center">
                                  <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                                    <WandSparkles className="h-8 w-8 text-slate-300" />
                                    <div className="text-lg font-medium text-slate-900">لا توجد نسخة محددة</div>
                                    <p className="text-sm leading-6 text-slate-500">
                                      أنشئ نسخة جديدة أو اختر نسخة من القائمة الجانبية لبدء إدارة التفاصيل والهيكل.
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border bg-slate-50 px-4 py-3">
                                    <div className="space-y-2">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <div className="text-lg font-semibold text-slate-900">v{selectedVersion.version_no}</div>
                                        <Badge variant={getVersionStatusVariant(selectedVersion.status)}>
                                          {getVersionStatusLabel(selectedVersion.status)}
                                        </Badge>
                                        {selectedVersion.is_default ? <Badge variant="outline">Default</Badge> : null}
                                      </div>
                                      <p className="max-w-xl text-sm leading-6 text-slate-600">
                                        {getVersionLockMessage(selectedVersion.status)}
                                      </p>
                                    </div>
                                    <div className="grid gap-2 text-xs text-slate-500 sm:text-sm">
                                      <div>Updated: {formatDateTime(selectedVersion.updated_at)}</div>
                                      <div>Submitted: {formatDateTime(selectedVersion.submitted_at)}</div>
                                      <div>Approved: {formatDateTime(selectedVersion.approved_at)}</div>
                                      <div>Rejected: {formatDateTime(selectedVersion.rejected_at)}</div>
                                    </div>
                                  </div>

                                  <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                      <Label>Effective From</Label>
                                      <Input
                                        type="datetime-local"
                                        value={versionForm.effective_from}
                                        onChange={(event) => setVersionForm((current) => ({ ...current, effective_from: event.target.value }))}
                                        disabled={!versionEditable || !canUpdate}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Effective To</Label>
                                      <Input
                                        type="datetime-local"
                                        value={versionForm.effective_to}
                                        onChange={(event) => setVersionForm((current) => ({ ...current, effective_to: event.target.value }))}
                                        disabled={!versionEditable || !canUpdate}
                                      />
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Base Output Quantity</Label>
                                    <Input
                                      type="number"
                                      min="0.0001"
                                      step="0.0001"
                                      value={versionForm.base_output_qty}
                                      onChange={(event) => setVersionForm((current) => ({ ...current, base_output_qty: event.target.value }))}
                                      disabled={!versionEditable || !canUpdate}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Change Summary</Label>
                                    <Textarea
                                      value={versionForm.change_summary}
                                      onChange={(event) => setVersionForm((current) => ({ ...current, change_summary: event.target.value }))}
                                      disabled={!versionEditable || !canUpdate}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Notes</Label>
                                    <Textarea
                                      value={versionForm.notes}
                                      onChange={(event) => setVersionForm((current) => ({ ...current, notes: event.target.value }))}
                                      disabled={!versionEditable || !canUpdate}
                                    />
                                  </div>

                                  <Separator />

                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      onClick={handleSaveVersionHeader}
                                      disabled={!versionEditable || !canUpdate || savingVersionHeader}
                                      className="gap-2"
                                    >
                                      {savingVersionHeader ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                      حفظ Version Header
                                    </Button>
                                    <Button
                                      variant="outline"
                                      onClick={() => {
                                        if (!selectedVersionId) return
                                        void executeVersionAction("submit", () => submitBomVersion(selectedVersionId), "تم إرسال النسخة للاعتماد", "أصبحت النسخة الآن في حالة pending_approval.")
                                      }}
                                      disabled={!selectedVersionId || !canUpdate || !canSubmitVersion(selectedVersion.status) || runningAction === "submit"}
                                      className="gap-2"
                                    >
                                      {runningAction === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                      Submit Approval
                                    </Button>
                                    <Button
                                      variant="outline"
                                      onClick={() => setConfirmAction("approve")}
                                      disabled={!selectedVersionId || !canApprove || !canApproveVersion(selectedVersion.status) || runningAction === "approve"}
                                      className="gap-2"
                                    >
                                      {runningAction === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                      Approve
                                    </Button>
                                    <Button
                                      variant="outline"
                                      onClick={() => setRejectOpen(true)}
                                      disabled={!selectedVersionId || !canApprove || !canRejectVersion(selectedVersion.status) || runningAction === "reject"}
                                      className="gap-2"
                                    >
                                      <ShieldX className="h-4 w-4" />
                                      Reject
                                    </Button>
                                    <Button
                                      variant="outline"
                                      onClick={() => setConfirmAction("set-default")}
                                      disabled={!selectedVersionId || !canUpdate || !canSetDefaultVersion(selectedVersion.status, selectedVersion.is_default) || runningAction === "set-default"}
                                      className="gap-2"
                                    >
                                      {runningAction === "set-default" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                      Set Default
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      onClick={() => setConfirmAction("delete-version")}
                                      disabled={!selectedVersionId || !canDelete || !canDeleteVersion(selectedVersion.status) || runningAction === "delete-version"}
                                      className="gap-2"
                                    >
                                      {runningAction === "delete-version" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                      Delete Version
                                    </Button>
                                  </div>
                                </>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      </TabsContent>

                      <TabsContent value="structure">
                        <Card className="border-slate-200 bg-white/90">
                          <CardHeader>
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                              <div>
                                <CardTitle className="text-lg">Structure Editor</CardTitle>
                                <CardDescription>
                                  هذه الشاشة تحفظ الهيكل كاملًا دفعة واحدة عبر endpoint ذرّي. أي حفظ هنا يعيد استبدال الـ lines والـ substitutes في نفس المعاملة.
                                </CardDescription>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button onClick={addLine} disabled={!structureEditable || !canUpdate}>
                                  إضافة Line
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => setStructureDraft(versionSnapshot ? bomSnapshotToDraftLines(versionSnapshot.lines) : [])}
                                  disabled={savingStructure}
                                >
                                  إعادة تحميل المسودة
                                </Button>
                                <Button
                                  onClick={handleSaveStructure}
                                  disabled={!selectedVersionId || !structureEditable || !canUpdate || savingStructure}
                                  className="gap-2"
                                >
                                  {savingStructure ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                  حفظ الهيكل
                                </Button>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            {selectedVersion ? (
                              <div className={`rounded-2xl border px-4 py-3 text-sm ${
                                structureEditable ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"
                              }`}>
                                {structureEditable
                                  ? "النسخة الحالية قابلة لتعديل الهيكل. الحفظ هنا يمر عبر update structure atomic RPC."
                                  : getVersionLockMessage(selectedVersion.status)}
                              </div>
                            ) : null}

                            {structureDraft.length === 0 ? (
                              <div className="rounded-2xl border border-dashed p-10 text-center">
                                <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                                  <Package2 className="h-8 w-8 text-slate-300" />
                                  <div className="text-lg font-medium text-slate-900">لا توجد Lines بعد</div>
                                  <p className="text-sm leading-6 text-slate-500">
                                    ابدأ بإضافة component line أو by/co-product ثم احفظ الهيكل بالكامل.
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                {structureDraft.map((line, lineIndex) => (
                                  <Card key={`line-${lineIndex}`} className="border-slate-200">
                                    <CardHeader className="pb-4">
                                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                        <div>
                                          <CardTitle className="text-base">Line #{line.line_no}</CardTitle>
                                          <CardDescription>
                                            استخدم `component` للمدخلات، و`co_product/by_product` للمخرجات الإضافية.
                                          </CardDescription>
                                        </div>
                                        <Button
                                          variant="destructive"
                                          size="sm"
                                          onClick={() => removeLine(lineIndex)}
                                          disabled={!structureEditable || !canUpdate}
                                        >
                                          حذف Line
                                        </Button>
                                      </div>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                        <div className="space-y-2">
                                          <Label>Line No</Label>
                                          <Input
                                            type="number"
                                            min="1"
                                            value={line.line_no}
                                            onChange={(event) => updateLine(lineIndex, { line_no: Number(event.target.value || 1) })}
                                            disabled={!structureEditable || !canUpdate}
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label>Line Type</Label>
                                          <select
                                            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                                            value={line.line_type}
                                            onChange={(event) => updateLine(lineIndex, { line_type: event.target.value as BomLineDraft["line_type"] })}
                                            disabled={!structureEditable || !canUpdate}
                                          >
                                            {BOM_LINE_TYPE_OPTIONS.map((option) => (
                                              <option key={option.value} value={option.value}>
                                                {option.labelAr}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                        <div className="space-y-2 xl:col-span-2">
                                          <Label>Component / Output Product</Label>
                                          <select
                                            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                                            value={line.component_product_id}
                                            onChange={(event) => updateLine(lineIndex, { component_product_id: event.target.value })}
                                            disabled={!structureEditable || !canUpdate}
                                          >
                                            <option value="">اختر المنتج</option>
                                            {branchCompatibleProducts.map((product) => (
                                              <option key={product.id} value={product.id}>
                                                {buildProductLabel(product)}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                      </div>

                                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                        <div className="space-y-2">
                                          <Label>Quantity Per</Label>
                                          <Input
                                            type="number"
                                            min="0.0001"
                                            step="0.0001"
                                            value={line.quantity_per}
                                            onChange={(event) => updateLine(lineIndex, { quantity_per: Number(event.target.value || 0) })}
                                            disabled={!structureEditable || !canUpdate}
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label>Scrap %</Label>
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
                                        <div className="space-y-2">
                                          <Label>Issue UOM</Label>
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
                                            <div className="font-medium text-slate-900">Optional Line</div>
                                            <div className="text-xs text-slate-500">توضيح بصري فقط. الحماية النهائية تبقى في DB.</div>
                                          </div>
                                        </div>
                                      </div>

                                      <div className="space-y-2">
                                        <Label>Notes</Label>
                                        <Textarea
                                          value={line.notes || ""}
                                          onChange={(event) => updateLine(lineIndex, { notes: event.target.value })}
                                          disabled={!structureEditable || !canUpdate}
                                        />
                                      </div>

                                      <Separator />

                                      <div className="space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                          <div>
                                            <div className="text-sm font-semibold text-slate-900">Substitutes</div>
                                            <div className="text-xs text-slate-500">
                                              allowed only for component lines. DB سيمنع أي حالة غير صالحة حتى لو حاولت الواجهة إرسالها.
                                            </div>
                                          </div>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => addSubstitute(lineIndex)}
                                            disabled={!structureEditable || !canUpdate || line.line_type !== "component"}
                                          >
                                            إضافة Substitute
                                          </Button>
                                        </div>

                                        {line.substitutes.length === 0 ? (
                                          <div className="rounded-xl border border-dashed p-4 text-center text-sm text-slate-500">
                                            لا توجد بدائل لهذا السطر.
                                          </div>
                                        ) : (
                                          <div className="space-y-3">
                                            {line.substitutes.map((substitute, substituteIndex) => (
                                              <div key={`sub-${lineIndex}-${substituteIndex}`} className="rounded-xl border bg-slate-50 p-4">
                                                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                                  <div className="space-y-2 xl:col-span-2">
                                                    <Label>Substitute Product</Label>
                                                    <select
                                                      className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                                                      value={substitute.substitute_product_id}
                                                      onChange={(event) => updateSubstitute(lineIndex, substituteIndex, { substitute_product_id: event.target.value })}
                                                      disabled={!structureEditable || !canUpdate}
                                                    >
                                                      <option value="">اختر البديل</option>
                                                      {branchCompatibleProducts.map((product) => (
                                                        <option key={product.id} value={product.id}>
                                                          {buildProductLabel(product)}
                                                        </option>
                                                      ))}
                                                    </select>
                                                  </div>
                                                  <div className="space-y-2">
                                                    <Label>Quantity</Label>
                                                    <Input
                                                      type="number"
                                                      min="0.0001"
                                                      step="0.0001"
                                                      value={substitute.substitute_quantity}
                                                      onChange={(event) => updateSubstitute(lineIndex, substituteIndex, { substitute_quantity: Number(event.target.value || 0) })}
                                                      disabled={!structureEditable || !canUpdate}
                                                    />
                                                  </div>
                                                  <div className="space-y-2">
                                                    <Label>Priority</Label>
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
                                                  <div className="space-y-2">
                                                    <Label>Effective From</Label>
                                                    <Input
                                                      type="datetime-local"
                                                      value={substitute.effective_from || ""}
                                                      onChange={(event) => updateSubstitute(lineIndex, substituteIndex, { effective_from: event.target.value })}
                                                      disabled={!structureEditable || !canUpdate}
                                                    />
                                                  </div>
                                                  <div className="space-y-2">
                                                    <Label>Effective To</Label>
                                                    <Input
                                                      type="datetime-local"
                                                      value={substitute.effective_to || ""}
                                                      onChange={(event) => updateSubstitute(lineIndex, substituteIndex, { effective_to: event.target.value })}
                                                      disabled={!structureEditable || !canUpdate}
                                                    />
                                                  </div>
                                                </div>
                                                <div className="mt-4 space-y-2">
                                                  <Label>Notes</Label>
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
                                                    حذف Substitute
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
                      </TabsContent>

                      <TabsContent value="preview">
                        <Card className="border-slate-200 bg-white/90">
                          <CardHeader>
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                              <div>
                                <CardTitle className="text-lg">Explosion Preview</CardTitle>
                                <CardDescription>
                                  معاينة قراءة فقط، single-level فقط، ولا تقوم بأي حجز أو استهلاك أو اتخاذ قرار stock.
                                </CardDescription>
                              </div>
                              <Button onClick={handleRunPreview} disabled={!selectedVersionId || previewLoading} className="gap-2">
                                {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
                                تشغيل المعاينة
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-6">
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                              <div className="space-y-2">
                                <Label>Input Quantity</Label>
                                <Input
                                  type="number"
                                  min="0.0001"
                                  step="0.0001"
                                  value={previewForm.input_quantity}
                                  onChange={(event) => setPreviewForm((current) => ({ ...current, input_quantity: Number(event.target.value || 1) }))}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>As Of Date</Label>
                                <Input
                                  type="datetime-local"
                                  value={previewForm.as_of_date || ""}
                                  onChange={(event) => setPreviewForm((current) => ({ ...current, as_of_date: event.target.value }))}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Substitute Strategy</Label>
                                <Select
                                  value={previewForm.substitute_strategy || "primary_only"}
                                  onValueChange={(value) => setPreviewForm((current) => ({ ...current, substitute_strategy: value as ExplosionPreviewPayload["substitute_strategy"] }))}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="primary_only">Primary Only</SelectItem>
                                    <SelectItem value="none">None</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2 rounded-2xl border px-4 py-3">
                                <div className="text-sm font-medium text-slate-900">Preview Flags</div>
                                <div className="mt-3 space-y-3 text-sm">
                                  <label className="flex items-center gap-2">
                                    <Checkbox
                                      checked={Boolean(previewForm.include_substitutes)}
                                      onCheckedChange={(checked) => setPreviewForm((current) => ({ ...current, include_substitutes: Boolean(checked) }))}
                                    />
                                    Include substitutes
                                  </label>
                                  <label className="flex items-center gap-2">
                                    <Checkbox
                                      checked={Boolean(previewForm.include_co_products)}
                                      onCheckedChange={(checked) => setPreviewForm((current) => ({ ...current, include_co_products: Boolean(checked) }))}
                                    />
                                    Include co-products
                                  </label>
                                  <label className="flex items-center gap-2">
                                    <Checkbox
                                      checked={Boolean(previewForm.include_by_products)}
                                      onCheckedChange={(checked) => setPreviewForm((current) => ({ ...current, include_by_products: Boolean(checked) }))}
                                    />
                                    Include by-products
                                  </label>
                                  <label className="flex items-center gap-2">
                                    <Checkbox
                                      checked={Boolean(previewForm.respect_effective_dates)}
                                      onCheckedChange={(checked) => setPreviewForm((current) => ({ ...current, respect_effective_dates: Boolean(checked) }))}
                                    />
                                    Respect effective dates
                                  </label>
                                </div>
                              </div>
                            </div>

                            {!previewResult ? (
                              <div className="rounded-2xl border border-dashed p-10 text-center">
                                <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                                  <FileSearch className="h-8 w-8 text-slate-300" />
                                  <div className="text-lg font-medium text-slate-900">لا توجد معاينة بعد</div>
                                  <p className="text-sm leading-6 text-slate-500">
                                    أدخل كمية الإدخال واضغط تشغيل المعاينة لعرض المكونات والبدائل والمخرجات الثانوية.
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-6">
                                <div className="grid gap-4 md:grid-cols-4">
                                  <Card className="border-cyan-200 bg-cyan-50/80">
                                    <CardContent className="p-4">
                                      <div className="text-sm text-slate-500">Scale Factor</div>
                                      <div className="mt-1 text-2xl font-semibold text-slate-900">{formatQuantity(previewResult.scale_factor, 6)}</div>
                                    </CardContent>
                                  </Card>
                                  <Card className="border-indigo-200 bg-indigo-50/80">
                                    <CardContent className="p-4">
                                      <div className="text-sm text-slate-500">Components</div>
                                      <div className="mt-1 text-2xl font-semibold text-slate-900">{previewResult.components.length}</div>
                                    </CardContent>
                                  </Card>
                                  <Card className="border-emerald-200 bg-emerald-50/80">
                                    <CardContent className="p-4">
                                      <div className="text-sm text-slate-500">Co Products</div>
                                      <div className="mt-1 text-2xl font-semibold text-slate-900">{previewResult.co_products.length}</div>
                                    </CardContent>
                                  </Card>
                                  <Card className="border-amber-200 bg-amber-50/80">
                                    <CardContent className="p-4">
                                      <div className="text-sm text-slate-500">By Products</div>
                                      <div className="mt-1 text-2xl font-semibold text-slate-900">{previewResult.by_products.length}</div>
                                    </CardContent>
                                  </Card>
                                </div>

                                <Card>
                                  <CardHeader>
                                    <CardTitle className="text-base">Required Components</CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Line</TableHead>
                                          <TableHead>Component</TableHead>
                                          <TableHead>Required</TableHead>
                                          <TableHead>Gross Required</TableHead>
                                          <TableHead>Scrap %</TableHead>
                                          <TableHead>Substitutes</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {previewResult.components.length === 0 ? (
                                          <TableRow>
                                            <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                                              لا توجد component lines في هذه النسخة.
                                            </TableCell>
                                          </TableRow>
                                        ) : (
                                          previewResult.components.map((component) => (
                                            <TableRow key={component.line_id}>
                                              <TableCell>#{component.line_no}</TableCell>
                                              <TableCell className="max-w-sm whitespace-normal">
                                                <div className="font-medium text-slate-900">{component.component_name || component.component_product_id}</div>
                                                <div className="text-xs text-slate-500">{component.component_sku || "No SKU"}</div>
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
                                                          Qty {formatQuantity(substitute.substitute_quantity)} · Priority {substitute.priority}
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
                                      <CardTitle className="text-base">Co Products</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                      {previewResult.co_products.length === 0 ? (
                                        <div className="text-sm text-slate-500">لا توجد co-products في هذه المعاينة.</div>
                                      ) : (
                                        previewResult.co_products.map((item) => (
                                          <div key={item.line_id} className="rounded-xl border p-3">
                                            <div className="font-medium text-slate-900">{item.product_name || item.product_id}</div>
                                            <div className="mt-1 text-sm text-slate-500">
                                              Output {formatQuantity(item.output_quantity)} from line #{item.line_no}
                                            </div>
                                          </div>
                                        ))
                                      )}
                                    </CardContent>
                                  </Card>
                                  <Card>
                                    <CardHeader>
                                      <CardTitle className="text-base">By Products</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                      {previewResult.by_products.length === 0 ? (
                                        <div className="text-sm text-slate-500">لا توجد by-products في هذه المعاينة.</div>
                                      ) : (
                                        previewResult.by_products.map((item) => (
                                          <div key={item.line_id} className="rounded-xl border p-3">
                                            <div className="font-medium text-slate-900">{item.product_name || item.product_id}</div>
                                            <div className="mt-1 text-sm text-slate-500">
                                              Output {formatQuantity(item.output_quantity)} from line #{item.line_no}
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
                                        <CardTitle className="text-base text-amber-900">Warnings</CardTitle>
                                      </CardHeader>
                                      <CardContent className="space-y-2 text-sm text-amber-900">
                                        {previewResult.warnings.length === 0 ? (
                                          <div>لا توجد تحذيرات.</div>
                                        ) : (
                                          previewResult.warnings.map((warning, index) => <div key={`warning-${index}`}>• {warning}</div>)
                                        )}
                                      </CardContent>
                                    </Card>
                                    <Card className="border-slate-200 bg-slate-50">
                                      <CardHeader>
                                        <CardTitle className="text-base">Known Limitations</CardTitle>
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
                      </TabsContent>
                    </Tabs>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </main>

        <Dialog open={createVersionOpen} onOpenChange={setCreateVersionOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>إنشاء BOM Version جديدة</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Clone From Version</Label>
                <Select
                  value={createVersionForm.clone_from_version_id || "none"}
                  onValueChange={(value) => setCreateVersionForm((current) => ({ ...current, clone_from_version_id: value === "none" ? null : value }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="ابدأ من نسخة فارغة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون استنساخ</SelectItem>
                    {(bom?.versions || []).map((version) => (
                      <SelectItem key={version.id} value={version.id}>
                        v{version.version_no} — {getVersionStatusLabel(version.status)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Effective From</Label>
                <Input
                  type="datetime-local"
                  value={isoToLocalDateTimeInput(createVersionForm.effective_from)}
                  onChange={(event) => setCreateVersionForm((current) => ({ ...current, effective_from: localDateTimeInputToIso(event.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Effective To</Label>
                <Input
                  type="datetime-local"
                  value={isoToLocalDateTimeInput(createVersionForm.effective_to)}
                  onChange={(event) => setCreateVersionForm((current) => ({ ...current, effective_to: localDateTimeInputToIso(event.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Base Output Quantity</Label>
                <Input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={createVersionForm.base_output_qty || 1}
                  onChange={(event) => setCreateVersionForm((current) => ({ ...current, base_output_qty: Number(event.target.value || 1) }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Change Summary</Label>
                <Textarea
                  value={typeof createVersionForm.change_summary === "string" ? createVersionForm.change_summary : ""}
                  onChange={(event) => setCreateVersionForm((current) => ({ ...current, change_summary: event.target.value }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={typeof createVersionForm.notes === "string" ? createVersionForm.notes : ""}
                  onChange={(event) => setCreateVersionForm((current) => ({ ...current, notes: event.target.value }))}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setCreateVersionOpen(false)}>
                إلغاء
              </Button>
              <Button onClick={handleCreateVersion} disabled={runningAction === "create-version"}>
                {runningAction === "create-version" ? "جاري الإنشاء..." : "إنشاء النسخة"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>رفض النسخة الحالية</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label>سبب الرفض</Label>
              <Textarea
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                placeholder="أدخل سببًا مباشرًا يساعد فريق التصنيع أو الهندسة على تعديل النسخة وإعادة إرسالها."
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setRejectOpen(false)}>
                إلغاء
              </Button>
              <Button variant="destructive" onClick={handleReject} disabled={runningAction === "reject"}>
                {runningAction === "reject" ? "جاري الرفض..." : "رفض النسخة"}
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
              <AlertDialogCancel disabled={Boolean(runningAction)}>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  void handleConfirmAction()
                }}
                disabled={Boolean(runningAction)}
                className={confirmDialogMeta?.actionClassName}
              >
                {runningAction === "delete-bom" || runningAction === "delete-version" || runningAction === "approve" || runningAction === "set-default"
                  ? "جاري التنفيذ..."
                  : confirmDialogMeta?.actionLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageGuard>
  )
}
