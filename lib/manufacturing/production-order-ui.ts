"use client"

export const PRODUCTION_ORDER_STATUSES = ["draft", "released", "in_progress", "completed", "cancelled"] as const
export const PRODUCTION_ORDER_OPERATION_STATUSES = ["pending", "ready", "in_progress", "completed", "cancelled"] as const
export const PRODUCTION_ORDER_PROGRESS_STATUSES = ["ready", "in_progress", "completed", "cancelled"] as const

export type AppLang = "ar" | "en"
export type ProductionOrderStatus = (typeof PRODUCTION_ORDER_STATUSES)[number]
export type ProductionOrderOperationStatus = (typeof PRODUCTION_ORDER_OPERATION_STATUSES)[number]
export type ProductionOrderProgressStatus = (typeof PRODUCTION_ORDER_PROGRESS_STATUSES)[number]

export interface ProductOption {
  id: string
  sku?: string | null
  name?: string | null
  branch_id?: string | null
  item_type?: string | null
  product_type?: string | null
}

export interface BomSummary {
  id: string
  bom_code?: string | null
  bom_name?: string | null
  bom_usage?: string | null
}

export interface BomVersionSummary {
  id: string
  bom_id?: string | null
  version_no?: number | null
  status?: string | null
}

export interface RoutingSummary {
  id: string
  routing_code?: string | null
  routing_name?: string | null
  routing_usage?: string | null
}

export interface RoutingVersionSummary {
  id: string
  routing_id?: string | null
  version_no?: number | null
  status?: string | null
}

export interface WorkCenterSummary {
  id: string
  code?: string | null
  name?: string | null
  status?: string | null
  work_center_type?: string | null
}

export interface SourceRoutingOperationSummary {
  id: string
  operation_no?: number | null
  operation_code?: string | null
  operation_name?: string | null
}

export interface ProductionOrderListItem {
  id: string
  company_id: string
  branch_id: string
  order_no: string
  product_id: string
  bom_id: string
  bom_version_id: string
  routing_id: string
  routing_version_id: string
  issue_warehouse_id?: string | null
  receipt_warehouse_id?: string | null
  planned_quantity: number | string
  completed_quantity: number | string
  order_uom?: string | null
  status: ProductionOrderStatus
  planned_start_at?: string | null
  planned_end_at?: string | null
  released_at?: string | null
  released_by?: string | null
  started_at?: string | null
  started_by?: string | null
  completed_at?: string | null
  completed_by?: string | null
  cancelled_at?: string | null
  cancelled_by?: string | null
  cancellation_reason?: string | null
  notes?: string | null
  created_by?: string | null
  updated_by?: string | null
  created_at?: string | null
  updated_at?: string | null
  product?: ProductOption | null
  bom?: BomSummary | null
  bom_version?: BomVersionSummary | null
  routing?: RoutingSummary | null
  routing_version?: RoutingVersionSummary | null
}

export interface ProductionOrderOperation {
  id: string
  company_id: string
  branch_id: string
  production_order_id: string
  routing_version_id: string
  source_routing_operation_id?: string | null
  operation_no: number
  operation_code: string
  operation_name: string
  work_center_id: string
  status: ProductionOrderOperationStatus
  planned_quantity: number | string
  completed_quantity: number | string
  setup_time_minutes: number | string
  run_time_minutes_per_unit: number | string
  queue_time_minutes: number | string
  move_time_minutes: number | string
  labor_time_minutes: number | string
  machine_time_minutes: number | string
  quality_checkpoint_required: boolean
  instructions?: string | null
  planned_start_at?: string | null
  planned_end_at?: string | null
  actual_start_at?: string | null
  started_by?: string | null
  actual_end_at?: string | null
  completed_by?: string | null
  last_progress_at?: string | null
  notes?: string | null
  created_by?: string | null
  updated_by?: string | null
  created_at?: string | null
  updated_at?: string | null
  work_center?: WorkCenterSummary | null
  source_routing_operation?: SourceRoutingOperationSummary | null
}

export interface ProductionOrderSnapshot {
  order: ProductionOrderListItem
  product?: ProductOption | null
  bom?: BomSummary | null
  bom_version?: BomVersionSummary | null
  routing?: RoutingSummary | null
  routing_version?: RoutingVersionSummary | null
  operations: ProductionOrderOperation[]
}

export interface ProductionOrderOperationSnapshot {
  order: ProductionOrderListItem
  operation: ProductionOrderOperation
}

export interface ProductionOrderListFilters {
  branchId?: string
  productId?: string
  status?: ProductionOrderStatus | "all"
  q?: string
}

