"use client"

import { useEffect, useState } from "react"

const LAST_UPDATED = "31 مايو 2026"
const LAST_UPDATED_EN = "May 31, 2026"

export default function RefundPage() {
  const [appLang, setAppLang] = useState<"ar" | "en">("ar")
  const t = (ar: string, en: string) => (appLang === "ar" ? ar : en)

  useEffect(() => {
    const h = () => { try { setAppLang((localStorage.getItem("app_language") || "ar") === "en" ? "en" : "ar") } catch {} }
    h(); window.addEventListener("app_language_changed", h)
    return () => window.removeEventListener("app_language_changed", h)
  }, [])

  return (
    <article dir={appLang === "ar" ? "rtl" : "ltr"}>
      <h1>{t("سياسة الاسترداد", "Refund Policy")}</h1>
      <p><strong>{t("آخر تحديث:", "Last updated:")}</strong> {appLang === "en" ? LAST_UPDATED_EN : LAST_UPDATED}</p>

      {appLang === "en" ? (
        <p>
          We want you to be completely satisfied with our service. This policy explains the cases in which you can
          obtain a refund of your subscription fee, and the procedures to follow.
        </p>
      ) : (
        <p>
          نريدك راضياً عن خدمتنا تماماً. توضّح هذه السياسة الحالات التى يمكنك فيها استرداد قيمة اشتراكك،
          والإجراءات المُتَّبَعة.
        </p>
      )}

      <h2>{t("1. ضمان استرداد خلال 14 يوماً (Cooling-off Period)", "1. 14-Day Money-Back Guarantee (Cooling-off Period)")}</h2>
      {appLang === "en" ? (
        <p>
          If you subscribe to any paid plan for the first time, you are entitled to request a <strong>full refund</strong>{" "}
          within 14 days of the date of the first payment, without needing to state any reasons. This is a legal right
          for e-commerce consumers in Egypt and the countries of the European Union.
        </p>
      ) : (
        <p>
          إذا اشتركت لأول مرة فى أى باقة مدفوعة، يحق لك طلب <strong>استرداد كامل</strong> خلال 14 يوماً من تاريخ
          أول دفعة، دون الحاجة لذكر أسباب. هذا حق قانونى لمستهلكى التجارة الإلكترونية فى مصر ودول الاتحاد الأوروبى.
        </p>
      )}
      {appLang === "en" ? (
        <p>
          <strong>The only condition:</strong> no more than 50 real invoices have been issued from your account to your
          customers during this period (to prevent full use of the service followed by a refund request).
        </p>
      ) : (
        <p>
          <strong>الشرط الوحيد:</strong> ألا تكون قد صدرت من حسابك أكثر من 50 فاتورة حقيقية لعملائك خلال هذه الفترة
          (لتجنب الاستخدام الكامل ثم طلب الاسترداد).
        </p>
      )}

      <h2>{t("2. الاسترداد الجزئى بعد فترة الـ 14 يوماً", "2. Partial Refund After the 14-Day Period")}</h2>
      <p>{t("إذا أنهيت اشتراكك السنوى قبل انتهاء الفترة، يحق لك استرداد جزئى وفقاً للقاعدة التالية:", "If you terminate your annual subscription before the end of the period, you are entitled to a partial refund according to the following rule:")}</p>
      <table className="my-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-300">
            <th className="p-2 text-start font-semibold">{t("الفترة المُنقضية", "Elapsed Period")}</th>
            <th className="p-2 text-start font-semibold">{t("نسبة الاسترداد", "Refund Percentage")}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-slate-200">
            <td className="p-2">{t("≤ 1 شهر", "≤ 1 month")}</td>
            <td className="p-2">90%</td>
          </tr>
          <tr className="border-b border-slate-200">
            <td className="p-2">{t("1-3 شهور", "1-3 months")}</td>
            <td className="p-2">60%</td>
          </tr>
          <tr className="border-b border-slate-200">
            <td className="p-2">{t("3-6 شهور", "3-6 months")}</td>
            <td className="p-2">40%</td>
          </tr>
          <tr className="border-b border-slate-200">
            <td className="p-2">{t("6-9 شهور", "6-9 months")}</td>
            <td className="p-2">20%</td>
          </tr>
          <tr>
            <td className="p-2">{appLang === "en" ? <>&gt; 9 months</> : <>&gt; 9 شهور</>}</td>
            <td className="p-2">{t("لا استرداد", "No refund")}</td>
          </tr>
        </tbody>
      </table>

      <h2>{t("3. الاشتراكات الشهرية", "3. Monthly Subscriptions")}</h2>
      {appLang === "en" ? (
        <p>
          Monthly subscriptions <strong>are not eligible for partial refunds</strong> after the first 14 days. If you
          cancel your subscription, you will retain access until the end of the paid month, after which renewal stops.
        </p>
      ) : (
        <p>
          الاشتراكات الشهرية <strong>لا تخضع للاسترداد الجزئى</strong> بعد أول 14 يوماً. لو ألغيت اشتراكك،
          ستحتفظ بالوصول حتى نهاية الشهر المدفوع، ثم يتوقف التجديد.
        </p>
      )}

      <h2>{t("4. الحالات التى لا تخضع للاسترداد", "4. Cases Not Eligible for a Refund")}</h2>
      {appLang === "en" ? (
        <ul>
          <li>More than 14 days have passed since the first payment for monthly subscriptions.</li>
          <li>Cancellation due to your violation of the terms of service (illegal activities, fraud, etc.).</li>
          <li>Additional services already consumed (custom reports, advanced support, consultations).</li>
          <li>Paymob payment gateway fees (~2-3%) — these are withheld by the bank and we cannot refund them.</li>
        </ul>
      ) : (
        <ul>
          <li>مرور أكثر من 14 يوماً من أول دفعة للاشتراكات الشهرية.</li>
          <li>الإلغاء بسبب مخالفتك لشروط الاستخدام (أنشطة غير مشروعة، احتيال، إلخ).</li>
          <li>الخدمات الإضافية المُستهلَكة بالفعل (تقارير مخصصة، دعم متقدم، استشارات).</li>
          <li>رسوم بوابة الدفع Paymob (~2-3%) — هذه تُحتجز من جانب البنك ولا يمكننا استردادها.</li>
        </ul>
      )}

      <h2>{t("5. حالات الاسترداد الكامل المضمون", "5. Guaranteed Full Refund Cases")}</h2>
      <p>{t("نسترد القيمة كاملة فوراً فى الحالات التالية:", "We refund the full amount immediately in the following cases:")}</p>
      {appLang === "en" ? (
        <ul>
          <li>The service is down for more than 7 consecutive days due to a fault on our side.</li>
          <li>Loss of your data due to a technical error by the Operator.</li>
          <li>Payment made in error (duplicate payment, wrong amount).</li>
          <li>The service does not match the advertised description.</li>
        </ul>
      ) : (
        <ul>
          <li>توقف الخدمة لأكثر من 7 أيام متواصلة بسبب عطل من جانبنا.</li>
          <li>فقدان بياناتك بسبب خطأ تقنى من المُشغِّل.</li>
          <li>الدفع بالخطأ (دفعة مكررة، مبلغ خاطئ).</li>
          <li>عدم تطابق الخدمة مع الوصف المُعلَن.</li>
        </ul>
      )}

      <h2>{t("6. كيف تطلب الاسترداد", "6. How to Request a Refund")}</h2>
      {appLang === "en" ? (
        <ol>
          <li>Send an email to <a href="mailto:billing@7esab.com">billing@7esab.com</a>.</li>
          <li>Write in the email subject: <strong>&quot;Refund Request - [Company Name]&quot;</strong>.</li>
          <li>In the body, mention:
            <ul>
              <li>The company name registered on the platform.</li>
              <li>The date of the last payment.</li>
              <li>The reason for the refund request (optional for the 14-day period).</li>
            </ul>
          </li>
          <li>We will respond to your request within <strong>3 business days</strong>.</li>
          <li>Upon approval, the amount reaches your card within <strong>7-14 business days</strong> (depending on the bank).</li>
        </ol>
      ) : (
        <ol>
          <li>أرسل إيميل إلى <a href="mailto:billing@7esab.com">billing@7esab.com</a>.</li>
          <li>اكتب فى موضوع الإيميل: <strong>&quot;طلب استرداد - [اسم الشركة]&quot;</strong>.</li>
          <li>اذكر فى المحتوى:
            <ul>
              <li>اسم الشركة المسجَّلة فى المنصة.</li>
              <li>تاريخ آخر دفعة.</li>
              <li>سبب طلب الاسترداد (اختيارى للـ 14 يوماً).</li>
            </ul>
          </li>
          <li>سنرد على طلبك خلال <strong>3 أيام عمل</strong>.</li>
          <li>عند الموافقة، يصل المبلغ لبطاقتك خلال <strong>7-14 يوم عمل</strong> (حسب البنك).</li>
        </ol>
      )}

      <h2>{t("7. ما يحدث لبياناتك بعد الاسترداد", "7. What Happens to Your Data After a Refund")}</h2>
      {appLang === "en" ? (
        <ul>
          <li>The account becomes <strong>read-only</strong> immediately.</li>
          <li>You have <strong>30 days</strong> to export a full backup of your data.</li>
          <li>After 30 days, the data is permanently deleted in accordance with the <a href="/legal/privacy"><strong>Privacy Policy</strong></a>.</li>
        </ul>
      ) : (
        <ul>
          <li>الحساب يصبح <strong>قراءة فقط</strong> فوراً.</li>
          <li>لديك <strong>30 يوماً</strong> لتصدير نسخة احتياطية كاملة من بياناتك.</li>
          <li>بعد 30 يوم، تُحذف البيانات نهائياً وفقاً لـ <a href="/legal/privacy"><strong>سياسة الخصوصية</strong></a>.</li>
        </ul>
      )}

      <h2>{t("8. النزاعات", "8. Disputes")}</h2>
      {appLang === "en" ? (
        <p>
          If we disagree about refund entitlement, you have the right to:
        </p>
      ) : (
        <p>
          إذا اختلفنا حول استحقاق الاسترداد، يحق لك:
        </p>
      )}
      {appLang === "en" ? (
        <ul>
          <li>Contact <a href="mailto:support@7esab.com">support@7esab.com</a> for an amicable settlement.</li>
          <li>Escalate the matter to the electronic mediator affiliated with the <strong>Egyptian Ministry of Communications</strong>.</li>
          <li>Resort to the judiciary in accordance with the jurisdiction of the Cairo courts.</li>
        </ul>
      ) : (
        <ul>
          <li>التواصل مع <a href="mailto:support@7esab.com">support@7esab.com</a> للتسوية الودية.</li>
          <li>تصعيد الأمر للوسيط الإلكترونى التابع لـ <strong>وزارة الاتصالات المصرية</strong>.</li>
          <li>اللجوء للقضاء وفقاً لاختصاص محاكم القاهرة.</li>
        </ul>
      )}

      <h2>{t("9. التواصل", "9. Contact")}</h2>
      {appLang === "en" ? (
        <p>
          For any inquiry about refunds:{" "}
          <a href="mailto:billing@7esab.com">billing@7esab.com</a>
          <br />
          Expected response: 3 business days.
        </p>
      ) : (
        <p>
          لأى استفسار عن الاسترداد:{" "}
          <a href="mailto:billing@7esab.com">billing@7esab.com</a>
          <br />
          رد متوقَّع: 3 أيام عمل.
        </p>
      )}

      {appLang === "en" ? (
        <p className="mt-8 text-sm text-slate-500">
          This policy is consistent with the <strong>Egyptian Consumer Protection Law No. 181 of 2018</strong> and the
          applicable e-commerce regulations. We recommend reviewing it with a specialized lawyer for the specifics of
          your business.
        </p>
      ) : (
        <p className="mt-8 text-sm text-slate-500">
          هذه السياسة تتسق مع <strong>قانون حماية المستهلك المصرى رقم 181 لسنة 2018</strong> ولوائح التجارة
          الإلكترونية المعمول بها. ننصح بمراجعتها مع محامى متخصص لتفاصيل عملك.
        </p>
      )}
    </article>
  )
}
