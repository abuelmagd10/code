import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = (process.env.SAAS_ADMIN_EMAILS ?? '').split(',').map(e => e.trim()).filter(Boolean)

export default async function SaasAdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    redirect('/')
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="border-b border-gray-800 bg-gray-900 px-6 py-3 flex items-center gap-6">
        <span className="font-bold text-indigo-400 text-lg">⚙️ SaaS Admin</span>
        <a href="/saas-admin" className="text-sm text-gray-300 hover:text-white">Dashboard</a>
        <a href="/saas-admin/companies" className="text-sm text-gray-300 hover:text-white">Companies</a>
        <a href="/saas-admin/subscriptions" className="text-sm text-gray-300 hover:text-white">Subscriptions</a>
        <a href="/saas-admin/jobs" className="text-sm text-gray-300 hover:text-white">Jobs Queue</a>
        <a href="/saas-admin/audit-logs" className="text-sm text-gray-300 hover:text-white">Audit Logs</a>
        <div className="ml-auto text-xs text-gray-500">{user.email}</div>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  )
}
