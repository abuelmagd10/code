import { createClient } from '@/lib/supabase/server'

async function getAdminStats() {
  const supabase = await createClient()

  const [companies, jobs, errors, subs, logs] = await Promise.all([
    supabase.from('companies').select('id', { count: 'exact', head: true }),
    supabase.from('jobs_queue').select('status').in('status', ['pending', 'failed']),
    supabase.from('system_logs').select('id', { count: 'exact', head: true })
      .eq('level', 'error')
      .gte('created_at', new Date(Date.now() - 86400000).toISOString()),
    supabase.from('subscriptions').select('plan_id, status'),
    supabase.from('system_logs').select('route, duration_ms')
      .gt('duration_ms', 500)
      .gte('created_at', new Date(Date.now() - 3600000).toISOString())
      .limit(5),
  ])

  const jobRows = jobs.data ?? []
  const subRows = subs.data ?? []

  return {
    totalCompanies: companies.count ?? 0,
    pendingJobs: jobRows.filter(j => j.status === 'pending').length,
    failedJobs: jobRows.filter(j => j.status === 'failed').length,
    errors24h: errors.count ?? 0,
    activeSubscriptions: subRows.filter(s => ['trial', 'active'].includes(s.status)).length,
    planBreakdown: {
      trial: subRows.filter(s => s.plan_id === 'trial').length,
      basic: subRows.filter(s => s.plan_id === 'basic').length,
      pro: subRows.filter(s => s.plan_id === 'pro').length,
      enterprise: subRows.filter(s => s.plan_id === 'enterprise').length,
    },
    slowRoutes: logs.data ?? [],
  }
}

export default async function SaasAdminDashboard() {
  const stats = await getAdminStats()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">System Dashboard</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Companies', value: stats.totalCompanies, color: 'indigo' },
          { label: 'Active Subscriptions', value: stats.activeSubscriptions, color: 'green' },
          { label: 'Pending Jobs', value: stats.pendingJobs, color: 'yellow' },
          { label: 'Errors (24h)', value: stats.errors24h, color: stats.errors24h > 0 ? 'red' : 'green' },
        ].map(card => (
          <div key={card.label} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="text-gray-400 text-xs mb-1">{card.label}</div>
            <div className={`text-3xl font-bold text-${card.color}-400`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Plan Breakdown */}
      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h2 className="font-semibold mb-3 text-gray-300">Subscription Plans</h2>
        <div className="grid grid-cols-4 gap-3 text-center">
          {Object.entries(stats.planBreakdown).map(([plan, count]) => (
            <div key={plan} className="bg-gray-700 rounded-lg p-3">
              <div className="capitalize text-gray-400 text-xs">{plan}</div>
              <div className="text-xl font-bold text-white">{count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Failed Jobs Alert */}
      {stats.failedJobs > 0 && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 flex items-center gap-3">
          <span className="text-red-400 text-xl">⚠️</span>
          <div>
            <div className="font-semibold text-red-300">{stats.failedJobs} failed job(s)</div>
            <a href="/saas-admin/jobs" className="text-sm text-red-400 hover:underline">View & retry →</a>
          </div>
        </div>
      )}

      {/* Slow Routes */}
      {stats.slowRoutes.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h2 className="font-semibold mb-3 text-yellow-400">⚡ Slow API Routes (last hour)</h2>
          <div className="space-y-1">
            {stats.slowRoutes.map((r: any, i: number) => (
              <div key={i} className="flex justify-between text-sm text-gray-300">
                <span className="font-mono">{r.route}</span>
                <span className="text-yellow-400">{r.duration_ms}ms</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
