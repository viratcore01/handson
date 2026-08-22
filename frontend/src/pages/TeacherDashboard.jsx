import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet } from '../services/api'

export default function TeacherDashboard() {
  const [heatmap, setHeatmap] = useState([])
  const [commonWeaknesses, setCommonWeaknesses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false

    apiGet('/api/students')
      .then(async (students) => {
        if (cancelled) return
        if (!students || students.length === 0) {
          setHeatmap([])
          setLoading(false)
          return
        }
        const classId = students[0].classroom_id
        const data = await apiGet(`/api/classes/${classId}/heatmap`)
        if (!cancelled) {
          // API returns {students: [...], common_weaknesses: [...]}
          setHeatmap(data.students || data)
          setCommonWeaknesses(data.common_weaknesses || [])
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.detail || err.message || 'Failed to load class data')
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [])

  const getScoreColor = (score) => {
    if (score == null) return 'bg-gray-100 text-gray-500'
    if (score >= 75) return 'bg-mint text-mint-deep'
    return 'bg-amber/20 text-amber-deep'
  }

  const getWeaknessLabel = (skill) => {
    const labels = { alignment: 'Baseline Alignment', spacing: 'Letter Spacing', curves: 'Curve Smoothness' }
    return labels[skill] || skill
  }

  return (
    <div className="max-w-5xl mx-auto p-6 animate-fade">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-1">Teacher Dashboard</h1>
          <p className="text-ink-soft">Class heatmap and latest scan scores.</p>
        </div>
        <button onClick={() => navigate('/home')} className="btn btn-ghost">Student View</button>
      </div>

      {loading ? (
        <div className="card text-center py-12">
          <div className="w-12 h-12 border-4 border-lavender border-t-indigo rounded-full animate-spin-slow mx-auto mb-4"></div>
          <p className="text-ink-soft">Loading class data...</p>
        </div>
      ) : error ? (
        <div className="card text-center py-12">
          <p className="text-ink-soft mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="btn btn-primary">Retry</button>
        </div>
      ) : (
        <>
          {/* Common Weaknesses Summary */}
          {commonWeaknesses.length > 0 && (
            <div className="card mb-6 bg-lavender/30">
              <div className="eyebrow mb-2">Class-Wide Patterns</div>
              <div className="flex flex-wrap gap-3">
                {commonWeaknesses.map((w, i) => (
                  <span key={w.skill} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-line text-sm font-semibold">
                    <span className="text-amber-deep">🎯</span>
                    {getWeaknessLabel(w.skill)}
                    <span className="text-ink-soft">({w.count} student{w.count !== 1 ? 's' : ''})</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Student Heatmap Table */}
          <div className="card overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-ink-soft text-xs uppercase tracking-wider">
                  <th className="pb-3 pl-3 font-bold">Student</th>
                  <th className="pb-3 font-bold">Alignment</th>
                  <th className="pb-3 font-bold">Spacing</th>
                  <th className="pb-3 font-bold">Curves</th>
                  <th className="pb-3 font-bold">Last Scan</th>
                </tr>
              </thead>
              <tbody>
                {heatmap.map(row => (
                  <tr
                    key={row.student_id}
                    onClick={() => navigate(`/student/${row.student_id}`)}
                    className="cursor-pointer hover:bg-lavender/30 transition-colors"
                  >
                    <td className="py-3 pl-3 font-semibold">{row.student_name}</td>
                    <td className="py-3">
                      <span className={`heat-pill px-3 py-1 rounded-lg text-sm font-bold ${getScoreColor(row.latest_scan?.alignment)}`}>
                        {row.latest_scan?.alignment ?? '—'}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`heat-pill px-3 py-1 rounded-lg text-sm font-bold ${getScoreColor(row.latest_scan?.spacing)}`}>
                        {row.latest_scan?.spacing ?? '—'}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`heat-pill px-3 py-1 rounded-lg text-sm font-bold ${getScoreColor(row.latest_scan?.curves)}`}>
                        {row.latest_scan?.curves ?? '—'}
                      </span>
                    </td>
                    <td className="py-3 text-ink-soft text-sm">
                      {row.latest_scan?.created_at ? new Date(row.latest_scan.created_at).toLocaleDateString() : 'No scans'}
                    </td>
                  </tr>
                ))}
                {heatmap.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-ink-soft">No students in this class yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
