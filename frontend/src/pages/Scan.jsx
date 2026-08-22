import { useState, useRef, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { apiGet, apiUpload } from '../services/api'

export default function Scan() {
  const [searchParams] = useSearchParams()
  const studentId = searchParams.get('student')
  const navigate = useNavigate()
  const [students, setStudents] = useState([])
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [scanId, setScanId] = useState(null)
  const fileRef = useRef()

  // Fetch students for the dropdown
  useEffect(() => {
    apiGet('/api/students')
      .then(data => setStudents(data))
      .catch(() => {
        // If students fail to load, keep the dropdown functional with the current studentId
      })
  }, [])

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
    setError(null)
  }

  const handleSubmit = async () => {
    if (!preview || !studentId) return
    setLoading(true)
    setError(null)
    try {
      const blob = await fetch(preview).then(r => r.blob())
      const file = new File([blob], 'worksheet.jpg', { type: blob.type || 'image/jpeg' })

      const data = await apiUpload(`/api/scans?student_id=${studentId}`, file)
      setScanId(data.id)
      navigate(`/results/${data.id}`)
    } catch (err) {
      setError(err.detail || err.message || 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  if (scanId) {
    return (
      <div className="max-w-2xl mx-auto p-6 animate-fade text-center py-20">
        <div className="w-16 h-16 border-4 border-lavender border-t-indigo rounded-full animate-spin-slow mx-auto mb-6"></div>
        <h2 className="text-2xl font-bold mb-2">Analyzing your worksheet...</h2>
        <p className="text-ink-soft">This usually takes a few seconds.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6 animate-fade">
      <button onClick={() => navigate('/home')} className="back-link mb-4">← Back to home</button>
      <h1 className="text-3xl font-bold mb-1">Scan Worksheet</h1>
      <p className="text-ink-soft mb-6">Take a clear photo of a completed handwriting worksheet.</p>

      <div className="card mb-6">
        <label className="block text-sm font-semibold text-ink-soft mb-2">Student</label>
        <select
          value={studentId || ''}
          onChange={e => navigate(`/scan?student=${e.target.value}`)}
          className="w-full p-3 rounded-xl border-2 border-line bg-surface text-ink font-semibold focus:border-indigo focus:outline-none mb-4"
        >
          {students.length === 0 && studentId && (
            <option value={studentId}>Loading students...</option>
          )}
          {students.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-indigo/40 rounded-2xl p-10 text-center cursor-pointer hover:bg-lavender/30 transition-colors"
        >
          {preview ? (
            <img src={preview} alt="Preview" className="max-h-80 mx-auto rounded-xl" />
          ) : (
            <div>
              <div className="text-5xl mb-3">📷</div>
              <p className="font-semibold text-ink mb-1">Tap to take a photo</p>
              <p className="text-sm text-ink-soft">Use your camera to photograph the worksheet</p>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
            className="hidden"
          />
        </div>
      </div>

      {error && (
        <div className="bg-amber/10 border border-amber text-amber-deep p-4 rounded-2xl mb-4 font-semibold text-center">
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!preview || !studentId || loading}
        className="btn btn-primary btn-block"
      >
        {loading ? 'Analyzing...' : 'Analyze Worksheet'}
      </button>
    </div>
  )
}
