import { createClient } from '@/lib/supabase/server'

export default async function AdminCompaniesPage() {
  const supabase = await createClient()

  const { data: companies } = await supabase
    .from('companies')
    .select(`
      id, name, created_at,
      subscriptions(plan_id, status, trial_ends_at)
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Companies</h1>
      <div className="text-sm text-gray-400">{companies?.length ?? 0} companies</div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-700/50 text-gray-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Company</th>
              <th className="px-4 py-3 text-left">Plan</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Trial Ends</th>
              <th className="px-4 py-3 text-left">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {(companies ?? []).map((c: any) => {
              const sub = Array.isArray(c.subscriptions) ? c.subscriptions[0] : c.subscriptions
              return (
                <tr key={c.id} className="hover:bg-gray-700/30">
                  <td className="px-4 py-3 font-medium text-white">{c.name}</td>
                  <td className="px-4 py-3 text-indigo-300 capitalize">{sub?.plan_id ?? 'none'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      sub?.status === 'active' ? 'bg-green-900/50 text-green-300' :
                      sub?.status === 'trial' ? 'bg-yellow-900/50 text-yellow-300' :
                      'bg-gray-700 text-gray-400'
                    }`}>
                      {sub?.status ?? 'no subscription'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {sub?.trial_ends_at ? new Date(sub.trial_ends_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
