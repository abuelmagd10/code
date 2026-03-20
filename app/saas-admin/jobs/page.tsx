import { createClient } from '@/lib/supabase/server'

export default async function AdminJobsPage() {
  const supabase = await createClient()

  const { data: jobs } = await supabase
    .from('jobs_queue')
    .select('*')
    .in('status', ['pending', 'processing', 'failed'])
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(100)

  const statusColor: Record<string, string> = {
    pending: 'text-yellow-400',
    processing: 'text-blue-400',
    failed: 'text-red-400',
    completed: 'text-green-400',
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Jobs Queue Monitor</h1>
      <div className="text-sm text-gray-400">{jobs?.length ?? 0} active/failed jobs</div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-700/50 text-gray-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Priority</th>
              <th className="px-4 py-3 text-left">Attempts</th>
              <th className="px-4 py-3 text-left">Error</th>
              <th className="px-4 py-3 text-left">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {(jobs ?? []).map(job => (
              <tr key={job.id} className="hover:bg-gray-700/30">
                <td className="px-4 py-3 font-mono text-xs text-indigo-300">{job.job_type}</td>
                <td className={`px-4 py-3 font-semibold ${statusColor[job.status] ?? 'text-gray-300'}`}>
                  {job.status}
                </td>
                <td className="px-4 py-3 text-gray-300">{job.priority}</td>
                <td className="px-4 py-3 text-gray-300">{job.attempts}/{job.max_attempts}</td>
                <td className="px-4 py-3 text-red-400 text-xs max-w-xs truncate">{job.error ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(job.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
            {(jobs ?? []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">✅ No pending or failed jobs</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