export interface ProductionOrderCreatePayload {
  branch_id?: string | null
  product_id: string
  bom_id: string
  bom_version_id: string
  routing_id: string
  routing_version_id: string
  issue_warehouse_id?: string | null
  receipt_warehouse_id?: string | null
  planned_quantity: number
  order_uom?: string | null
  planned_start_at?: string | null
  planned_end_at?: string | null
  notes?: string | null
}

export interface ProductionOrderUpdatePayload {
  bom_id?: string
  bom_version_id?: string
  issue_warehouse_id?: string | null
  receipt_warehouse_id?: string | null
  order_uom?: string | null
  planned_start_at?: string | null
  planned_end_at?: string | null
  notes?: string | null
}

export interface RegenerateProductionOrderPayload {
  bom_id?: string
  bom_version_id?: string
  routing_id?: string
  routing_version_id?: string
  planned_quantity?: number
  issue_warehouse_id?: string | null
  receipt_warehouse_id?: string | null
  order_uom?: string | null
  planned_start_at?: string | null
  planned_end_at?: string | null
  notes?: string | null
}

export interface CompleteProductionOrderPayload {
  completed_quantity: number
  completed_at?: string | null
}

export interface CancelProductionOrderPayload {
  cancellation_reason: string
  cancelled_at?: string | null
}

export interface UpdateProductionOrderOperationProgressPayload {
  status?: ProductionOrderProgressStatus
  completed_quantity?: number
  actual_start_at?: string | null
  actual_end_at?: string | null
  notes?: string | null
}

interface SuccessfulResponse<T> {
  success?: boolean
  data?: T
  meta?: Record<string, unknown>
}

