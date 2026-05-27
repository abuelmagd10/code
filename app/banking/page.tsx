"use client";

import { useEffect, useState, useMemo, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSupabase } from "@/lib/supabase/hooks";
import { filterCashBankAccounts } from "@/lib/accounts";
import { useToast } from "@/hooks/use-toast";
import { toastActionSuccess, toastActionError } from "@/lib/notifications";
import { getActiveCompanyId } from "@/lib/company";
import { canAction } from "@/lib/authz";
import { Landmark, Building2, MapPin, Filter } from "lucide-react";
import { ERPPageHeader } from "@/components/erp-page-header";
import {
  getExchangeRate,
  getActiveCurrencies,
  type Currency,
} from "@/lib/currency-service";
import { ExchangeRateSelector } from "@/components/ExchangeRateSelector";

type Account = {
  id: string;
  account_code: string | null;
  account_name: string;
  account_type: string;
  opening_balance?: number;
  balance?: number;
  branch_id?: string | null;
  cost_center_id?: string | null;
  branch_name?: string;
  cost_center_name?: string;
  // v3.25.1: account's native currency (set via chart-of-accounts picker).
  // null/empty means account is in company base currency.
  original_currency?: string | null;
};
type Branch = { id: string; name: string; code: string };
type CostCenter = {
  id: string;
  cost_center_name: string;
  cost_center_code: string;
  branch_id: string;
};

