"use client"

import { useEffect, useState } from "react"

const LAST_UPDATED = "31 مايو 2026"
const LAST_UPDATED_EN = "May 31, 2026"

export default function TermsPage() {
  const [appLang, setAppLang] = useState<"ar" | "en">("ar")
  const t = (ar: string, en: string) => (appLang === "ar" ? ar : en)

  useEffect(() => {
    const h = () => { try { setAppLang((localStorage.getItem("app_language") || "ar") === "en" ? "en" : "ar") } catch {} }
    h(); window.addEventListener("app_language_changed", h)
    return () => window.removeEventListener("app_language_changed", h)
  }, [])

  return (
    <article dir={appLang === "ar" ? "rtl" : "ltr"}>
      <h1>{t("شروط الاستخدام", "Terms of Service")}</h1>
      <p><strong>{t("آخر تحديث:", "Last updated:")}</strong> {appLang === "en" ? LAST_UPDATED_EN : LAST_UPDATED}</p>

      {appLang === "en" ? (
        <p>
          Welcome to the <strong>7esab.com</strong> platform (hereinafter referred to as the &quot;Platform&quot; or the &quot;Service&quot;).
          By using the Service, you agree to be bound by these terms. If you do not agree, please do not use the Platform.
        </p>
      ) : (
        <p>
          مرحباً بك فى منصة <strong>7esab.com</strong> (المُشار إليها فيما بعد بـ &quot;المنصة&quot; أو &quot;الخدمة&quot;).
          باستخدامك للخدمة، فإنك توافق على الالتزام بهذه الشروط. إن لم توافق، يُرجى عدم استخدام المنصة.
        </p>
      )}

      <h2>{t("1. تعريفات", "1. Definitions")}</h2>
      {appLang === "en" ? (
        <ul>
          <li><strong>The Platform:</strong> the 7esab.com application and all services associated with it.</li>
          <li><strong>User / Customer:</strong> any natural or legal person who uses the Platform.</li>
          <li><strong>The Operator:</strong> the company or individual that owns 7esab.com.</li>
          <li><strong>Subscription:</strong> the paid monthly or annual plan registered on the Platform.</li>
        </ul>
      ) : (
        <ul>
          <li><strong>المنصة:</strong> تطبيق 7esab.com وكل الخدمات المرتبطة به.</li>
          <li><strong>المستخدم / العميل:</strong> أى شخص طبيعى أو اعتبارى يستخدم المنصة.</li>
          <li><strong>المُشغِّل:</strong> الشركة أو الفرد المالك لـ 7esab.com.</li>
          <li><strong>الاشتراك:</strong> الباقة المدفوعة الشهرية أو السنوية المسجَّلة فى المنصة.</li>
        </ul>
      )}

      <h2>{t("2. الأهلية القانونية", "2. Legal Capacity")}</h2>
      {appLang === "en" ? (
        <p>
          You must be of a legal age that permits entering into contracts (18 years in Egypt), or use the Platform on
          behalf of a registered legal entity that you are authorized to represent. By using the Platform, you
          acknowledge the validity of these terms.
        </p>
      ) : (
        <p>
          يجب أن تكون فى سن قانونى يسمح بإبرام العقود (18 سنة فى مصر) أو تستخدم المنصة نيابة عن كيان قانونى مسجَّل
          لديك صلاحية تمثيله. باستخدامك المنصة، تقرّ بصحة هذه الشروط.
        </p>
      )}

      <h2>{t("3. الحساب وكلمة المرور", "3. Account and Password")}</h2>
      {appLang === "en" ? (
        <ul>
          <li>You are responsible for protecting your account login credentials.</li>
          <li>Any activity carried out from your account is deemed to originate from you unless you immediately notify the Operator of any unauthorized use.</li>
          <li>The Operator is not liable for any losses resulting from negligence in protecting your password.</li>
        </ul>
      ) : (
        <ul>
          <li>أنت مسؤول عن حماية بيانات الدخول الخاصة بحسابك.</li>
          <li>أى نشاط يتم من حسابك يُعتبر صادراً منك ما لم تُبلِّغ المُشغِّل فوراً بأى استخدام غير مصرَّح به.</li>
          <li>المُشغِّل غير مسؤول عن أى خسائر ناتجة عن إهمال حماية كلمة المرور.</li>
        </ul>
      )}

      <h2>{t("4. الاستخدام المسموح به", "4. Permitted Use")}</h2>
      <p>{t("تستخدم المنصة فى الأغراض المشروعة وفقط لـ:", "You may use the Platform for lawful purposes and only to:")}</p>
      {appLang === "en" ? (
        <ul>
          <li>Manage the accounting of your own company or your client&apos;s company.</li>
          <li>Issue invoices and financial documents in accordance with Egyptian law.</li>
          <li>Manage your organization&apos;s inventory, employees, and operational processes.</li>
        </ul>
      ) : (
        <ul>
          <li>إدارة محاسبة الشركة الخاصة بك أو شركة موكلك.</li>
          <li>إصدار الفواتير والمستندات المالية وفقاً للقانون المصرى.</li>
          <li>إدارة المخزون والموظفين والعمليات التشغيلية لمؤسستك.</li>
        </ul>
      )}

      <h2>{t("5. الاستخدام المحظور", "5. Prohibited Use")}</h2>
      <p>{t("يُحظر صراحة استخدام المنصة لأى من الأغراض التالية:", "Using the Platform for any of the following purposes is expressly prohibited:")}</p>
      {appLang === "en" ? (
        <ul>
          <li>Money laundering or concealing the proceeds of crime.</li>
          <li>Tax evasion or forging documents.</li>
          <li>Hacking or attempting unauthorized access to other people&apos;s accounts.</li>
          <li>Distributing malicious software or content that violates public order.</li>
          <li>Reselling the Service or copying it for third parties without written permission.</li>
        </ul>
      ) : (
        <ul>
          <li>غسيل الأموال أو إخفاء عائدات الجريمة.</li>
          <li>التهرب الضريبى أو تزوير المستندات.</li>
          <li>اختراق أو محاولة الوصول غير المصرَّح به لحسابات الآخرين.</li>
          <li>نشر برمجيات ضارة أو محتوى مخالف للنظام العام.</li>
          <li>إعادة بيع الخدمة أو نسخها للغير دون إذن خطى.</li>
        </ul>
      )}

      <h2>{t("6. الاشتراك والدفع", "6. Subscription and Payment")}</h2>
      {appLang === "en" ? (
        <ul>
          <li>Payments are made in Egyptian pounds through the accredited <strong>Paymob</strong> gateway.</li>
          <li>The subscription renews automatically unless you request cancellation before the end of the current period.</li>
          <li>Prices include value-added tax (14%) in accordance with Egyptian law.</li>
          <li>If a renewal payment fails, the account is suspended after a 7-day grace period, and the data cannot be accessed until the outstanding amounts are settled.</li>
          <li>Refund details are set out in the <a href="/legal/refund"><strong>Refund Policy</strong></a>.</li>
        </ul>
      ) : (
        <ul>
          <li>تتم المدفوعات بالجنيه المصرى عبر بوابة <strong>Paymob</strong> المعتمدة.</li>
          <li>الاشتراك يتجدد تلقائياً ما لم تطلب الإلغاء قبل نهاية الفترة الحالية.</li>
          <li>الأسعار تشمل ضريبة القيمة المضافة (14%) وفقاً للقانون المصرى.</li>
          <li>عند فشل تجديد الدفع، يُعلَّق الحساب بعد فترة سماح 7 أيام، ولا يمكن الوصول للبيانات حتى تسوية المستحقات.</li>
          <li>تفاصيل الاسترداد فى <a href="/legal/refund"><strong>سياسة الاسترداد</strong></a>.</li>
        </ul>
      )}

      <h2>{t("7. ملكية البيانات", "7. Data Ownership")}</h2>
      {appLang === "en" ? (
        <ul>
          <li><strong>Your data belongs to you</strong>. The Operator stores it only to provide the Service.</li>
          <li>You can export a full backup of your data at any time from the account settings.</li>
          <li>When the subscription ends, your data remains available for download for <strong>30 days</strong> before final deletion.</li>
        </ul>
      ) : (
        <ul>
          <li><strong>بياناتك ملكك أنت</strong>. المُشغِّل يخزّنها فقط لتقديم الخدمة.</li>
          <li>تستطيع تصدير نسخة احتياطية كاملة من بياناتك فى أى وقت من إعدادات الحساب.</li>
          <li>عند إنهاء الاشتراك، تبقى بياناتك متاحة للتحميل لمدة <strong>30 يوماً</strong> قبل الحذف النهائى.</li>
        </ul>
      )}

      <h2>{t("8. مستوى الخدمة (SLA)", "8. Service Level (SLA)")}</h2>
      {appLang === "en" ? (
        <p>
          We are committed to keeping the Platform available <strong>99% of the time each month</strong>, with exceptions
          for scheduled maintenance announced at least 24 hours in advance, or in cases of force majeure.
        </p>
      ) : (
        <p>
          نلتزم بإتاحة المنصة بنسبة <strong>99% من الوقت شهرياً</strong>، مع استثناءات للصيانة المُجدوَلة المُعلَن
          عنها مسبقاً 24 ساعة على الأقل، أو فى حالات القوة القاهرة.
        </p>
      )}

      <h2>{t("9. حدود المسؤولية", "9. Limitation of Liability")}</h2>
      {appLang === "en" ? (
        <ul>
          <li>The Platform is a tool to help you manage your accounting; it is not a substitute for a chartered accountant or tax advisor.</li>
          <li>The Operator is not liable for any losses resulting from errors in the data you entered.</li>
          <li>Total potential compensation shall not exceed the value of your subscription over the last 12 months.</li>
        </ul>
      ) : (
        <ul>
          <li>المنصة أداة لمساعدتك فى إدارة محاسبتك، وليست بديلاً عن المحاسب القانونى أو المستشار الضريبى.</li>
          <li>المُشغِّل غير مسؤول عن أى خسائر ناتجة عن أخطاء فى البيانات التى أدخلتها أنت.</li>
          <li>إجمالى التعويضات المُحتملة لا تتجاوز قيمة اشتراكك خلال آخر 12 شهراً.</li>
        </ul>
      )}

      <h2>{t("10. الإنهاء", "10. Termination")}</h2>
      <p>{t("يحق للمُشغِّل إنهاء أو تعليق حسابك فوراً فى حالة:", "The Operator has the right to terminate or suspend your account immediately in the event of:")}</p>
      {appLang === "en" ? (
        <ul>
          <li>Violation of these terms.</li>
          <li>Non-payment of outstanding amounts for more than 30 days after a reminder.</li>
          <li>Use of the Platform for illegal activities.</li>
        </ul>
      ) : (
        <ul>
          <li>مخالفة هذه الشروط.</li>
          <li>عدم سداد المستحقات لأكثر من 30 يوماً بعد التذكير.</li>
          <li>استخدام المنصة فى أنشطة غير قانونية.</li>
        </ul>
      )}

      <h2>{t("11. التعديلات", "11. Amendments")}</h2>
      {appLang === "en" ? (
        <p>
          We may amend these terms from time to time. We will notify you of material amendments via your registered
          email 14 days before they take effect. Your continued use of the Platform after an amendment constitutes
          your acceptance of it.
        </p>
      ) : (
        <p>
          قد نُعدّل هذه الشروط من وقت لآخر. سنُخطرك بالتعديلات الجوهرية عبر البريد الإلكترونى المسجَّل قبل سريانها
          بـ 14 يوماً. استمرار استخدامك للمنصة بعد التعديل يعنى موافقتك عليه.
        </p>
      )}

      <h2>{t("12. القانون الحاكم والاختصاص القضائى", "12. Governing Law and Jurisdiction")}</h2>
      {appLang === "en" ? (
        <p>
          These terms are governed by the provisions of Egyptian law. Any dispute that arises shall be referred to the
          competent courts of Cairo.
        </p>
      ) : (
        <p>
          تخضع هذه الشروط لأحكام القانون المصرى. أى نزاع ينشأ يُحال إلى محاكم القاهرة المختصة.
        </p>
      )}

      <h2>{t("13. التواصل", "13. Contact")}</h2>
      {appLang === "en" ? (
        <p>
          For any inquiry about these terms:{" "}
          <a href="mailto:info@7esab.com">info@7esab.com</a>
        </p>
      ) : (
        <p>
          لأى استفسار حول هذه الشروط:{" "}
          <a href="mailto:info@7esab.com">info@7esab.com</a>
        </p>
      )}

      <p className="mt-8 text-sm text-slate-500">
        {t(
          "نُنوّه أن هذه الشروط نموذجية ولا تُغنى عن استشارة قانونية متخصصة لتفاصيل عملك. ننصح بمراجعتها مع محامى قبل الاعتماد الكامل عليها.",
          "Please note that these terms are a template and are not a substitute for specialized legal advice on the specifics of your business. We recommend reviewing them with a lawyer before relying on them fully."
        )}
      </p>
    </article>
  )
}