const COPY = {
  ar: {
    list: {
      pill: "Production Orders",
      title: "أوامر الإنتاج",
      description:
        "هذه الشاشة تعرض أوامر الإنتاج وتفتح صفحة التفاصيل لإدارة الأمر والعمليات التنفيذية عبر Production Orders B6 فقط.",
      refresh: "تحديث",
      create: "إنشاء أمر إنتاج",
      apply: "تطبيق",
      search: "بحث سريع",
      searchPlaceholder: "ابحث برقم الأمر",
      branchId: "Branch ID",
      productId: "Product ID",
      status: "الحالة",
      all: "الكل",
      statsShown: "الأوامر المعروضة",
      statsOpen: "الأوامر المفتوحة",
      statsCompleted: "الأوامر المكتملة",
      tableOrder: "الأمر / الحالة",
      tableOwner: "المنتج",
      tableSource: "BOM / Routing",
      tableQuantity: "الكمية",
      tableUpdated: "آخر تحديث",
      tableAction: "إجراء",
      open: "فتح",
      loading: "جاري تحميل أوامر الإنتاج...",
      emptyTitle: "لا توجد أوامر إنتاج مطابقة",
      emptyDescription: "يمكنك تعديل الفلاتر أو إنشاء أمر إنتاج جديد من الزر أعلى الصفحة.",
      loadErrorTitle: "تعذر تحميل أوامر الإنتاج",
      loadErrorDescription: "حدث خطأ أثناء تحميل القائمة",
      createDialogTitle: "إنشاء أمر إنتاج",
      createDialogDescription:
        "هذه النسخة تعتمد على B6 endpoints فقط، لذلك يتم إدخال المراجع الأساسية عبر IDs مباشرة حتى نضيف lookup layer لاحقًا.",
      createValidationTitle: "البيانات الأساسية غير مكتملة",
      createValidationDescription:
        "product_id وbom_id وbom_version_id وrouting_id وrouting_version_id وplanned_quantity مطلوبة قبل الإنشاء.",
      createSuccessTitle: "تم إنشاء أمر الإنتاج",
      createSuccessDescription: (orderNo: string) => `تم إنشاء ${orderNo} مع snapshot أولي للعمليات.`,
      createErrorTitle: "تعذر إنشاء أمر الإنتاج",
      createErrorDescription: "حدث خطأ أثناء الإنشاء",
      fields: {
        branchId: "Branch ID",
        branchHint: "اختياري. اتركه فارغًا لاستخدام branch scope الحالي.",
        productId: "Product ID",
        bomId: "BOM ID",
        bomVersionId: "BOM Version ID",
        routingId: "Routing ID",
        routingVersionId: "Routing Version ID",
        issueWarehouseId: "Issue Warehouse ID",
        receiptWarehouseId: "Receipt Warehouse ID",
        plannedQuantity: "Planned Quantity",
        orderUom: "Order UOM",
        plannedStartAt: "Planned Start",
        plannedEndAt: "Planned End",
        notes: "ملاحظات",
      },
    },
    detail: {
      pill: "Execution Snapshot",
      title: "تفاصيل أمر الإنتاج",
      description:
        "تعتمد هذه الصفحة على reload بعد كل command. قاعدة البيانات والـ API هما المصدر الوحيد للحقيقة، ولا يوجد sequencing متفائل في الواجهة.",
      reload: "إعادة تحميل",
      back: "العودة للقائمة",
      loading: "جاري تحميل تفاصيل أمر الإنتاج...",
      loadErrorTitle: "تعذر تحميل أمر الإنتاج",
      loadErrorDescription: "حدث خطأ أثناء تحميل السجل",
      tabsOverview: "نظرة عامة",
      tabsOperations: "العمليات",
      summaryTitle: "ملخص الأمر",
      summaryDescription: "يعرض owner product والمراجع الأساسية وحالة lifecycle الحالية.",
      draftSectionTitle: "Draft Header",
      draftSectionDescription:
        "يمكن تعديل حقول draft العادية هنا. أي تغييرات على routing أو planned quantity أو regenerate snapshot تتم من command regenerate operations.",
      sourceSectionTitle: "المراجع التشغيلية",
      sourceSectionDescription: "BOM وRouting references ثابتة بعد release، وتظهر هنا كما تراها قاعدة البيانات حاليًا.",
      lifecycleSectionTitle: "Lifecycle",
      lifecycleDescription: "يعرض التواريخ التشغيلية الأساسية وملاحظات الإلغاء أو الإكمال عندما تكون متاحة.",
      operationsSectionTitle: "Operations Snapshot",
      operationsSectionDescription:
        "هذا الجدول يعرض execution snapshot الحالية. بعد release تصبح البنية للقراءة فقط، ويقتصر التحديث على progress fields من خلال command مخصصة.",
      ownerProduct: "Owner Product",
      sourceRefs: "BOM / Routing",
      snapshotCount: "عدد العمليات",
      orderNo: "رقم الأمر",
      branchId: "Branch ID",
      status: "الحالة",
      plannedQty: "Planned",
      completedQty: "Completed",
      orderUom: "Order UOM",
      issueWarehouseId: "Issue Warehouse ID",
      receiptWarehouseId: "Receipt Warehouse ID",
      plannedStartAt: "Planned Start",
      plannedEndAt: "Planned End",
      releasedAt: "Released At",
      startedAt: "Started At",
      completedAt: "Completed At",
      cancelledAt: "Cancelled At",
      notes: "ملاحظات",
      cancellationReason: "سبب الإلغاء",
      saveDraft: "حفظ Draft Header",
      regenerate: "إعادة توليد العمليات",
      release: "Release",
      start: "Start",
      complete: "Complete",
      cancel: "Cancel",
      delete: "حذف",
      progress: "تحديث التقدّم",
      snapshotFrozenDraft: "هذه snapshot ما زالت في draft. يمكنك تعديل header العادي أو إعادة بناء العمليات من command regenerate.",
      snapshotFrozenReleased: "بعد release تصبح بنية snapshot ثابتة، وتبقى فقط progress fields قابلة للتحديث.",
      terminalOrder: "هذا الأمر في حالة نهائية، لذلك تُعرض جميع الحقول للقراءة فقط.",
      tableOperation: "العملية",
      tableWorkCenter: "Work Center",
      tableStatus: "الحالة",
      tableQuantity: "التقدّم",
      tableTiming: "التوقيت",
      tableAction: "إجراء",
      noOperationsTitle: "لا توجد عمليات Snapshot",
      noOperationsDescription: "إذا كان الأمر ما زال draft، يمكنك استخدام regenerate operations لبناء snapshot من الـ routing المختارة.",
      saveSuccessTitle: "تم حفظ Draft Header",
      saveSuccessDescription: "تم تحديث حقول draft العادية وإعادة تحميل الصفحة.",
      saveErrorTitle: "تعذر حفظ الـ header",
      saveErrorDescription: "حدث خطأ أثناء حفظ حقول draft",
      regenerateSuccessTitle: "تمت إعادة توليد العمليات",
      regenerateSuccessDescription: "تم تحديث المراجع وإعادة بناء snapshot داخل transaction واحدة.",
      regenerateErrorTitle: "تعذر إعادة توليد العمليات",
      regenerateErrorDescription: "حدث خطأ أثناء تنفيذ الأمر",
      releaseSuccessTitle: "تم Release للأمر",
      releaseSuccessDescription: "تم تنفيذ release وإعادة تحميل الصفحة من المصدر.",
      releaseErrorTitle: "تعذر تنفيذ Release",
      releaseErrorDescription: "راجع release readiness أو أعد تحميل الصفحة.",
      startSuccessTitle: "تم بدء الأمر",
      startSuccessDescription: "تم نقل الأمر إلى execution state وإعادة تحميل الصفحة.",
      startErrorTitle: "تعذر بدء الأمر",
      startErrorDescription: "حدث خطأ أثناء بدء التنفيذ",
      completeSuccessTitle: "تم إكمال الأمر",
      completeSuccessDescription: "تم تنفيذ completion وإعادة تحميل الصفحة من المصدر.",
      completeErrorTitle: "تعذر إكمال الأمر",
      completeErrorDescription: "حدث خطأ أثناء الإكمال",
      cancelSuccessTitle: "تم إلغاء الأمر",
      cancelSuccessDescription: "تم تسجيل الإلغاء وإعادة تحميل الصفحة.",
      cancelErrorTitle: "تعذر إلغاء الأمر",
      cancelErrorDescription: "حدث خطأ أثناء الإلغاء",
      deleteSuccessTitle: "تم حذف أمر الإنتاج",
      deleteSuccessDescription: "تم حذف الأمر من حالة draft وإعادتك إلى القائمة.",
      deleteErrorTitle: "تعذر حذف أمر الإنتاج",
      deleteErrorDescription: "الحذف متاح فقط في draft أو رُفض من قاعدة البيانات.",
      progressSuccessTitle: "تم تحديث تقدّم العملية",
      progressSuccessDescription: "تم حفظ التقدّم وإعادة تحميل snapshot من المصدر.",
      progressErrorTitle: "تعذر تحديث التقدّم",
      progressErrorDescription: "حدث خطأ أثناء حفظ تقدّم العملية",
      dialogs: {
        regenerateTitle: "إعادة توليد Operations Snapshot",
        regenerateDescription:
          "يُستخدم هذا الأمر فقط أثناء draft، ويمكنه أيضًا تعديل planned quantity أو مراجع BOM/Routing قبل إعادة البناء.",
        releaseTitle: "تأكيد Release",
        releaseDescription: "سيتم تشغيل release readiness من قاعدة البيانات. إذا لم تكن warehouses أو snapshot جاهزة، فسيرفض الطلب.",
        startTitle: "بدء التنفيذ",
        startDescription: "سيتم نقل الأمر إلى in_progress وتهيئة التنفيذ حسب منطق الـ RPC الحالي.",
        completeTitle: "إكمال أمر الإنتاج",
        completeDescription: "أدخل completed quantity النهائية. قاعدة البيانات ستتحقق من consistency قبل الإكمال.",
        cancelTitle: "إلغاء أمر الإنتاج",
        cancelDescription: "الإلغاء متاح في v1 فقط قبل الدخول إلى in_progress. يجب كتابة سبب واضح للإلغاء.",
        deleteTitle: "حذف أمر الإنتاج",
        deleteDescription: "الحذف متاح فقط في draft. سيتم حذف الأمر وoperations snapshot المرتبطة به.",
        progressTitle: "تحديث تقدّم العملية",
        progressDescription:
          "هذه الشاشة تحدث progress fields فقط. لا يتم تعديل بنية snapshot من الواجهة بعد release.",
      },
    },
    common: {
      noValue: "—",
      cancel: "إلغاء",
      close: "إغلاق",
      confirm: "تأكيد",
      save: "حفظ",
      loadingAction: "جاري التنفيذ...",
      draftOnly: "Draft only",
      idOnlyHint: "الواجهة الحالية تعمل بـ IDs مباشرة لحين إضافة lookup layer لاحقًا.",
      partialProgress: "يدعم partial progress عبر completed_quantity مع بقاء العملية in_progress.",
      operationCodeName: "الكود / الاسم",
      bomRouting: "BOM / Routing",
      actualWindow: "Actual Window",
      actualStart: "Actual Start",
      actualEnd: "Actual End",
      sourceOperation: "Source Routing Operation",
      qualityCheckpoint: "فحص جودة",
      all: "الكل",
    },
  },
  en: {
    list: {
      pill: "Production Orders",
      title: "Production Orders",
      description:
        "This screen lists production orders and opens the detail workspace for draft edits, execution commands, and operation progress through Production Orders B6 only.",
      refresh: "Refresh",
      create: "Create Production Order",
      apply: "Apply",
      search: "Quick Search",
      searchPlaceholder: "Search by order number",
      branchId: "Branch ID",
      productId: "Product ID",
      status: "Status",
      all: "All",
      statsShown: "Visible orders",
      statsOpen: "Execution-open orders",
      statsCompleted: "Completed orders",
      tableOrder: "Order / Status",
      tableOwner: "Owner Product",
      tableSource: "BOM / Routing",
      tableQuantity: "Quantity",
      tableUpdated: "Updated",
      tableAction: "Action",
      open: "Open",
      loading: "Loading production orders...",
      emptyTitle: "No matching production orders",
      emptyDescription: "Adjust the filters or create a new production order from the action button above.",
      loadErrorTitle: "Unable to load production orders",
      loadErrorDescription: "An error occurred while loading the list",
      createDialogTitle: "Create Production Order",
      createDialogDescription:
        "This iteration uses B6 endpoints only, so the core references are entered directly as IDs until a dedicated lookup layer is added.",
      createValidationTitle: "Missing required data",
      createValidationDescription:
        "product_id, bom_id, bom_version_id, routing_id, routing_version_id, and planned_quantity are required before creation.",
      createSuccessTitle: "Production order created",
      createSuccessDescription: (orderNo: string) => `${orderNo} is ready with its initial operation snapshot.`,
      createErrorTitle: "Unable to create production order",
      createErrorDescription: "An error occurred while creating the order",
      fields: {
        branchId: "Branch ID",
        branchHint: "Optional. Leave blank to use the current branch scope.",
        productId: "Product ID",
        bomId: "BOM ID",
        bomVersionId: "BOM Version ID",
        routingId: "Routing ID",
        routingVersionId: "Routing Version ID",
        issueWarehouseId: "Issue Warehouse ID",
        receiptWarehouseId: "Receipt Warehouse ID",
        plannedQuantity: "Planned Quantity",
        orderUom: "Order UOM",
        plannedStartAt: "Planned Start",
        plannedEndAt: "Planned End",
        notes: "Notes",
      },
    },
    detail: {
      pill: "Execution Snapshot",
      title: "Production Order Detail",
      description:
        "This page reloads after every command. The database and the API remain the single source of truth, with no optimistic sequencing in the UI.",
      reload: "Reload",
      back: "Back to list",
      loading: "Loading production order detail...",
      loadErrorTitle: "Unable to load the production order",
      loadErrorDescription: "An error occurred while loading the record",
      tabsOverview: "Overview",
      tabsOperations: "Operations",
      summaryTitle: "Order Summary",
      summaryDescription: "Shows the owner product, the selected execution sources, and the current lifecycle state.",
      draftSectionTitle: "Draft Header",
      draftSectionDescription:
        "Regular draft fields can be edited here. Routing swaps, planned quantity changes, and snapshot rebuilds are handled only by regenerate operations.",
      sourceSectionTitle: "Execution References",
      sourceSectionDescription: "The BOM and Routing references are shown exactly as persisted and become frozen after release.",
      lifecycleSectionTitle: "Lifecycle",
      lifecycleDescription: "Shows the main execution timestamps and cancellation/completion notes when present.",
      operationsSectionTitle: "Operations Snapshot",
      operationsSectionDescription:
        "This table shows the current execution snapshot. After release the structure is read-only and only progress fields can change through dedicated commands.",
      ownerProduct: "Owner Product",
      sourceRefs: "BOM / Routing",
      snapshotCount: "Operation count",
      orderNo: "Order No.",
      branchId: "Branch ID",
      status: "Status",
      plannedQty: "Planned",
      completedQty: "Completed",
      orderUom: "Order UOM",
      issueWarehouseId: "Issue Warehouse ID",
      receiptWarehouseId: "Receipt Warehouse ID",
      plannedStartAt: "Planned Start",
      plannedEndAt: "Planned End",
      releasedAt: "Released At",
      startedAt: "Started At",
      completedAt: "Completed At",
      cancelledAt: "Cancelled At",
      notes: "Notes",
      cancellationReason: "Cancellation Reason",
      saveDraft: "Save Draft Header",
      regenerate: "Regenerate Operations",
      release: "Release",
      start: "Start",
      complete: "Complete",
      cancel: "Cancel",
      delete: "Delete",
      progress: "Update Progress",
      snapshotFrozenDraft: "The order is still in draft. You can edit regular header fields or rebuild operations through regenerate.",
      snapshotFrozenReleased: "After release the snapshot structure is frozen and only progress fields remain editable.",
      terminalOrder: "This order is terminal, so the entire workspace is read-only.",
      tableOperation: "Operation",
      tableWorkCenter: "Work Center",
      tableStatus: "Status",
      tableQuantity: "Progress",
      tableTiming: "Timing",
      tableAction: "Action",
      noOperationsTitle: "No snapshot operations",
      noOperationsDescription: "If the order is still draft, use regenerate operations to build a snapshot from the selected routing.",
      saveSuccessTitle: "Draft header saved",
      saveSuccessDescription: "The draft fields were updated and the page was reloaded.",
      saveErrorTitle: "Unable to save the draft header",
      saveErrorDescription: "An error occurred while saving the draft fields",
      regenerateSuccessTitle: "Operations regenerated",
      regenerateSuccessDescription: "The sources were updated and the snapshot was rebuilt in one transaction.",
      regenerateErrorTitle: "Unable to regenerate operations",
      regenerateErrorDescription: "An error occurred while running the command",
      releaseSuccessTitle: "Order released",
      releaseSuccessDescription: "Release completed and the page was reloaded from the source of truth.",
      releaseErrorTitle: "Unable to release the order",
      releaseErrorDescription: "Review release readiness or reload the page.",
      startSuccessTitle: "Order started",
      startSuccessDescription: "The order moved into execution and the page reloaded.",
      startErrorTitle: "Unable to start the order",
      startErrorDescription: "An error occurred while starting execution",
      completeSuccessTitle: "Order completed",
      completeSuccessDescription: "Completion finished and the page was reloaded from the source of truth.",
      completeErrorTitle: "Unable to complete the order",
      completeErrorDescription: "An error occurred while completing the order",
      cancelSuccessTitle: "Order cancelled",
      cancelSuccessDescription: "Cancellation was recorded and the page reloaded.",
      cancelErrorTitle: "Unable to cancel the order",
      cancelErrorDescription: "An error occurred while cancelling the order",
      deleteSuccessTitle: "Production order deleted",
      deleteSuccessDescription: "The draft order was deleted and you were returned to the list.",
      deleteErrorTitle: "Unable to delete the production order",
      deleteErrorDescription: "Delete is draft-only or was rejected by the database.",
      progressSuccessTitle: "Operation progress updated",
      progressSuccessDescription: "Progress was saved and the snapshot reloaded from the source of truth.",
      progressErrorTitle: "Unable to update operation progress",
      progressErrorDescription: "An error occurred while saving operation progress",
      dialogs: {
        regenerateTitle: "Regenerate Operations Snapshot",
        regenerateDescription:
          "Use this command only while the order is draft. It can also update planned quantity or BOM/Routing references before rebuilding the snapshot.",
        releaseTitle: "Confirm Release",
        releaseDescription: "The database will run release readiness checks. The request is rejected if the warehouses or snapshot are not ready.",
        startTitle: "Start Execution",
        startDescription: "This moves the order into execution using the current RPC workflow.",
        completeTitle: "Complete Production Order",
        completeDescription: "Enter the final completed quantity. The database will validate consistency before completion.",
        cancelTitle: "Cancel Production Order",
        cancelDescription: "Cancellation is available in v1 only before the order enters in_progress. A clear reason is required.",
        deleteTitle: "Delete Production Order",
        deleteDescription: "Delete is available only while the order is draft. The order and its operation snapshot will be removed.",
        progressTitle: "Update Operation Progress",
        progressDescription:
          "This dialog updates execution progress fields only. Snapshot structure is not editable from the UI after release.",
      },
    },
    common: {
      noValue: "—",
      cancel: "Cancel",
      close: "Close",
      confirm: "Confirm",
      save: "Save",
      loadingAction: "Working...",
      draftOnly: "Draft only",
      idOnlyHint: "This UI currently works with direct IDs until a lookup layer is added.",
      partialProgress: "Partial progress is represented through completed_quantity while the operation stays in_progress.",
      operationCodeName: "Code / Name",
      bomRouting: "BOM / Routing",
      actualWindow: "Actual Window",
      actualStart: "Actual Start",
      actualEnd: "Actual End",
      sourceOperation: "Source Routing Operation",
      qualityCheckpoint: "Quality Check",
      all: "All",
    },
  },
} as const

