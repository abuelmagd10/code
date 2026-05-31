import type { Metadata } from "next"
import Link from "next/link"
import { BlogPostLayout } from "@/components/blog/BlogPostLayout"
import { getPostBySlug } from "@/lib/blog-posts"

const SLUG = "best-arabic-accounting-software-egypt-2026"
const post = getPostBySlug(SLUG)!

export const metadata: Metadata = {
  title: post.title,
  description: post.excerpt,
  openGraph: {
    title: post.title,
    description: post.excerpt,
    url: `https://7esab.com/blog/${SLUG}`,
    type: "article",
    publishedTime: post.publishedAt,
    locale: "ar_EG",
  },
  alternates: { canonical: `https://7esab.com/blog/${SLUG}` },
}

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            description: post.excerpt,
            datePublished: post.publishedAt,
            author: { "@type": "Organization", name: "7esab.com" },
            publisher: { "@type": "Organization", name: "7esab.com", logo: { "@type": "ImageObject", url: "https://7esab.com/icons/icon-512x512.png" } },
            mainEntityOfPage: `https://7esab.com/blog/${SLUG}`,
          }),
        }}
      />
      <BlogPostLayout post={post}>
        <p><strong>قبل أن نَبدأ، إقرار للأمانة:</strong> أنا مُؤسِّس 7esab.com، وسأَذكر منتجى فى هذا المقال. لكنى سأَذكر البدائل أيضاً بنفس النِّزاهة، وأَنصَحك بأَى منها إذا كان أَنسب لِعملك. هَدفى أن تَخرج من هذه القراءة بقرار صَحيح، لا بـ تَسويق مُقَنَّع.</p>

        <h2>ما تَحتاجه فعلاً من برنامج محاسبة فى 2026</h2>
        <p>قَبل المُقارنة، حَدِّد أنت أولاً ما تَحتاجه. أَخطر خَطأ يَقع فيه أصحاب المنشآت أَنهم يَختارون "الأَقوى" بدلاً من "الأَنسب لحالتى":</p>
        <ul>
          <li><strong>إذا عَدد موظفيك ≤ 3:</strong> تَحتاج فواتير + مَخزون بسيط + تَقارير شهرية. لا تَحتاج ERP كامل.</li>
          <li><strong>إذا 4-20 موظف:</strong> تَحتاج صَلاحيات أَدوار + فروع + موافقات + Audit log. هنا يَبدأ الـ ERP يَكون منطقياً.</li>
          <li><strong>إذا أكثر من 20:</strong> تَحتاج تَخصيص عميق + integration مع أنظمة أخرى + دعم مُخصَّص. ميزانيتك تَكبر.</li>
        </ul>

        <h2>الخيارات المُتاحة فى السوق المصرى</h2>

        <h3>1. Excel / Google Sheets</h3>
        <p><strong>المُناسب لـ:</strong> أَول 1-2 سنة، حتى تَتَّضح عملياتك. <strong>المُكلفة:</strong> 0 ج.م مَجَّاناً. <strong>المُشكلة:</strong> يَنكسر تماماً عند مُعاملات متَزامنة، عدة موظفين، أو شركة بفروع. (سَنَتَكلَّم فى مقال آخر عن كيفية الهجرة منه بأمان.)</p>

        <h3>2. الحدُّوتة</h3>
        <p>برنامج مصرى مَعروف لأكثر من 20 سنة. <strong>المُناسب لـ:</strong> مَن يُريد تَثبيتاً مَحلِّياً (offline). <strong>السعر:</strong> رخصة لمرة واحدة من 3,000-15,000 ج.م. <strong>الإيجابيات:</strong> قَوى فى المُخازن والمَحاسبة التَّقليدية. <strong>السَّلبيات:</strong> واجهة قَديمة، لا توجد نسخة سحابية حقيقية، صَعب الوصول من خارج المكتب، لا توجد API للتَّكامل مع المتاجر الإلكترونية.</p>

        <h3>3. Onyx Pro</h3>
        <p>مصرى مَعروف أيضاً. <strong>المُناسب لـ:</strong> الشركات المُتَوسِّطة التى تَحتاج تَخصيصاً عميقاً. <strong>السعر:</strong> رخصة من 8,000-30,000 ج.م لمرة واحدة، أو اشتراك سَنوى. <strong>الإيجابيات:</strong> مُحاسبة قَوية، تَقارير مَرنة. <strong>السَّلبيات:</strong> تَحتاج خَبيراً للإعداد، الواجهة Windows-only أساساً، دعم العَمل عن بُعد ضَعيف.</p>

        <h3>4. Zoho Books / QuickBooks</h3>
        <p>عالمى السَّحابى. <strong>المُناسب لـ:</strong> مَن لديه فريق بالإنجليزية. <strong>السعر:</strong> $10-50/شهر مما يُعادل 500-2500 ج.م. <strong>الإيجابيات:</strong> واجهة عَصرية، API ممتاز. <strong>السَّلبيات:</strong> اللغة العربية ضَعيفة أو غير مَوجودة، لا يَدعم VAT المصرية بشكل أصلى، يَجب أن تَدفع بـ الدُّولار (تَقلُّبات سعر الصَّرف)، الفواتير لا تَتَّبع الشكل المُعتَمد من مَصلحة الضَّرائب.</p>

        <h3>5. 7esab.com (هذا الذى أَبنيه)</h3>
        <p><strong>المُناسب لـ:</strong> الشركات الصغيرة والمتوسطة المصرية التى تُريد سحابياً عربياً ولا تُريد دَفع رواتب IT. <strong>السعر:</strong> مستخدم واحد مجانى للأبد، 500 ج.م/مستخدم إضافى/شهر. <strong>الإيجابيات:</strong> عربى أصلى (RTL)، VAT 14% مصرية مَدمَجة، دفع بـ Paymob/فيزا/مَحفظة، تَعدُّد عملات IAS 21، نَسخ احتياطية يومية تلقائية مُشَفَّرة، AI assistant داخلى. <strong>السَّلبيات الصَّريحة:</strong> جديد (إطلاق 2026)، لا توجد سُمعة بَعد. هذا حقيقة لا أُخفيها — أَعرض على أوَّل 20 عميل خَصم 30% دائم وخَطَّ دعم مباشر معى عبر WhatsApp مُقابل المُخاطرة.</p>

        <h2>أسئلة تَسأل نَفسك قَبل القرار</h2>
        <ol>
          <li><strong>هل أَحتاج الوصول من خارج المكتب؟</strong> لو نعم → سحابى. لو لا → مُمكن offline.</li>
          <li><strong>كم عُملة أَعمل بها؟</strong> لو 1 → أى بَرنامج. لو أكثر → تأكَّد أنه يَدعم IAS 21 كاملاً وليس مُجرَّد عَرض السعر.</li>
          <li><strong>هل سأَتكامل مع متجر إلكترونى أو نظام نقطة بيع؟</strong> لو نعم → اطلب API documentation قَبل الدَّفع.</li>
          <li><strong>كم سيُكلِّفنى التَّعليم والإعداد؟</strong> رخصة 10,000 ج.م قد تَحتاج 15,000 إضافية لمُستَشار. اشتراك 500 ج.م بدون تَكلفة إعداد قد يَكون أَوفر طويل الأَجل.</li>
          <li><strong>ماذا يَحدث لبياناتى لو أَلغيت؟</strong> اطلب export كامل قَبل الاشتراك. لو الإجابة "غير مُتاح" → ابتَعِد.</li>
        </ol>

        <h2>ختاماً — نَصيحتى الصَّادقة</h2>
        <p>لو بدأت اليوم، أَنصَحك بـ:</p>
        <ul>
          <li><strong>≤ 3 موظفين، ميزانية مَحدودة جداً:</strong> Excel + نَموذج فاتورة جاهز.</li>
          <li><strong>4-20 موظف، تُريد سحابى عربى:</strong> جَرِّب 7esab.com مَجَّاناً لمدة شهر. لو لم يُناسبك، ادفع لـ Onyx Pro.</li>
          <li><strong>عملياتك مُعقَّدة جداً ومخصصة:</strong> Odoo (open source، يَحتاج مُطوِّر).</li>
          <li><strong>تَحتاج offline تماماً:</strong> الحدُّوتة أو Onyx Pro.</li>
        </ul>
        <p>أَى سؤال؟ راسلنى مُباشرة على <a href="mailto:info@7esab.com">info@7esab.com</a> أو عبر <Link href="/contact">صفحة التَّواصل</Link>. سأَرد شَخصياً.</p>
      </BlogPostLayout>
    </>
  )
}
