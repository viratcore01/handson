import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiGet, apiPatch } from '../services/api'

export default function StudentProfile() {
  const { studentId } = useParams()
  const navigate = useNavigate()
  const [student, setStudent] = useState(null)
  const [scans, setScans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [overrideValues, setOverrideValues] = useState({ alignment: '', spacing: '', curves: '' })
  const [saving, setSaving] = useState(null) // scan ID being saved

  const fetchStudent = () => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      apiGet(`/api/students/${studentId}`),
      apiGet(`/api/students/${studentId}/scans`),
    ]).then(([studentData, scansData]) => {
      if (!cancelled) {
        setStudent(studentData)
        setScans(scansData)
        setLoading(false)
      }
    }).catch(err => {
      if (!cancelled) {
        setError(err.detail || err.message || 'Failed to load student profile')
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }

  useEffect(() => fetchStudent(), [studentId])

  const handleOverride = async (scanId) => {
    const body = {}
    if (overrideValues.alignment !== '') body.alignment = parseInt(overrideValues.alignment)
    if (overrideValues.spacing !== '') body.spacing = parseInt(overrideValues.spacing)
    if (overrideValues.curves !== '') body.curves = parseInt(overrideValues.curves)
    if (Object.keys(body).length === 0) return

    setSaving(scanId)
    try {
      await apiPatch(`/api/scans/${scanId}`, body)
      // Update the scan in-place without full reload
      const updatedScan = await apiGet(`/api/scans/${scanId}`)
      setScans(prev => prev.map(s => s.id === scanId ? { ...s, ...updatedScan } : s))
      setOverrideValues({ alignment: '', spacing: '', curves: '' })
    } catch (err) {
      alert(err.detail || err.message || 'Failed to save override')
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-6 animate-fade text-center py-20">
        <div className="w-12 h-12 border-4 border-lavender border-t-indigo rounded-full animate-spin-slow mx-auto mb-4"></div>
        <p className="text-ink-soft">Loading profile...</p>
      </div>
    )
  }

  if (error || !student) {
    return (
      <div className="max-w-3xl mx-auto p-6 animate-fade text-center py-20">
        <p className="text-ink-soft mb-4">{error || 'Student not found.'}</p>
        <button onClick={() => navigate('/teacher')} className="btn btn-primary">Back to Dashboard</button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6 animate-fade">
      <button onClick={() => navigate('/teacher')} className="back-link mb-4">← Back to dashboard</button>

      <div className="card mb-6">
        <h1 className="text-3xl font-bold mb-1">{student.name}</h1>
        <p className="text-ink-soft">Total scans: {scans.length}</p>
      </div>

      {scans.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-ink-soft">No scans yet for this student.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {scans.map(scan => (
            <div key={scan.id} className="card">
              <div className="flex flex-wrap gap-4 mb-3">
                {[
                  { label: 'Alignment', val: scan.alignment },
                  { label: 'Spacing', val: scan.spacing },
                  { label: 'Curves', val: scan.curves },
                ].map(s => (
                  <div key={s.label} className="flex-1 min-w-[140px]">
                    <div className="text-xs font-bold text-ink-soft uppercase mb-1">{s.label}</div>
                    <div className="text-xl font-bold">{s.val}/100</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mb-3">
                <p className="text-sm text-ink-soft">{new Date(scan.created_at).toLocaleString()}</p>
                {scan.teacher_confirmed && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-mint text-mint-deep">✓ Confirmed</span>
                )}
                {scan.is_fallback && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber/20 text-amber-deep">Fallback</span>
                )}
              </div>
              {scan.image_url && !scan.image_url.startsWith('data:') && (
                <img src={scan.image_url} alt="Scan" className="w-full max-h-48 object-contain rounded-xl mb-3" />
              )}

              <div className="border-t border-line pt-3 mt-3">
                <p className="text-sm font-semibold mb-2">Teacher Override</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {['alignment', 'spacing', 'curves'].map(skill => (
                    <input
                      key={skill}
                      type="number"
                      placeholder={skill.charAt(0).toUpperCase() + skill.slice(1)}
                      min="0"
                      max="100"
                      value={overrideValues[skill]}
                      onChange={e => setOverrideValues({ ...overrideValues, [skill]: e.target.value })}
                      className="w-24 p-2 rounded-lg border-2 border-line text-sm"
                    />
                  ))}
                </div>
                <button
                  onClick={() => handleOverride(scan.id)}
                  disabled={saving === scan.id || Object.values(overrideValues).every(v => v === '')}
                  className="btn btn-mint text-sm py-2 px-4"
                >
                  {saving === scan.id ? 'Saving...' : 'Save Override'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