async function parseApiResponse<T>(response: Response): Promise<SuccessfulResponse<T>> {
  const payload = await response.json().catch(() => null)

  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || payload?.message || "Unexpected API error")
  }

  return payload || {}
}

function jsonHeaders() {
  return {
    "Content-Type": "application/json",
  }
}

function toQueryString(filters: ProductionOrderListFilters) {
  const searchParams = new URLSearchParams()

  if (filters.branchId?.trim()) searchParams.set("branch_id", filters.branchId.trim())
  if (filters.productId?.trim()) searchParams.set("product_id", filters.productId.trim())
  if (filters.status && filters.status !== "all") searchParams.set("status", filters.status)
  if (filters.q?.trim()) searchParams.set("q", filters.q.trim())

  return searchParams.toString()
}

export function getProductionOrderCopy(lang: AppLang) {
  return COPY[lang]
}

export function readAppLanguage(): AppLang {
  if (typeof window === "undefined") return "ar"

  try {
    const fromCookie = document.cookie.split("; ").find((item) => item.startsWith("app_language="))?.split("=")[1]
    const value = fromCookie || localStorage.getItem("app_language") || "ar"
    return value === "en" ? "en" : "ar"
  } catch {
    return "ar"
  }
}

export function getTextDirection(lang: AppLang) {
  return lang === "en" ? "ltr" : "rtl"
}

