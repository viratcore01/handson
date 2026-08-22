import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiGet, apiPost, apiDownload } from '../services/api'

const SKILL_META = {
  alignment: { label: 'Baseline Alignment', child: 'How level the writing sits on the rule line' },
  spacing:   { label: 'Letter & Word Spacing', child: 'Consistent gaps between letters and words' },
  curves:    { label: 'Curve Smoothness', child: 'How smooth curved strokes are on rounded letters' },
}

const SHAPE_FAMILIES = {
  alignment: { title: 'Straight Lines Family', blurb: 'Focuses on level baseline control and steady stroke rhythm.' },
  spacing:   { title: 'Sharp Zig-Zags Family', blurb: 'Focuses on direction turns and angle accuracy.' },
  curves:    { title: 'Counter-Clockwise Curves Family', blurb: 'Focuses on smooth left-turning continuous curves.' },
}

function getWeakestAndStrongest(scores) {
  if (!scores || Object.keys(scores).length === 0) {
    return { weakest: 'alignment', strongest: 'curves' }
  }
  const entries = Object.entries(scores).filter(([, v]) => v != null && v > 0)
  if (entries.length === 0) return { weakest: 'alignment', strongest: 'curves' }
  entries.sort((a, b) => a[1] - b[1])
  return { weakest: entries[0][0], strongest: entries[entries.length - 1][0] }
}

export default function ParentView() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const studentId = searchParams.get('student') || 's0'
  const [students, setStudents] = useState([])
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    let cancelled = false

    // Load students for selector
    apiGet('/api/students').then(s => { if (!cancelled) setStudents(s) }).catch(() => {})

    setLoading(true)
    apiGet(`/api/students/${studentId}/report`)
      .then(data => {
        if (!cancelled) {
          setReport(data)
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.detail || err.message || 'Failed to load report')
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [studentId])

  const handleDownloadReport = async () => {
    setDownloading(true)
    try {
      await apiDownload(`/api/students/${studentId}/report/pdf`, `${studentId}_report.pdf`)
    } catch (err) {
      alert(err.detail || err.message || 'Failed to download report')
    } finally {
      setDownloading(false)
    }
  }

  const handleGenerateReport = async () => {
    try {
      const data = await apiPost('/api/reports/generate', { student_id: studentId })
      if (data.url) {
        window.open(data.url, '_blank')
      }
    } catch (err) {
      alert(err.detail || err.message || 'Failed to generate report')
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6 animate-fade text-center py-20">
        <div className="w-12 h-12 border-4 border-lavender border-t-indigo rounded-full animate-spin-slow mx-auto mb-4"></div>
        <p className="text-ink-soft">Loading report...</p>
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="max-w-2xl mx-auto p-6 animate-fade text-center py-20">
        <p className="text-ink-soft mb-4">{error || 'No report data available.'}</p>
        <button onClick={() => navigate('/home')} className="btn btn-primary">Go Home</button>
      </div>
    )
  }

  const studentName = report.student_name || 'Student'
  const { weakest, strongest } = getWeakestAndStrongest(report.latest_scores)

  return (
    <div className="max-w-2xl mx-auto p-6 animate-fade">
      <button onClick={() => navigate('/home')} className="back-link mb-4">← Back to home</button>

      {/* Student selector */}
      {students.length > 1 && (
        <div className="card mb-4">
          <label className="block text-sm font-semibold text-ink-soft mb-2">Select Student</label>
          <select
            value={studentId}
            onChange={e => navigate(`/parent?student=${e.target.value}`)}
            className="w-full p-3 rounded-xl border-2 border-line bg-surface text-ink font-semibold focus:border-indigo focus:outline-none"
          >
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="card print-area">
        <div className="eyebrow mb-2">Simple Summary</div>
        <h2 className="text-2xl font-bold mb-1">How {studentName} is doing</h2>
        <p className="text-ink-soft text-sm mb-5">
          Based on {report.total_scans} scan{report.total_scans !== 1 ? 's' : ''} — no clinical scores, just what's working and what to try next.
        </p>

        {report.total_scans === 0 ? (
          <div className="text-center py-6">
            <p className="text-ink-soft mb-3">No scan data yet for this student.</p>
            <p className="text-ink-soft text-sm">Scan a worksheet to start tracking progress.</p>
          </div>
        ) : (
          <div className="stack">
            <div className="tip-card">
              <div className="tip-num">👍</div>
              <div>
                <strong>Going well:</strong> {SKILL_META[strongest]?.child || SKILL_META.curves.child}. Keep noticing and praising this out loud.
                {report.latest_scores[strongest] != null && (
                  <span className="block text-sm text-ink-soft mt-1">Score: {report.latest_scores[strongest]}/100</span>
                )}
              </div>
            </div>
            <div className="tip-card">
              <div className="tip-num">🎯</div>
              <div>
                <strong>Worth a little practice:</strong> {SKILL_META[weakest]?.child || SKILL_META.alignment.child}. A few short, playful minutes a few times a week is plenty.
                {report.latest_scores[weakest] != null && (
                  <span className="block text-sm text-ink-soft mt-1">Score: {report.latest_scores[weakest]}/100</span>
                )}
              </div>
            </div>
            <div className="tip-card">
              <div className="tip-num">💡</div>
              <div>
                <strong>Try this:</strong> A few minutes of {(SHAPE_FAMILIES[weakest]?.title || SHAPE_FAMILIES.alignment.title).toLowerCase()} tracing.
              </div>
            </div>
          </div>
        )}

        <div className="safety-strip mt-5" style={{ background: 'var(--lavender)', padding: '14px 18px', borderRadius: '14px', fontSize: '13px', color: 'var(--ink-soft)', lineHeight: 1.6 }}>
          This is a practice-support summary, not a medical or educational diagnosis. If you have questions, your classroom teacher is always the best contact.
        </div>

        <div className="flex gap-3 mt-4 no-print">
          <button onClick={() => window.print()} className="btn btn-ghost flex-1">Print Summary</button>
          <button onClick={handleDownloadReport} disabled={downloading} className="btn btn-primary flex-1">
            {downloading ? 'Generating...' : 'Download PDF Report'}
          </button>
        </div>
      </div>
    </div>
  )
}
