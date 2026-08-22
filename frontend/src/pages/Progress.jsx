import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { apiGet } from '../services/api'

export default function Progress() {
  const [searchParams] = useSearchParams()
  const studentId = searchParams.get('student') || 's0'
  const navigate = useNavigate()
  const [scans, setScans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    apiGet(`/api/students/${studentId}/scans`)
      .then(data => {
        if (!cancelled) {
          const chartData = data.slice().reverse().map((s, i) => ({
            name: `Scan ${i + 1}`,
            alignment: s.alignment,
            spacing: s.spacing,
            curves: s.curves,
          }))
          setScans(chartData)
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.detail || err.message || 'Failed to load progress')
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [studentId])

  return (
    <div className="max-w-4xl mx-auto p-6 animate-fade">
      <button onClick={() => navigate('/home')} className="back-link mb-4">← Back</button>
      <h1 className="text-3xl font-bold mb-1">Progress Chart</h1>
      <p className="text-ink-soft mb-6">Track improvement across scans over time.</p>

      {loading ? (
        <div className="card text-center py-12">
          <div className="w-12 h-12 border-4 border-lavender border-t-indigo rounded-full animate-spin-slow mx-auto mb-4"></div>
          <p className="text-ink-soft">Loading progress...</p>
        </div>
      ) : error ? (
        <div className="card text-center py-12">
          <p className="text-ink-soft mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="btn btn-primary">Retry</button>
        </div>
      ) : scans.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-ink-soft mb-4">No scans yet. Complete a scan to see progress.</p>
          <button onClick={() => navigate(`/scan?student=${studentId}`)} className="btn btn-primary">Scan a Worksheet</button>
        </div>
      ) : (
        <div className="card">
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={scans}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E2F5" />
              <XAxis dataKey="name" stroke="#5B5478" />
              <YAxis domain={[0, 100]} stroke="#5B5478" />
              <Tooltip
                contentStyle={{ borderRadius: '14px', border: '1px solid #E5E2F5' }}
                labelStyle={{ fontWeight: 'bold' }}
              />
              <Line type="monotone" dataKey="alignment" stroke="#4F46E5" strokeWidth={3} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="spacing" stroke="#3B82F6" strokeWidth={3} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="curves" stroke="#34D399" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex gap-6 mt-4 justify-center text-sm font-semibold text-ink-soft">
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-indigo inline-block"></span> Alignment</span>
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block"></span> Spacing</span>
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-mint inline-block"></span> Curves</span>
          </div>
        </div>
      )}
    </div>
  )
}