export async function fetchProductionOrderList(filters: ProductionOrderListFilters = {}) {
  const query = toQueryString(filters)
  const response = await fetch(`/api/manufacturing/production-orders${query ? `?${query}` : ""}`, {
    cache: "no-store",
  })

  const payload = await parseApiResponse<ProductionOrderListItem[]>(response)
  return {
    items: payload.data || [],
    total: Number(payload.meta?.total || 0),
  }
}

export async function createProductionOrder(payload: ProductionOrderCreatePayload) {
  // Normalize empty branch_id to null so the API can validate it properly.
  const normalizedPayload = {
    ...payload,
    branch_id: payload.branch_id || null,
  }
  const response = await fetch("/api/manufacturing/production-orders", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(normalizedPayload),
  })

  const parsed = await parseApiResponse<ProductionOrderSnapshot>(response)
  return parsed.data as ProductionOrderSnapshot
}

export async function fetchProductionOrderDetail(productionOrderId: string) {
  const response = await fetch(`/api/manufacturing/production-orders/${productionOrderId}`, {
    cache: "no-store",
  })

  const payload = await parseApiResponse<ProductionOrderSnapshot>(response)
  return payload.data as ProductionOrderSnapshot
}

export async function updateProductionOrder(productionOrderId: string, payload: ProductionOrderUpdatePayload) {
  const response = await fetch(`/api/manufacturing/production-orders/${productionOrderId}`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  })

  const parsed = await parseApiResponse<ProductionOrderSnapshot>(response)
  return parsed.data as ProductionOrderSnapshot
}

