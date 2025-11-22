"use client"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"

export default function HRHome() {
  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">نظام الموظفين والمرتبات</h1>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader><CardTitle>الموظفون</CardTitle></CardHeader>
              <CardContent><Link className="text-blue-600" href="/hr/employees">إدارة الموظفين</Link></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>الحضور والانصراف</CardTitle></CardHeader>
              <CardContent><Link className="text-blue-600" href="/hr/attendance">تسجيل الحضور</Link></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>المرتبات</CardTitle></CardHeader>
              <CardContent><Link className="text-blue-600" href="/hr/payroll">إدارة المرتبات</Link></CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}