export default function BankingPage() {
  const supabase = useSupabase();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  // v3.25.1: native-currency balance for FC accounts (USD/EUR/etc bank accounts)
  const [nativeBalances, setNativeBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [transfer, setTransfer] = useState({
    from_id: "",
    to_id: "",
    amount: 0,
    date: new Date().toISOString().slice(0, 10),
    description: "تحويل بنكي",
    currency: "EGP",
  });
  const [saving, setSaving] = useState(false);
  // v3.13.0: Recent transfers history (merged from /banking/transfers)
  const [recentTransfers, setRecentTransfers] = useState<Array<{
    id: string
    entry_number: string | null
    entry_date: string
    description: string | null
    currency_code: string
    exchange_rate: number
    status: string
    total_debit: number
    from_account?: string
    to_account?: string
  }>>([])
  const [loadingTransfers, setLoadingTransfers] = useState(false)
  const { toast } = useToast();
  const [appLang, setAppLang] = useState<"ar" | "en">("ar");
  const [hydrated, setHydrated] = useState(false);

  // تهيئة اللغة بعد hydration
  useEffect(() => {
    try {
      const docLang = document.documentElement?.lang;
      if (docLang === "en") {
        setAppLang("en");
        return;
      }
      const fromCookie = document.cookie
        .split("; ")
        .find((x) => x.startsWith("app_language="))
        ?.split("=")[1];
      const v = fromCookie || localStorage.getItem("app_language") || "ar";
      setAppLang(v === "en" ? "en" : "ar");
    } catch { }
  }, []);
  const [permView, setPermView] = useState(true);
  const [permWrite, setPermWrite] = useState(false);

  // Currency support
  const [appCurrency, setAppCurrency] = useState<string>(() => {
    if (typeof window === "undefined") return "EGP";
    try {
      return localStorage.getItem("app_currency") || "EGP";
    } catch {
      return "EGP";
    }
  });
  const currencySymbols: Record<string, string> = {
    EGP: "£",
    USD: "$",
    EUR: "€",
    GBP: "£",
    SAR: "﷼",
    AED: "د.إ",
    KWD: "د.ك",
    QAR: "﷼",
    BHD: "د.ب",
    OMR: "﷼",
    JOD: "د.أ",
    LBP: "ل.ل",
  };
  const currencySymbol = currencySymbols[appCurrency] || appCurrency;

  // Multi-currency support
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const [exchangeRateId, setExchangeRateId] = useState<string | null>(null);
  const [rateSource, setRateSource] = useState<string>("same_currency");
  const [baseAmount, setBaseAmount] = useState<number>(0);
  const [companyId, setCompanyId] = useState<string | null>(null);

  // User Context
  const [userContext, setUserContext] = useState<any>(null);

  // Branch and Cost Center filter
  const [branches, setBranches] = useState<Branch[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("all");
  const [selectedCostCenter, setSelectedCostCenter] = useState<string>("all");
  const [selectedAccountType, setSelectedAccountType] = useState<string>("all");
  const [accountSearchQuery, setAccountSearchQuery] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  // Listen for currency changes and reload data
  useEffect(() => {
    const handleCurrencyChange = () => {
      const newCurrency = localStorage.getItem("app_currency") || "EGP";
      setAppCurrency(newCurrency);
      // Reload balances with new currency
      loadData();
    };
    window.addEventListener("app_currency_changed", handleCurrencyChange);
    return () =>
      window.removeEventListener("app_currency_changed", handleCurrencyChange);
  }, []);

  useEffect(() => {
    (async () => {
      setPermView(await canAction(supabase, "banking", "read"));
      setPermWrite(await canAction(supabase, "banking", "write"));
      // Load currencies
      const cid = await getActiveCompanyId(supabase);
      if (cid) {
        setCompanyId(cid);
        const curr = await getActiveCurrencies(supabase, cid);
        if (curr.length > 0) setCurrencies(curr);
        // Set default currency
        const baseCur = localStorage.getItem("app_currency") || "EGP";
        setTransfer((t) => ({ ...t, currency: baseCur }));
      }
    })();
    loadData();
  }, []);
  // v3.13.0: Load recent transfers once companyId is available
  useEffect(() => {
    if (companyId) loadRecentTransfers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);
  useEffect(() => {
    const reloadPerms = async () => {
      setPermView(await canAction(supabase, "banking", "read"));
      setPermWrite(await canAction(supabase, "banking", "write"));
    };
    const handler = () => {
      reloadPerms();
    };
    if (typeof window !== "undefined")
      window.addEventListener("permissions_updated", handler);
    return () => {
      if (typeof window !== "undefined")
        window.removeEventListener("permissions_updated", handler);
    };
  }, []);
  useEffect(() => {
    setHydrated(true);
    const handler = () => {
      try {
        const docLang = document.documentElement?.lang;
        if (docLang === "en") {
          setAppLang("en");
          return;
        }
        const fromCookie = document.cookie
          .split("; ")
          .find((x) => x.startsWith("app_language="))
          ?.split("=")[1];
        const v = fromCookie || localStorage.getItem("app_language") || "ar";
        setAppLang(v === "en" ? "en" : "ar");
      } catch { }
    };
    window.addEventListener("app_language_changed", handler);
    window.addEventListener("storage", (e: any) => {
      if (e?.key === "app_language") handler();
    });
    return () => {
      window.removeEventListener("app_language_changed", handler);
    };
  }, []);

  // Update exchange rate when currency changes
  useEffect(() => {
    const updateRate = async () => {
      const baseCurrency = localStorage.getItem("app_currency") || "EGP";
      if (transfer.currency === baseCurrency) {
        setExchangeRate(1);
        setExchangeRateId(null);
        setRateSource("same_currency");
        setBaseAmount(transfer.amount);
      } else if (companyId) {
        const result = await getExchangeRate(
          supabase,
          transfer.currency,
          baseCurrency,
          undefined,
          companyId,
        );
        setExchangeRate(result.rate);
        setExchangeRateId(result.rateId || null);
        setRateSource(result.source);
        setBaseAmount(
          Math.round(transfer.amount * result.rate * 10000) / 10000,
        );
      }
    };
    updateRate();
  }, [transfer.currency, transfer.amount, companyId]);

  const loadData = async () => {
    try {
      setLoading(true);
      let cid: string | null = null;
      let loadedAccounts: Account[] = [];

      let currentUserContext = userContext;

      try {
        const res = await fetch("/api/my-company");
        if (res.ok) {
          const j = await res.json();
          cid = String(j?.data?.company?.id || (j?.data?.company?.id || j?.company?.id) || "") || null;
          if (cid) {
            try {
              localStorage.setItem("active_company_id", cid);
            } catch { }
          }

          if (j?.data?.userContext) {
            currentUserContext = j?.data?.userContext;
            setUserContext(currentUserContext);
          } else if (j?.userContext) {
            currentUserContext = j?.userContext;
            setUserContext(currentUserContext);
          }

          const accs = j?.data?.accounts || (j?.data?.accounts || j?.accounts);
          if (Array.isArray(accs)) {
            let leaf = filterCashBankAccounts(accs || [], true);

            // Filter out accounts clearly not in this user's branch for normal roles
            const isNormalRole =
              currentUserContext?.role &&
              !["admin", "owner", "manager"].includes(currentUserContext.role);
            if (isNormalRole && currentUserContext?.branch_id) {
              leaf = leaf.filter(
                (a: any) => a.branch_id === currentUserContext.branch_id,
              );
            }
            loadedAccounts = leaf as Account[];
            setAccounts(loadedAccounts);
          }
        }
      } catch { }

      if (!cid) cid = await getActiveCompanyId(supabase);
      if (!cid) return;

      // Fetch branches and cost centers
      const [branchRes, ccRes] = await Promise.all([
        supabase
          .from("branches")
          .select("id, name, code")
          .eq("company_id", cid)
          .eq("is_active", true),
        supabase
          .from("cost_centers")
          .select("id, cost_center_name, cost_center_code, branch_id")
          .eq("company_id", cid)
          .eq("is_active", true),
      ]);
      setBranches((branchRes.data || []) as Branch[]);
      setCostCenters((ccRes.data || []) as CostCenter[]);

      // Fetch accounts if not already loaded - with branch and cost center info
      // ✅ حسابات النقد والبنك مرئية لجميع المستخدمين في الشركة (حسابات دفع مشتركة)
      if (loadedAccounts.length === 0) {
        const { data: accs } = await supabase
          .from("chart_of_accounts")
          // v3.25.1: include original_currency so FC bank/cash accounts can display
          // their balance in their native currency.
          .select(
            "id, account_code, account_name, account_type, sub_type, parent_id, opening_balance, branch_id, cost_center_id, original_currency, branches(name), cost_centers(cost_center_name)",
          )
          .eq("company_id", cid)
          .eq("is_active", true);
        const list = (accs || []).map((a: any) => ({
          ...a,
          branch_name: a.branches?.name || null,
          cost_center_name: a.cost_centers?.cost_center_name || null,
        }));
        let leafCashBankAccounts = filterCashBankAccounts(list, true);

        // Filter if userContext is a normal role
        const isNormalRole =
          currentUserContext?.role &&
          !["admin", "owner", "manager"].includes(currentUserContext.role);
        if (isNormalRole && currentUserContext?.branch_id) {
          leafCashBankAccounts = leafCashBankAccounts.filter(
            (a: any) => a.branch_id === currentUserContext.branch_id,
          );
        }

        loadedAccounts = leafCashBankAccounts as Account[];
        setAccounts(loadedAccounts);
      }

      // Calculate balances from journal entry lines (real-time) - with multi-currency support
      // ✅ Filter out deleted journal entries
      // v3.25.1: include original_debit/credit so FC accounts can be shown in native ccy
      const { data: journalLines } = await supabase
        .from("journal_entry_lines")
        .select(
          "account_id, debit_amount, credit_amount, display_debit, display_credit, display_currency, original_debit, original_credit, original_currency, journal_entries!inner(deleted_at)",
        )
        .is("journal_entries.deleted_at", null);

      const currentCurrency = localStorage.getItem("app_currency") || "EGP";

      // ✅ Initialize balance map with opening balances
      const balanceMap: Record<string, number> = {};
      // v3.25.1: also track native-currency balances per FC account
      const nativeBalanceMap: Record<string, number> = {};
      for (const acc of loadedAccounts) {
        balanceMap[acc.id] = Number((acc as any).opening_balance || 0);
        // FC accounts: opening_balance is assumed to be in account currency
        if ((acc as any).original_currency) {
          nativeBalanceMap[acc.id] = Number((acc as any).opening_balance || 0);
        }
      }

      if (journalLines) {
        const lineTotals: Record<string, { debit: number; credit: number }> = {};
        const nativeLineTotals: Record<string, { debit: number; credit: number }> = {};
        for (const line of journalLines) {
          if (!lineTotals[line.account_id]) {
            lineTotals[line.account_id] = { debit: 0, credit: 0 };
          }
          // Use display amounts if available and currency matches, otherwise use original
          const debit =
            line.display_debit != null &&
              line.display_currency === currentCurrency
              ? Number(line.display_debit)
              : Number(line.debit_amount || 0);
          const credit =
            line.display_credit != null &&
              line.display_currency === currentCurrency
              ? Number(line.display_credit)
              : Number(line.credit_amount || 0);
          lineTotals[line.account_id].debit += debit;
          lineTotals[line.account_id].credit += credit;

          // v3.25.1: accumulate native debits/credits for FC tracking
          const od = Number((line as any).original_debit || 0)
          const oc = Number((line as any).original_credit || 0)
          if (od !== 0 || oc !== 0) {
            if (!nativeLineTotals[line.account_id]) {
              nativeLineTotals[line.account_id] = { debit: 0, credit: 0 }
            }
            nativeLineTotals[line.account_id].debit += od
            nativeLineTotals[line.account_id].credit += oc
          }
        }
        for (const [accId, totals] of Object.entries(lineTotals)) {
          // ✅ For asset accounts (cash/bank), balance = opening_balance + (debit - credit)
          const movement = totals.debit - totals.credit;
          balanceMap[accId] = (balanceMap[accId] || 0) + movement;
        }
        // v3.25.1: same for native balances (only FC accounts touched here)
        for (const [accId, totals] of Object.entries(nativeLineTotals)) {
          if (nativeBalanceMap[accId] === undefined) continue // account is not FC
          nativeBalanceMap[accId] += totals.debit - totals.credit
        }
      }

      setBalances(balanceMap);
      setNativeBalances(nativeBalanceMap);
    } finally {
      setLoading(false);
    }
  };

  // v3.13.0: Load recent transfer history (from journal_entries with reference_type='bank_transfer')
  const loadRecentTransfers = async () => {
    if (!companyId) return
    setLoadingTransfers(true)
    try {
      const { data: jeData } = await supabase
        .from('journal_entries')
        .select('id, entry_number, entry_date, description, currency_code, exchange_rate, status')
        .eq('company_id', companyId)
        .eq('reference_type', 'bank_transfer')
        .order('entry_date', { ascending: false })
        .limit(20)
      const entries = (jeData || []) as any[]
      const records: typeof recentTransfers = []
      for (const je of entries) {
        const { data: lines } = await supabase
          .from('journal_entry_lines')
          .select('debit_amount, credit_amount, account_id, chart_of_accounts(account_name, account_code)')
          .eq('journal_entry_id', je.id)
        let totalDebit = 0
        let fromAccount = ''
        let toAccount = ''
        for (const l of (lines || [])) {
          const dr = Number(l.debit_amount || 0)
          const cr = Number(l.credit_amount || 0)
          totalDebit += dr
          const acc = Array.isArray(l.chart_of_accounts) ? l.chart_of_accounts[0] : l.chart_of_accounts
          const name = acc?.account_name || ''
          if (dr > 0 && !toAccount) toAccount = name
          if (cr > 0 && !fromAccount) fromAccount = name
        }
        records.push({
          ...je,
          total_debit: totalDebit,
          from_account: fromAccount,
          to_account: toAccount,
        })
      }
      setRecentTransfers(records)
    } catch (err) {
      console.error('Failed to load recent transfers:', err)
    } finally {
      setLoadingTransfers(false)
    }
  }

  // Filter accounts by branch and cost center
  const filteredAccounts = useMemo(() => {
    let filtered = accounts;
    const isNormalRole =
      userContext?.role &&
      !["admin", "owner", "manager"].includes(userContext.role);
    const effectiveBranch =
      isNormalRole && userContext?.branch_id
        ? userContext.branch_id
        : selectedBranch;

    if (effectiveBranch !== "all") {
      filtered = filtered.filter((a) => a.branch_id === effectiveBranch);
    }
    if (selectedCostCenter !== "all") {
      filtered = filtered.filter(
        (a) => a.cost_center_id === selectedCostCenter,
      );
    }
    if (selectedAccountType !== "all") {
      filtered = filtered.filter((a) => a.account_type === selectedAccountType);
    }
    if (accountSearchQuery.trim()) {
      const q = accountSearchQuery.trim().toLowerCase();
      filtered = filtered.filter(
        (a) =>
          (a.account_name || "").toLowerCase().includes(q) ||
          (a.account_code || "").toLowerCase().includes(q),
      );
    }
    return filtered;
  }, [accounts, selectedBranch, selectedCostCenter, selectedAccountType, accountSearchQuery, userContext]);

  // Filter cost centers by selected branch
  const filteredCostCenters = useMemo(() => {
    const isNormalRole =
      userContext?.role &&
      !["admin", "owner", "manager"].includes(userContext.role);
    const effectiveBranch =
      isNormalRole && userContext?.branch_id
        ? userContext.branch_id
        : selectedBranch;

    if (effectiveBranch === "all") return costCenters;
    return costCenters.filter((cc) => cc.branch_id === effectiveBranch);
  }, [costCenters, selectedBranch, userContext]);

  // Reset cost center when branch changes
  useEffect(() => {
    setSelectedCostCenter("all");
  }, [selectedBranch]);

  const submitTransfer = async () => {
    try {
      setSaving(true);
      if (
        !transfer.from_id ||
        !transfer.to_id ||
        transfer.amount <= 0 ||
        transfer.from_id === transfer.to_id
      ) {
        toast({
          title: appLang === "en" ? "Incomplete data" : "بيانات غير مكتملة",
          description:
            appLang === "en"
              ? "Please select both accounts and a valid amount"
              : "يرجى تحديد الحسابين والمبلغ بشكل صحيح",
        });
        return;
      }
      // Get base currency
      const baseCurrency =
        typeof window !== "undefined"
          ? localStorage.getItem("app_currency") || "EGP"
          : "EGP";

      // Calculate base amount if different currency
      const finalBaseAmount =
        transfer.currency === baseCurrency ? transfer.amount : baseAmount;

      const idempotencyKey = globalThis.crypto?.randomUUID?.() || `bank-transfer-${Date.now()}`
      const response = await fetch("/api/banking/transfers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          fromAccountId: transfer.from_id,
          toAccountId: transfer.to_id,
          amount: transfer.amount,
          transferDate: transfer.date,
          description: transfer.description ||
            (appLang === "en"
              ? "Transfer between cash/bank accounts"
              : "تحويل بين حسابات نقد/بنك"),
          currencyCode: transfer.currency,
          exchangeRate,
          baseAmount: finalBaseAmount,
          exchangeRateId,
          rateSource,
          uiSurface: "banking_page",
        }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(result.error || (appLang === "en" ? "Failed to record bank transfer" : "تعذر تسجيل التحويل البنكي"))
      }

      setTransfer({
        ...transfer,
        amount: 0,
        description: appLang === "en" ? "Bank transfer" : "تحويل بنكي",
      });
      toastActionSuccess(
        toast,
        appLang === "en" ? "Record" : "التسجيل",
        appLang === "en" ? "Transfer" : "التحويل",
      );
      // تحديث الأرصدة + التحويلات السابقة بعد التحويل
      await loadData();
      await loadRecentTransfers();
    } catch (err) {
      console.error("Error recording transfer:", err);
      toastActionError(toast, appLang === "en" ? "Transfer" : "التحويل");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        {/* رأس الصفحة — Migrated to ERPPageHeader (v3.54.0) */}
        <ERPPageHeader
          title={hydrated && appLang === "en" ? "Banking" : "البنوك"}
          description={appLang === "en" ? "Manage bank & cash accounts" : "إدارة الحسابات البنكية والخزينة"}
          variant="list"
          lang={appLang}
          actions={
            permWrite ? (
              <Button variant="outline" asChild>
                <a href="/chart-of-accounts">
                  {appLang === "en" ? "Add bank/cash account" : "إضافة حساب بنكي/خزينة"}
                </a>
              </Button>
            ) : undefined
          }
          extra={
            (userContext?.role === "admin" || userContext?.role === "owner" || userContext?.role === "manager") ? (
              <p className="text-xs text-green-600 dark:text-green-400">
                {appLang === "en"
                  ? "👑 Company-wide accounts - All bank accounts visible"
                  : "👑 حسابات على مستوى الشركة - جميع الحسابات البنكية مرئية"}
              </p>
            ) : (
              <p className="text-xs text-blue-600 dark:text-blue-400">
                {appLang === "en"
                  ? "📍 Branch accounts only - Viewing banks assigned to your branch"
                  : "📍 حسابات الفرع فقط - يتم عرض البنوك المخصصة لفرعك"}
              </p>
            )
          }
        />

        {/* Transfer Feature - ONLY for Higher Roles */}
        {(userContext?.role === "admin" ||
          userContext?.role === "owner" ||
          userContext?.role === "manager") && (
            <Card>
              <CardContent className="pt-6 space-y-6">
                <h2 className="text-xl font-semibold" suppressHydrationWarning>
                  {hydrated && appLang === "en"
                    ? "Transfer Between Accounts"
                    : "تحويل بين الحسابات"}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                  <div>
                    <Label suppressHydrationWarning>
                      {hydrated && appLang === "en"
                        ? "From Account"
                        : "من الحساب"}
                    </Label>
                    <select
                      className="w-full border rounded px-2 py-1"
                      value={transfer.from_id}
                      onChange={(e) =>
                        setTransfer({ ...transfer, from_id: e.target.value })
                      }
                    >
                      <option value="">
                        {appLang === "en" ? "Select account" : "اختر حسابًا"}
                      </option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.account_code || ""} {a.account_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label suppressHydrationWarning>
                      {hydrated && appLang === "en" ? "To Account" : "إلى الحساب"}
                    </Label>
                    <select
                      className="w-full border rounded px-2 py-1"
                      value={transfer.to_id}
                      onChange={(e) =>
                        setTransfer({ ...transfer, to_id: e.target.value })
                      }
                    >
                      <option value="">
                        {appLang === "en" ? "Select account" : "اختر حسابًا"}
                      </option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.account_code || ""} {a.account_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label suppressHydrationWarning>
                      {hydrated && appLang === "en" ? "Amount" : "المبلغ"}
                    </Label>
                    <NumericInput
                      min={0}
                      step="0.01"
                      value={transfer.amount}
                      onChange={(val) =>
                        setTransfer({ ...transfer, amount: val })
                      }
                      decimalPlaces={2}
                    />
                  </div>
                  <div>
                    <Label suppressHydrationWarning>
                      {hydrated && appLang === "en" ? "Currency" : "العملة"}
                    </Label>
                    <select
                      className="w-full border rounded px-2 py-1"
                      value={transfer.currency}
                      onChange={(e) =>
                        setTransfer({ ...transfer, currency: e.target.value })
                      }
                    >
                      {currencies.length > 0 ? (
                        currencies.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code} - {c.name}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="EGP">EGP - جنيه مصري</option>
                          <option value="USD">USD - دولار أمريكي</option>
                          <option value="EUR">EUR - يورو</option>
                          <option value="SAR">SAR - ريال سعودي</option>
                        </>
                      )}
                    </select>
                  </div>
                  <div>
                    <Label suppressHydrationWarning>
                      {hydrated && appLang === "en" ? "Date" : "التاريخ"}
                    </Label>
                    <Input
                      type="date"
                      value={transfer.date}
                      onChange={(e) =>
                        setTransfer({ ...transfer, date: e.target.value })
                      }
                    />
                  </div>
                  {/* v3.18.0: ExchangeRateSelector — only shows when FC differs from base */}
                  {transfer.currency !== appCurrency && (
                    <div className="md:col-span-2">
                      <Label className="text-sm">
                        {appLang === "en"
                          ? `Exchange Rate (${transfer.currency} → ${appCurrency})`
                          : `سعر الصرف (${transfer.currency} → ${appCurrency})`}
                      </Label>
                      <ExchangeRateSelector
                        fromCurrency={transfer.currency}
                        baseCurrency={appCurrency}
                        value={exchangeRate}
                        onChange={(r) => {
                          setExchangeRate(r)
                          setBaseAmount(Math.round(transfer.amount * r * 10000) / 10000)
                        }}
                        onRateMetaChange={(meta) => {
                          setExchangeRateId(meta?.rateId || null)
                          setRateSource(meta?.source || "manual")
                        }}
                        hideLabel
                        showPreview
                      />
                    </div>
                  )}
                  <div className="flex gap-2">
                    {permWrite ? (
                      <Button
                        onClick={submitTransfer}
                        disabled={
                          saving ||
                          !transfer.from_id ||
                          !transfer.to_id ||
                          transfer.from_id === transfer.to_id ||
                          transfer.amount <= 0
                        }
                      >
                        {hydrated && appLang === "en"
                          ? "Record Transfer"
                          : "تسجيل التحويل"}
                      </Button>
                    ) : null}
                  </div>
                </div>

                {/* Exchange Rate Info */}
                {transfer.currency !== appCurrency && transfer.amount > 0 && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-sm">
                    <div className="flex justify-between items-center">
                      <span>
                        {appLang === "en" ? "Exchange Rate:" : "سعر الصرف:"}{" "}
                        <strong>
                          1 {transfer.currency} = {exchangeRate.toFixed(4)}{" "}
                          {appCurrency}
                        </strong>
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        (
                        {rateSource === "api"
                          ? appLang === "en"
                            ? "API"
                            : "API"
                          : rateSource === "manual"
                            ? appLang === "en"
                              ? "Manual"
                              : "يدوي"
                            : rateSource === "cache"
                              ? appLang === "en"
                                ? "Cache"
                                : "كاش"
                              : rateSource}
                        )
                      </span>
                    </div>
                    <div className="mt-1">
                      {appLang === "en" ? "Base Amount:" : "المبلغ الأساسي:"}{" "}
                      <strong>
                        {baseAmount.toFixed(2)} {appCurrency}
                      </strong>
                    </div>
                  </div>
                )}

                <div
                  className="text-sm text-gray-600 dark:text-gray-400"
                  suppressHydrationWarning
                >
                  {hydrated && appLang === "en"
                    ? "The transfer is recorded as a journal entry (debit receiver, credit sender)."
                    : "يتم تسجيل التحويل كقيد يومي (مدين للحساب المستلم، دائن للحساب المرسل)."}
                </div>
              </CardContent>
            </Card>
          )}

        {/* v3.13.0 — Recent Transfers history (FX-aware) */}
        {(userContext?.role === "admin" || userContext?.role === "owner" || userContext?.role === "manager") && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  {appLang === "en" ? "Recent Transfers" : "آخر التحويلات"}
                  <span className="text-sm text-gray-500 mr-2">({recentTransfers.length})</span>
                </h2>
                <Button variant="outline" size="sm" onClick={loadRecentTransfers} disabled={loadingTransfers}>
                  {loadingTransfers ? (appLang === "en" ? "Loading..." : "تحميل...") : (appLang === "en" ? "Refresh" : "تحديث")}
                </Button>
              </div>
              {recentTransfers.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  {appLang === "en" ? "No transfers yet" : "لا توجد تحويلات بعد"}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b dark:border-gray-700 text-xs text-gray-500">
                        <th className="text-right py-2 px-2">{appLang === "en" ? "Date" : "التاريخ"}</th>
                        <th className="text-right py-2 px-2">{appLang === "en" ? "From" : "من"}</th>
                        <th className="text-right py-2 px-2">{appLang === "en" ? "To" : "إلى"}</th>
                        <th className="text-right py-2 px-2">{appLang === "en" ? "Amount" : "المبلغ"}</th>
                        <th className="text-right py-2 px-2">{appLang === "en" ? "Currency" : "العملة"}</th>
                        <th className="text-right py-2 px-2">{appLang === "en" ? "Description" : "الوصف"}</th>
                        <th className="text-right py-2 px-2">{appLang === "en" ? "Status" : "الحالة"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentTransfers.map(tr => {
                        const isFC = tr.currency_code && tr.currency_code.toUpperCase() !== appCurrency.toUpperCase()
                        return (
                          <tr key={tr.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-800">
                            <td className="py-2 px-2">{tr.entry_date}</td>
                            <td className="py-2 px-2">{tr.from_account || '-'}</td>
                            <td className="py-2 px-2">{tr.to_account || '-'}</td>
                            <td className="py-2 px-2 font-medium">
                              {tr.total_debit.toLocaleString('en-US', { minimumFractionDigits: 2 })} {appCurrency}
                              {isFC && (
                                <span className="block text-[10px] text-gray-500">
                                  rate: {Number(tr.exchange_rate).toFixed(4)}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-2">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${isFC ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                                {tr.currency_code}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-xs text-gray-500 max-w-xs truncate">{tr.description || '-'}</td>
                            <td className="py-2 px-2">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${tr.status === 'posted' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'}`}>
                                {tr.status}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-xl font-semibold" suppressHydrationWarning>
                {hydrated && appLang === "en"
                  ? "Cash & Bank Accounts"
                  : "حسابات النقد والبنك"}
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="w-4 h-4 mr-2" />
                {appLang === "en" ? "Filter" : "فلترة"}
              </Button>
            </div>

            {/* Filters */}
            {showFilters && (
              <div
                className={`bg-gray-50 dark:bg-slate-800 p-4 rounded-lg grid grid-cols-1 gap-4 ${userContext?.role === "admin" ||
                  userContext?.role === "owner" ||
                  userContext?.role === "manager"
                  ? "sm:grid-cols-2"
                  : ""
                  }`}
              >
                {(userContext?.role === "admin" ||
                  userContext?.role === "owner" ||
                  userContext?.role === "manager") && (
                    <div>
                      <Label className="mb-1 block">
                        {appLang === "en" ? "Branch" : "الفرع"}
                      </Label>
                      <Select
                        value={selectedBranch}
                        onValueChange={setSelectedBranch}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              appLang === "en" ? "All Branches" : "جميع الفروع"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">
                            {appLang === "en" ? "All Branches" : "جميع الفروع"}
                          </SelectItem>
                          {branches.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                <div>
                  <Label className="mb-1 block">
                    {appLang === "en" ? "Cost Center" : "مركز التكلفة"}
                  </Label>
                  <Select
                    value={selectedCostCenter}
                    onValueChange={setSelectedCostCenter}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          appLang === "en"
                            ? "All Cost Centers"
                            : "جميع مراكز التكلفة"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {appLang === "en"
                          ? "All Cost Centers"
                          : "جميع مراكز التكلفة"}
                      </SelectItem>
                      {filteredCostCenters.map((cc) => (
                        <SelectItem key={cc.id} value={cc.id}>
                          {cc.cost_center_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 block">
                    {appLang === "en" ? "Account Type" : "نوع الحساب"}
                  </Label>
                  <Select value={selectedAccountType} onValueChange={setSelectedAccountType}>
                    <SelectTrigger>
                      <SelectValue placeholder={appLang === "en" ? "All Types" : "جميع الأنواع"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{appLang === "en" ? "All Types" : "جميع الأنواع"}</SelectItem>
                      <SelectItem value="cash">{appLang === "en" ? "Cash" : "نقدية"}</SelectItem>
                      <SelectItem value="bank">{appLang === "en" ? "Bank" : "بنك"}</SelectItem>
                      <SelectItem value="asset">{appLang === "en" ? "Asset" : "أصل"}</SelectItem>
                      <SelectItem value="liability">{appLang === "en" ? "Liability" : "التزام"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label className="mb-1 block">
                    {appLang === "en" ? "Search" : "بحث"}
                  </Label>
                  <Input
                    type="text"
                    value={accountSearchQuery}
                    onChange={(e) => setAccountSearchQuery(e.target.value)}
                    placeholder={appLang === "en" ? "Account name or code..." : "اسم الحساب أو الكود..."}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredAccounts.map((a) => {
                const balance = balances[a.id] || 0;
                const formattedBalance = new Intl.NumberFormat(
                  appLang === "en" ? "en-EG" : "ar-EG",
                  { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                ).format(Math.abs(balance));
                // v3.25.1: native-currency balance for FC accounts
                const nativeCcy = String((a as any).original_currency || "").toUpperCase();
                const isFCAccount = !!nativeCcy && nativeCcy !== appCurrency.toUpperCase();
                const nativeBalance = nativeBalances[a.id];
                const formattedNativeBalance = isFCAccount && nativeBalance != null
                  ? new Intl.NumberFormat(appLang === "en" ? "en-EG" : "ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(nativeBalance))
                  : null;
                const nativeSymbol = currencySymbols[nativeCcy] || nativeCcy;
                return (
                  <a
                    key={a.id}
                    href={`/banking/${a.id}`}
                    className="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-slate-900 block transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">
                          {a.account_name}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {a.account_code || ""}
                        </div>
                        {/* Branch and Cost Center info */}
                        {(a.branch_name || a.cost_center_name) && (
                          <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                            {a.branch_name && (
                              <span className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded">
                                <Building2 className="w-3 h-3" />
                                {a.branch_name}
                              </span>
                            )}
                            {a.cost_center_name && (
                              <span className="flex items-center gap-1 bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded">
                                <MapPin className="w-3 h-3" />
                                {a.cost_center_name}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end">
                        {/* v3.25.1: native currency balance shown PRIMARY for FC accounts */}
                        {isFCAccount && formattedNativeBalance != null ? (
                          <>
                            <div
                              className={`text-lg font-bold ${(nativeBalance ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}
                              title={appLang === "en" ? "Balance in account's native currency" : "الرصيد بعملة الحساب الأصلية"}
                            >
                              {(nativeBalance ?? 0) < 0 ? "-" : ""}
                              {formattedNativeBalance} {nativeSymbol}
                            </div>
                            <div
                              className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
                              title={appLang === "en" ? `Equivalent in ${appCurrency}` : `المعادل بـ ${appCurrency}`}
                            >
                              ≈ {balance < 0 ? "-" : ""}{formattedBalance} {currencySymbol}
                            </div>
                          </>
                        ) : (
                          <div className={`text-lg font-bold ${balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {balance < 0 ? "-" : ""}
                            {formattedBalance} {currencySymbol}
                          </div>
                        )}
                      </div>
                    </div>
                    <div
                      className="text-xs mt-2 text-blue-600"
                      suppressHydrationWarning
                    >
                      {hydrated && appLang === "en"
                        ? "View details →"
                        : "عرض التفاصيل ←"}
                    </div>
                  </a>
                );
              })}
              {filteredAccounts.length === 0 && (
                <div
                  className="text-sm text-gray-600 dark:text-gray-400 col-span-full"
                  suppressHydrationWarning
                >
                  {accounts.length === 0
                    ? hydrated && appLang === "en"
                      ? "No accounts yet. Add them from Chart of Accounts."
                      : "لا توجد حسابات بعد. قم بإضافتها من الشجرة المحاسبية."
                    : hydrated && appLang === "en"
                      ? "No accounts match the selected filters."
                      : "لا توجد حسابات تطابق الفلاتر المحددة."}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