export async function deleteProductionOrder(productionOrderId: string) {
  const response = await fetch(`/api/manufacturing/production-orders/${productionOrderId}`, {
    method: "DELETE",
  })

  await parseApiResponse(response)
}

export async function regenerateProductionOrderOperations(
  productionOrderId: string,
  payload: RegenerateProductionOrderPayload = {}
) {
  const response = await fetch(`/api/manufacturing/production-orders/${productionOrderId}/regenerate-operations`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  })

  const parsed = await parseApiResponse<ProductionOrderSnapshot>(response)
  return parsed.data as ProductionOrderSnapshot
}

export async function releaseProductionOrder(productionOrderId: string, payload: { released_at?: string | null } = {}) {
  const response = await fetch(`/api/manufacturing/production-orders/${productionOrderId}/release`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  })

  const parsed = await parseApiResponse<ProductionOrderSnapshot>(response)
  return parsed.data as ProductionOrderSnapshot
}

export async function startProductionOrder(productionOrderId: string, payload: { started_at?: string | null } = {}) {
  const response = await fetch(`/api/manufacturing/production-orders/${productionOrderId}/start`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  })

  const parsed = await parseApiResponse<ProductionOrderSnapshot>(response)
  return parsed.data as ProductionOrderSnapshot
}

export async function completeProductionOrder(productionOrderId: string, payload: CompleteProductionOrderPayload) {
  const response = await fetch(`/api/manufacturing/production-orders/${productionOrderId}/complete`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  })

  const parsed = await parseApiResponse<ProductionOrderSnapshot>(response)
  return parsed.data as ProductionOrderSnapshot
}

