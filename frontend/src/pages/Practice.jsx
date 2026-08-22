import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { apiGet, apiDownload } from '../services/api'

const SKILLS = [
  { key: 'alignment', label: 'Baseline Alignment', description: 'Practice writing on the line.', family: 'lines', letters: ['E', 'F', 'H', 'I', 'L', 'T'], words: ['LINE'] },
  { key: 'spacing', label: 'Letter & Word Spacing', description: 'Practice even gaps between letters and words.', family: 'zigzag', letters: ['A', 'K', 'M', 'N', 'V', 'W', 'X', 'Z'], words: ['ZIGZAG'] },
  { key: 'curves', label: 'Curve Smoothness', description: 'Practice smooth round letters like O, C, S.', family: 'counter_clockwise', letters: ['C', 'O', 'G', 'Q', 'S'], words: ['MOON'] },
]

function generateWorksheetSVG(skill) {
  const data = SKILLS.find(s => s.key === skill) || SKILLS[0]
  const letter = data.letters[0]
  const word = data.words[0]
  const lines = []
  for (let i = 0; i < 6; i++) {
    const y = 120 + i * 70
    lines.push(`<line x1="40" y1="${y}" x2="560" y2="${y}" stroke="#CBD5E1" stroke-width="2"/>`)
  }
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="600" height="600" fill="#FAFAFA"/><text x="300" y="50" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="20" fill="#4F46E5">Practice: ${data.label}</text><text x="300" y="80" text-anchor="middle" font-family="Inter, sans-serif" font-size="14" fill="#5B5478">Trace the letter "${letter}" and word "${word}" on the lines below</text>${lines.join('')}<text x="300" y="520" text-anchor="middle" font-family="Inter, sans-serif" font-size="12" fill="#5B5478">Generated for skill: ${data.label}</text></svg>`)}`
}

export default function Practice() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const initialSkill = searchParams.get('skill') || searchParams.get('exercise') || 'alignment'
  const [skill, setSkill] = useState(initialSkill)
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [iframeError, setIframeError] = useState(false)
  const [practiceLevel, setPracticeLevel] = useState(0)
  const [useDynamic, setUseDynamic] = useState(false)

  const skillData = SKILLS.find(s => s.key === skill) || SKILLS[0]
  const dynamicUrl = generateWorksheetSVG(skill)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setIframeError(false)
    setUseDynamic(false)

    apiGet(`/api/worksheets/${skill}`)
      .then(data => {
        if (!cancelled) {
          setUrl(data.url || '')
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          // No server worksheet — use dynamic SVG generator as fallback
          setUrl('')
          setUseDynamic(true)
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [skill])

  const handleDownload = async () => {
    const source = useDynamic ? dynamicUrl : url
    if (!source) return
    try {
      if (source.startsWith('http')) {
        await apiDownload(source, `${skill}-worksheet.pdf`)
      } else {
        // Dynamic SVG data URL — open in new tab
        window.open(source, '_blank')
      }
    } catch {
      window.open(source, '_blank')
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 animate-fade">
      <button onClick={() => navigate(-1)} className="back-link mb-4">← Back</button>
      <h1 className="text-3xl font-bold mb-1">Practice Exercises</h1>
      <p className="text-ink-soft mb-6">Choose a skill and print the worksheet to practice.</p>

      <div className="card mb-6">
        <label className="block text-sm font-semibold text-ink-soft mb-2">Choose Exercise</label>
        <div className="flex flex-wrap gap-2">
          {SKILLS.map(s => (
            <button
              key={s.key}
              onClick={() => { setSkill(s.key); navigate(`/practice?skill=${s.key}`, { replace: true }) }}
              className={`btn ${skill === s.key ? 'btn-primary' : 'btn-ghost'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="text-ink-soft text-sm mt-3">{skillData.description}</p>
      </div>

      {loading ? (
        <div className="card text-center py-12">
          <div className="w-12 h-12 border-4 border-lavender border-t-indigo rounded-full animate-spin-slow mx-auto mb-4"></div>
          <p className="text-ink-soft">Loading worksheet...</p>
        </div>
      ) : !url || useDynamic || iframeError ? (
        <div className="card text-center py-12">
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📄</div>
          <h2 className="text-xl font-bold mb-2">Worksheet Ready to Download</h2>
          <p className="text-ink-soft mb-4">
            {error ? `Could not load preview: ${error}.` : 'Download the PDF and print it to practice.'}
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button onClick={handleDownload} className="btn btn-primary" disabled={!url && !useDynamic}>
              Download PDF
            </button>
            {(url || useDynamic) && (
              <a href={useDynamic ? dynamicUrl : url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                Open in New Tab
              </a>
            )}
          </div>
          {!url && !useDynamic && (
            <p className="text-ink-soft text-sm mt-4">
              No worksheet uploaded yet. Using dynamic generator.
            </p>
          )}
        </div>
      ) : (
        <div className="card">
          <iframe
            src={url}
            className="w-full h-[600px] rounded-xl border border-line"
            title={`${skillData.label} worksheet`}
            onError={() => setIframeError(true)}
          />
          <div className="mt-4 flex gap-3">
            <button onClick={handleDownload} className="btn btn-primary">
              Download PDF
            </button>
            <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              Open PDF
            </a>
          </div>
        </div>
      )}

      <div className="card mt-6">
        <div className="eyebrow">Progress Ladder</div>
        <h3 style={{ margin: '6px 0 12px' }}>Shapes → Letters → Words</h3>
        <div className="ladder">
          {['Rung 1: Large Shapes', 'Rung 2: Letters (ABCD Practice)', 'Rung 3: Full Context Words'].map((r, i) => (
            <div key={i} className={`rung ${i === practiceLevel ? 'current' : ''} ${i < practiceLevel ? 'unlocked' : ''}`}>
              <div className="rung-idx">{i + 1}</div>
              <div>{r}{i === practiceLevel ? ' — Active Practice Focus' : i < practiceLevel ? ' — ✓ Unlocked & Mastered' : ' — Locked'}</div>
            </div>
          ))}
        </div>
        <div className="safety-strip mt-4" style={{ fontSize: '12.5px' }}>
          <strong>Target:</strong> Trace with <strong>85%+ accuracy</strong> to advance. Below 85% repeats with a geometric primer.
        </div>
      </div>
    </div>
  )
}
