import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            نظام 7ESAB ERP
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            نظام إدارة موارد المؤسسات الشامل - إدارة المحاسبة والمخزون والمبيعات والمشتريات
          </p>
          <div className="space-x-4 space-x-reverse">
            <Button asChild size="lg">
              <Link href="/auth/login">دخول</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/auth/sign-up">إنشاء حساب</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
