import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"

export default function SignUpSuccessPage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 md:p-10 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800">
      <div className="w-full max-w-sm">
        <Card className="shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center text-green-600">تم إنشاء الحساب بنجاح</CardTitle>
            <CardDescription className="text-center">تم إرسال رابط التأكيد إلى بريدك الإلكتروني</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              يرجى التحقق من بريدك الإلكتروني وتأكيد حسابك. قد يستغرق وصول البريد بعض الدقائق.
            </p>
            <Link href="/auth/login" className="block">
              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition">
                العودة لتسجيل الدخول
              </button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