export async function cancelProductionOrder(productionOrderId: string, payload: CancelProductionOrderPayload) {
  const response = await fetch(`/api/manufacturing/production-orders/${productionOrderId}/cancel`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  })

  const parsed = await parseApiResponse<ProductionOrderSnapshot>(response)
  return parsed.data as ProductionOrderSnapshot
}

export async function updateProductionOrderOperationProgress(
  productionOrderOperationId: string,
  payload: UpdateProductionOrderOperationProgressPayload
) {
  const response = await fetch(`/api/manufacturing/production-order-operations/${productionOrderOperationId}/progress`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  })

  const parsed = await parseApiResponse<ProductionOrderOperationSnapshot>(response)
  return parsed.data as ProductionOrderOperationSnapshot
}

export function getProductionOrderStatusLabel(status: ProductionOrderStatus, lang: AppLang = "ar") {
  const labels: Record<ProductionOrderStatus, { ar: string; en: string }> = {
    draft: { ar: "مسودة", en: "Draft" },
    released: { ar: "Released", en: "Released" },
    in_progress: { ar: "قيد التنفيذ", en: "In Progress" },
    completed: { ar: "مكتمل", en: "Completed" },
    cancelled: { ar: "ملغي", en: "Cancelled" },
  }

  return labels[status]?.[lang] || status
}

export function getProductionOrderOperationStatusLabel(status: ProductionOrderOperationStatus, lang: AppLang = "ar") {
  const labels: Record<ProductionOrderOperationStatus, { ar: string; en: string }> = {
    pending: { ar: "بانتظار التهيئة", en: "Pending" },
    ready: { ar: "جاهزة", en: "Ready" },
    in_progress: { ar: "قيد التنفيذ", en: "In Progress" },
    completed: { ar: "مكتملة", en: "Completed" },
    cancelled: { ar: "ملغاة", en: "Cancelled" },
  }

  return labels[status]?.[lang] || status
}

