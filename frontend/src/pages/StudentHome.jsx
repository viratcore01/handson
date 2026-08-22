import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiGet } from '../services/api'

export default function StudentHome() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const studentId = searchParams.get('student')
  const [students, setStudents] = useState([])
  const [selectedStudent, setSelectedStudent] = useState(studentId || '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    apiGet('/api/students')
      .then(data => {
        if (!cancelled) {
          setStudents(data)
          // If no student selected via query param, pick the first one
          if (!studentId && data.length > 0) {
            setSelectedStudent(data[0].id)
          }
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.detail || err.message || 'Failed to load students')
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [])

  const student = students.find(s => s.id === selectedStudent) || { name: 'Student' }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6 animate-fade">
        <div className="student-hero-card text-center py-12">
          <div className="w-12 h-12 border-4 border-lavender border-t-indigo rounded-full animate-spin-slow mx-auto mb-4"></div>
          <p className="text-ink-soft">Loading students...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6 animate-fade">
        <div className="student-hero-card text-center py-12">
          <p className="text-ink-soft mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="btn btn-primary">Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6 animate-fade">
      <div className="student-hero-card">
        <div className="avatar-row">
          <div className="student-avatar">👦</div>
          <div>
            <div className="streak-pill">🔥 3-Day Practice Streak</div>
            <h2 style={{ margin: '6px 0 2px' }}>Welcome back, {student.name}!</h2>
            <p className="muted" style={{ margin: 0, fontSize: '14px' }}>Last session: Kept good size and rhythm</p>
          </div>
        </div>

        <div className="main-btn-grid">
          <button onClick={() => navigate(`/scan?student=${selectedStudent}`)} className="big-action-btn primary">
            <span className="tag" style={{ background: 'rgba(255,255,255,0.25)', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, display: 'inline-block' }}>Main Path</span>
            <h3>📷 Scan Worksheet</h3>
            <p>Take a photo of a paper worksheet to get instant scores and feedback.</p>
          </button>

          <button onClick={() => navigate(`/games?student=${selectedStudent}`)} className="big-action-btn secondary">
            <span className="tag" style={{ background: 'rgba(4,56,42,0.15)', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, display: 'inline-block' }}>Exercise</span>
            <h3>🎮 Live Practice Games</h3>
            <p>Play 5 tracing games with real-time coaching.</p>
          </button>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-semibold text-ink-soft mb-2">Select Student</label>
          <select
            value={selectedStudent}
            onChange={e => setSelectedStudent(e.target.value)}
            className="w-full p-3 rounded-xl border-2 border-line bg-surface text-ink font-semibold focus:border-indigo focus:outline-none"
          >
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
