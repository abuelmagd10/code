import { createClient } from '@/lib/supabase/server'

export default async function AdminAuditLogsPage() {
  const supabase = await createClient()

  const { data: logs } = await supabase
    .from('audit_logs')
    .select('id, action, target_table, record_identifier, user_name, user_email, company_id, branch_id, reason, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  const actionColor: Record<string, string> = {
    INSERT: 'text-green-400',
    UPDATE: 'text-blue-400',
    DELETE: 'text-red-400',
    APPROVE: 'text-indigo-400',
    REJECT: 'text-orange-400',
    CANCEL: 'text-yellow-400',
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Audit Logs</h1>
      <div className="text-sm text-gray-400">Last 200 entries across all companies</div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-700/50 text-gray-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Action</th>
              <th className="px-4 py-3 text-left">Table</th>
              <th className="px-4 py-3 text-left">Record</th>
              <th className="px-4 py-3 text-left">User</th>
              <th className="px-4 py-3 text-left">Reason</th>
              <th className="px-4 py-3 text-left">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {(logs ?? []).map(log => (
              <tr key={log.id} className="hover:bg-gray-700/30">
                <td className={`px-4 py-2.5 font-mono text-xs font-bold ${actionColor[log.action] ?? 'text-gray-300'}`}>
                  {log.action}
                </td>
                <td className="px-4 py-2.5 text-gray-400 text-xs font-mono">{log.target_table}</td>
                <td className="px-4 py-2.5 text-gray-300 text-xs">{log.record_identifier ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-400 text-xs">{log.user_name ?? log.user_email ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-500 text-xs max-w-xs truncate">{log.reason ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-600 text-xs">
                  {new Date(log.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