export function getProductionOrderStatusVariant(
  status: ProductionOrderStatus
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "released":
    case "in_progress":
      return "default"
    case "completed":
      return "secondary"
    case "cancelled":
      return "destructive"
    default:
      return "outline"
  }
}

export function getProductionOrderOperationStatusVariant(
  status: ProductionOrderOperationStatus
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "ready":
    case "in_progress":
      return "default"
    case "completed":
      return "secondary"
    case "cancelled":
      return "destructive"
    default:
      return "outline"
  }
}

export function canEditProductionOrderHeader(status: ProductionOrderStatus) {
  return status === "draft"
}

export function canRegenerateProductionOrder(status: ProductionOrderStatus) {
  return status === "draft"
}

export function canReleaseProductionOrder(status: ProductionOrderStatus) {
  return status === "draft"
}

export function canStartProductionOrder(status: ProductionOrderStatus) {
  return status === "released"
}

export function canCompleteProductionOrder(status: ProductionOrderStatus) {
  return status === "in_progress"
}

export function canCancelProductionOrder(status: ProductionOrderStatus) {
  return status === "draft" || status === "released"
}

export function canDeleteProductionOrder(status: ProductionOrderStatus) {
  return status === "draft"
}

export function canUpdateProductionOrderOperationProgress(
  orderStatus: ProductionOrderStatus,
  operationStatus: ProductionOrderOperationStatus
) {
  return (orderStatus === "released" || orderStatus === "in_progress") && operationStatus !== "completed" && operationStatus !== "cancelled"
}

export function formatDateTime(value?: string | null, lang: AppLang = "ar") {
  if (!value) return COPY[lang].common.noValue
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "ar-EG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export function formatQuantity(value?: number | string | null, lang: AppLang = "ar", fractionDigits = 4) {
  const numeric = Number(value || 0)
  return new Intl.NumberFormat(lang === "en" ? "en-US" : "ar-EG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(Number.isFinite(numeric) ? numeric : 0)
}

export function buildProductLabel(product?: ProductOption | null, lang: AppLang = "ar") {
  if (!product) return COPY[lang].common.noValue
  const sku = product.sku?.trim()
  const name = product.name?.trim()
  if (sku && name) return `${sku} — ${name}`
  return sku || name || product.id
}

export function buildBomLabel(
  bom?: BomSummary | null,
  bomVersion?: BomVersionSummary | null,
  lang: AppLang = "ar"
) {
  if (!bom && !bomVersion) return COPY[lang].common.noValue
  const bomCode = bom?.bom_code?.trim()
  const bomName = bom?.bom_name?.trim()
  const versionNo = bomVersion?.version_no
  const base = bomCode && bomName ? `${bomCode} — ${bomName}` : bomCode || bomName || bom?.id || COPY[lang].common.noValue
  return versionNo ? `${base} / v${versionNo}` : base
}

export function buildRoutingLabel(
  routing?: RoutingSummary | null,
  routingVersion?: RoutingVersionSummary | null,
  lang: AppLang = "ar"
) {
  if (!routing && !routingVersion) return COPY[lang].common.noValue
  const code = routing?.routing_code?.trim()
  const name = routing?.routing_name?.trim()
  const versionNo = routingVersion?.version_no
  const base = code && name ? `${code} — ${name}` : code || name || routing?.id || COPY[lang].common.noValue
  return versionNo ? `${base} / v${versionNo}` : base
}

export function buildWorkCenterLabel(workCenter?: WorkCenterSummary | null, lang: AppLang = "ar") {
  if (!workCenter) return COPY[lang].common.noValue
  const code = workCenter.code?.trim()
  const name = workCenter.name?.trim()
  if (code && name) return `${code} — ${name}`
  return code || name || workCenter.id
}

export function buildSourceRoutingOperationLabel(
  sourceOperation?: SourceRoutingOperationSummary | null,
  lang: AppLang = "ar"
) {
  if (!sourceOperation) return COPY[lang].common.noValue
  const code = sourceOperation.operation_code?.trim()
  const name = sourceOperation.operation_name?.trim()
  const opNo = sourceOperation.operation_no
  const base = code && name ? `${code} — ${name}` : code || name || sourceOperation.id
  return typeof opNo === "number" ? `#${opNo} / ${base}` : base || COPY[lang].common.noValue
}

export function isoToLocalDateTimeInput(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const pad = (part: number) => String(part).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function localDateTimeInputToIso(value?: string | null) {
  if (!value?.trim()) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}
