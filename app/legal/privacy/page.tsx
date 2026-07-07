"use client"

import { useEffect, useState } from "react"

const LAST_UPDATED = "31 مايو 2026"
const LAST_UPDATED_EN = "May 31, 2026"

export default function PrivacyPage() {
  const [appLang, setAppLang] = useState<"ar" | "en">("ar")
  const t = (ar: string, en: string) => (appLang === "ar" ? ar : en)

  useEffect(() => {
    const h = () => { try { setAppLang((localStorage.getItem("app_language") || "ar") === "en" ? "en" : "ar") } catch {} }
    h(); window.addEventListener("app_language_changed", h)
    return () => window.removeEventListener("app_language_changed", h)
  }, [])

  return (
    <article dir={appLang === "ar" ? "rtl" : "ltr"}>
      <h1>{t("سياسة الخصوصية", "Privacy Policy")}</h1>
      <p><strong>{t("آخر تحديث:", "Last updated:")}</strong> {appLang === "en" ? LAST_UPDATED_EN : LAST_UPDATED}</p>

      {appLang === "en" ? (
        <p>
          At <strong>7esab.com</strong> we take your privacy very seriously. This policy explains how we collect, use, and
          protect your personal and business data, in compliance with the <strong>Egyptian Personal Data Protection Law No. 151 of 2020 (PDPL)</strong>{" "}
          and the <strong>European GDPR regulation</strong> for customers in the European Union.
        </p>
      ) : (
        <p>
          نحن فى <strong>7esab.com</strong> نأخذ خصوصيتك بجدية تامة. توضح هذه السياسة كيف نجمع ونستخدم ونحمى
          بياناتك الشخصية والتجارية، بما يتوافق مع <strong>قانون حماية البيانات الشخصية المصرى رقم 151 لسنة 2020 (PDPL)</strong>{" "}
          و <strong>لائحة GDPR الأوروبية</strong> للعملاء فى الاتحاد الأوروبى.
        </p>
      )}

      <h2>{t("1. ما هى البيانات التى نجمعها", "1. What Data We Collect")}</h2>

      <h3>{t("أ) بيانات الحساب", "a) Account Data")}</h3>
      {appLang === "en" ? (
        <ul>
          <li>Full name, email address, phone number.</li>
          <li>Company name, tax registration number, business address, city.</li>
          <li>Password (encrypted with bcrypt + salt — none of our employees can read it).</li>
        </ul>
      ) : (
        <ul>
          <li>الاسم الكامل، البريد الإلكترونى، رقم الهاتف.</li>
          <li>اسم الشركة، الرقم الضريبى، عنوان النشاط، المدينة.</li>
          <li>كلمة المرور (مُشفَّرة بـ bcrypt + salt — لا يمكن لأى من موظفينا قراءتها).</li>
        </ul>
      )}

      <h3>{t("ب) بيانات الاستخدام التقنية", "b) Technical Usage Data")}</h3>
      {appLang === "en" ? (
        <ul>
          <li>IP address, browser type, operating system.</li>
          <li>A log of the pages you visited within the platform (to improve the service).</li>
          <li>Login and logout times.</li>
        </ul>
      ) : (
        <ul>
          <li>عنوان IP، نوع المتصفح، نظام التشغيل.</li>
          <li>سجل الصفحات التى زرتها داخل المنصة (لتحسين الخدمة).</li>
          <li>أوقات تسجيل الدخول والخروج.</li>
        </ul>
      )}

      <h3>{t("ج) بيانات تجارية تُدخلها أنت", "c) Business Data You Enter")}</h3>
      {appLang === "en" ? (
        <ul>
          <li>Data of the customers and suppliers you deal with.</li>
          <li>Invoices, accounting entries, inventory, bank accounts.</li>
          <li><strong>You are the legal owner of this data</strong>; we only store it to provide the service.</li>
        </ul>
      ) : (
        <ul>
          <li>بيانات العملاء والموردين الذين تتعامل معهم.</li>
          <li>الفواتير، القيود المحاسبية، المخزون، الحسابات البنكية.</li>
          <li><strong>أنت المالك القانونى لهذه البيانات</strong>، نحن نخزّنها فقط لتقديم الخدمة.</li>
        </ul>
      )}

      <h3>{t("د) بيانات الدفع", "d) Payment Data")}</h3>
      {appLang === "en" ? (
        <p>
          <strong>We never store your credit card details</strong>. All payments are processed through the{" "}
          <strong>Paymob</strong> gateway, accredited by the Central Bank of Egypt, which handles encryption and
          processing in accordance with the global PCI-DSS standard. We only receive confirmation of the payment&apos;s
          success/failure.
        </p>
      ) : (
        <p>
          <strong>لا نُخزِّن بيانات بطاقاتك الائتمانية إطلاقاً</strong>. كل المدفوعات تتم عبر بوابة{" "}
          <strong>Paymob</strong> المعتمدة من البنك المركزى المصرى، التى تتولى التشفير والمعالجة وفقاً
          لمعيار PCI-DSS العالمى. نحن نتلقى فقط تأكيد نجاح/فشل الدفعة.
        </p>
      )}

      <h2>{t("2. لماذا نجمع هذه البيانات", "2. Why We Collect This Data")}</h2>
      {appLang === "en" ? (
        <ul>
          <li><strong>Providing the service:</strong> operating your account and processing your requests.</li>
          <li><strong>Improvement:</strong> understanding how the platform is used in order to develop it.</li>
          <li><strong>Communication:</strong> sending important emails about your account and subscription.</li>
          <li><strong>Security:</strong> detecting and preventing hacking and fraud attempts.</li>
          <li><strong>Legal compliance:</strong> responding to requests from the competent legal authorities.</li>
        </ul>
      ) : (
        <ul>
          <li><strong>تقديم الخدمة:</strong> تشغيل حسابك ومعالجة طلباتك.</li>
          <li><strong>التحسين:</strong> فهم كيفية استخدام المنصة لتطويرها.</li>
          <li><strong>التواصل:</strong> إرسال إيميلات مهمة عن حسابك واشتراكك.</li>
          <li><strong>الأمان:</strong> اكتشاف ومنع محاولات الاختراق والاحتيال.</li>
          <li><strong>الالتزام القانونى:</strong> الاستجابة لطلبات السلطات القانونية المختصة.</li>
        </ul>
      )}

      <h2>{t("3. مع من نُشارك البيانات", "3. Who We Share Data With")}</h2>
      {appLang === "en" ? (
        <p>
          We <strong>never sell your data</strong>. We share it only with:
        </p>
      ) : (
        <p>
          نحن <strong>لا نبيع بياناتك أبداً</strong>. نُشاركها فقط مع:
        </p>
      )}
      {appLang === "en" ? (
        <ul>
          <li>
            <strong>Supabase Inc.</strong> (cloud database provider) — to store data securely.
            Data centers are in the United States under a Data Processing Agreement (DPA).
          </li>
          <li>
            <strong>Vercel Inc.</strong> (hosting provider) — to run the website.
          </li>
          <li>
            <strong>Paymob</strong> (payment gateway) — for payment processing only.
          </li>
          <li>
            <strong>Resend</strong> (email service) — to send system emails.
          </li>
          <li>
            <strong>Sentry Inc.</strong> (error monitoring) — to receive technical error reports.
          </li>
          <li><strong>Competent government authorities</strong> where there is an explicit court order.</li>
        </ul>
      ) : (
        <ul>
          <li>
            <strong>Supabase Inc.</strong> (مزود قاعدة البيانات السحابية) — لتخزين البيانات بأمان.
            المراكز فى الولايات المتحدة ضمن إطار اتفاقية معالجة البيانات (DPA).
          </li>
          <li>
            <strong>Vercel Inc.</strong> (مزود الاستضافة) — لتشغيل الموقع.
          </li>
          <li>
            <strong>Paymob</strong> (بوابة الدفع) — لمعالجة المدفوعات فقط.
          </li>
          <li>
            <strong>Resend</strong> (خدمة البريد) — لإرسال إيميلات النظام.
          </li>
          <li>
            <strong>Sentry Inc.</strong> (مراقبة الأخطاء) — لاستقبال تقارير الأخطاء التقنية.
          </li>
          <li><strong>السلطات الحكومية المختصة</strong> عند وجود أمر قضائى صريح.</li>
        </ul>
      )}

      <h2>{t("4. كيف نحمى بياناتك", "4. How We Protect Your Data")}</h2>
      {appLang === "en" ? (
        <ul>
          <li><strong>Encryption in transit:</strong> HTTPS/TLS 1.3 on all connections.</li>
          <li><strong>Encryption at rest:</strong> AES-256 on all databases and backups.</li>
          <li><strong>Encrypted backups:</strong> client-side AES-256-GCM encryption for downloaded backups, with a password we do not know.</li>
          <li><strong>Tenant isolation:</strong> Row Level Security (RLS) prevents any company from accessing another company&apos;s data.</li>
          <li><strong>Audit Log:</strong> we record every sensitive operation for later review.</li>
          <li><strong>Authentication:</strong> Supabase Auth + JWT + two-factor authentication features available.</li>
          <li><strong>Monitoring:</strong> Sentry for immediate alerts on any error.</li>
        </ul>
      ) : (
        <ul>
          <li><strong>التشفير أثناء النقل:</strong> HTTPS/TLS 1.3 على كل الاتصالات.</li>
          <li><strong>التشفير أثناء التخزين:</strong> AES-256 على كل قواعد البيانات والنسخ الاحتياطية.</li>
          <li><strong>النسخ الاحتياطية المُشفَّرة:</strong> تشفير AES-256-GCM client-side للنسخ التى تُحمَّل، بكلمة مرور لا نعرفها.</li>
          <li><strong>عزل المستأجرين:</strong> Row Level Security (RLS) يمنع أى شركة من الوصول لبيانات شركة أخرى.</li>
          <li><strong>سجل التدقيق (Audit Log):</strong> نسجِّل كل عملية حساسة لمراجعتها لاحقاً.</li>
          <li><strong>المصادقة:</strong> Supabase Auth + JWT + ميزات المصادقة الثنائية متاحة.</li>
          <li><strong>المراقبة:</strong> Sentry للتنبيه الفورى عند أى خطأ.</li>
        </ul>
      )}

      <h2>{t("5. مدة الاحتفاظ بالبيانات", "5. Data Retention Period")}</h2>
      {appLang === "en" ? (
        <ul>
          <li><strong>During your subscription:</strong> we retain all your data as long as your account is active.</li>
          <li><strong>After cancellation:</strong> a 30-day grace period during which you can export your data.</li>
          <li><strong>Final deletion:</strong> 30 days after final cancellation, the data is deleted from all our systems (including backups) within an additional 90 days.</li>
          <li><strong>Legal invoice records:</strong> we retain them for 5 years in accordance with the Egyptian Commercial Law.</li>
        </ul>
      ) : (
        <ul>
          <li><strong>أثناء الاشتراك:</strong> نحتفظ بكل بياناتك ما دام حسابك نشطاً.</li>
          <li><strong>بعد الإلغاء:</strong> فترة سماح 30 يوماً يمكنك خلالها تصدير بياناتك.</li>
          <li><strong>الحذف النهائى:</strong> بعد 30 يوماً من الإلغاء النهائى، تُحذف البيانات من جميع أنظمتنا (بما فيها النسخ الاحتياطية) خلال 90 يوماً إضافية.</li>
          <li><strong>سجلات الفواتير القانونية:</strong> نحتفظ بها 5 سنوات وفقاً للقانون التجارى المصرى.</li>
        </ul>
      )}

      <h2>{t("6. حقوقك القانونية", "6. Your Legal Rights")}</h2>
      <p>{t("بموجب الـ PDPL المصرى والـ GDPR، يحق لك:", "Under the Egyptian PDPL and the GDPR, you have the right to:")}</p>
      {appLang === "en" ? (
        <ul>
          <li><strong>Right of access:</strong> request a complete copy of your data.</li>
          <li><strong>Right to rectification:</strong> correct any inaccurate data.</li>
          <li><strong>Right to erasure:</strong> request deletion of your data (subject to legal retention requirements).</li>
          <li><strong>Right to portability:</strong> obtain your data in a machine-readable format (JSON).</li>
          <li><strong>Right to object:</strong> object to a specific processing of your data.</li>
          <li><strong>Right to withdraw consent:</strong> at any time, without affecting prior processing.</li>
        </ul>
      ) : (
        <ul>
          <li><strong>حق الوصول:</strong> طلب نسخة كاملة من بياناتك.</li>
          <li><strong>حق التصحيح:</strong> تعديل أى بيانات غير صحيحة.</li>
          <li><strong>حق الحذف:</strong> طلب حذف بياناتك (مع مراعاة الاحتفاظ القانونى).</li>
          <li><strong>حق النقل:</strong> الحصول على بياناتك بصيغة قابلة للقراءة (JSON).</li>
          <li><strong>حق الاعتراض:</strong> الاعتراض على معالجة معينة لبياناتك.</li>
          <li><strong>حق سحب الموافقة:</strong> فى أى وقت دون التأثير على المعالجة السابقة.</li>
        </ul>
      )}
      {appLang === "en" ? (
        <p>
          To exercise any of these rights, send an email to{" "}
          <a href="mailto:privacy@7esab.com">privacy@7esab.com</a> explaining your request. We will respond within 30 days.
        </p>
      ) : (
        <p>
          لممارسة أى من هذه الحقوق، أرسل إيميلاً إلى{" "}
          <a href="mailto:privacy@7esab.com">privacy@7esab.com</a> مع توضيح طلبك. سنرد خلال 30 يوماً.
        </p>
      )}

      <h2>{t("7. ملفات تعريف الارتباط (Cookies)", "7. Cookies")}</h2>
      {appLang === "en" ? (
        <ul>
          <li><strong>Essential cookies:</strong> for the session and login. These cannot be disabled.</li>
          <li><strong>Analytics cookies:</strong> Vercel Analytics and Sentry to understand errors and improve performance.</li>
          <li><strong>We do not use advertising cookies at all.</strong></li>
        </ul>
      ) : (
        <ul>
          <li><strong>Cookies ضرورية:</strong> للجلسة وتسجيل الدخول. لا يمكن تعطيلها.</li>
          <li><strong>Cookies التحليل:</strong> Vercel Analytics و Sentry لفهم الأخطاء وتحسين الأداء.</li>
          <li><strong>لا نستخدم cookies الإعلانات نهائياً.</strong></li>
        </ul>
      )}

      <h2>{t("8. خصوصية الأطفال", "8. Children's Privacy")}</h2>
      {appLang === "en" ? (
        <p>
          The platform is intended for businesses and professionals and is not intended for persons under 18 years of age.
          If we discover an account belonging to a minor, we will delete it immediately.
        </p>
      ) : (
        <p>
          المنصة موجَّهة للمشاريع التجارية والمحترفين، وغير مخصَّصة للأشخاص دون 18 سنة. إذا اكتشفنا حساباً لقاصر،
          سنحذفه فوراً.
        </p>
      )}

      <h2>{t("9. التحويلات الدولية للبيانات", "9. International Data Transfers")}</h2>
      {appLang === "en" ? (
        <p>
          Your data is stored in Supabase data centers in the United States. We apply Standard Contractual Clauses (SCCs)
          to protect data during cross-border transfers in accordance with the GDPR.
        </p>
      ) : (
        <p>
          بياناتك مُخزَّنة فى مراكز Supabase فى الولايات المتحدة. نطبّق ضمانات تعاقدية معيارية (SCCs) لحماية
          البيانات أثناء النقل خارج الحدود وفقاً لـ GDPR.
        </p>
      )}

      <h2>{t("10. التعديلات على هذه السياسة", "10. Changes to This Policy")}</h2>
      {appLang === "en" ? (
        <p>
          We may update this policy to reflect changes in our practices or in the law. We will notify you of material
          changes by email 30 days before they take effect. Minor technical changes are published immediately.
        </p>
      ) : (
        <p>
          قد نُحدِّث السياسة لتعكس التغييرات فى ممارساتنا أو القانون. سنُخطرك بالتعديلات الجوهرية قبل سريانها
          بـ 30 يوماً عبر البريد الإلكترونى. التعديلات الفنية البسيطة تُنشر مباشرة.
        </p>
      )}

      <h2>{t("11. مسؤول حماية البيانات (DPO)", "11. Data Protection Officer (DPO)")}</h2>
      {appLang === "en" ? (
        <p>
          To contact our Data Protection Officer:{" "}
          <a href="mailto:dpo@7esab.com">dpo@7esab.com</a>
        </p>
      ) : (
        <p>
          للتواصل مع مسؤول حماية البيانات لدينا:{" "}
          <a href="mailto:dpo@7esab.com">dpo@7esab.com</a>
        </p>
      )}

      <h2>{t("12. تقديم شكوى", "12. Filing a Complaint")}</h2>
      {appLang === "en" ? (
        <p>
          If you believe your data is being processed unlawfully, you have the right to file a complaint with the{" "}
          <strong>Egyptian Personal Data Protection Center</strong> or the competent authority in your country (such as
          CNIL in France, the ICO in the United Kingdom, etc.).
        </p>
      ) : (
        <p>
          إذا اعتقدت أن بياناتك تُعالج بشكل غير قانونى، يحق لك تقديم شكوى إلى{" "}
          <strong>المركز المصرى لحماية البيانات الشخصية</strong> أو الجهة المختصة فى بلدك (مثل CNIL فى فرنسا،
          ICO فى المملكة المتحدة، إلخ).
        </p>
      )}

      <p className="mt-8 text-sm text-slate-500">
        {t(
          "هذه السياسة قانونية موضوعة بعناية لكن لا تُغنى عن استشارة محامى متخصص فى حماية البيانات لشركتك تحديداً.",
          "This is a carefully drafted legal policy, but it is not a substitute for consulting a lawyer specialized in data protection for your specific company."
        )}
      </p>
    </article>
  )
}
