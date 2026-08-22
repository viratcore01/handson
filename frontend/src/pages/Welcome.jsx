import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Welcome() {
  const [role, setRole] = useState('student')
  const navigate = useNavigate()

  const handleContinue = () => {
    if (role === 'teacher') {
      navigate('/teacher')
    } else if (role === 'parent') {
      navigate('/parent')
    } else {
      navigate('/home')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="card max-w-md w-full animate-fade">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo text-white mb-4">
            <svg viewBox="0 0 40 40" fill="none" className="w-10 h-10">
              <circle cx="20" cy="20" r="19" fill="#4F46E5"/>
              <path d="M12 26 C12 18, 16 12, 20 12 C24 12, 24 17, 20.5 18.5 C17 20, 15 23, 15 27" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
              <circle cx="15" cy="27" r="2.1" fill="#34D399"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold mb-2">Adaptive Handwriting Coach</h1>
          <p className="text-ink-soft text-sm">Scan worksheets. Get scores. Practice smarter.</p>
        </div>

        <div className="space-y-3 mb-6">
          <button
            onClick={() => setRole('student')}
            className={`w-full p-4 rounded-2xl border-2 text-left font-semibold transition-all ${role === 'student' ? 'border-indigo bg-lavender' : 'border-line bg-surface hover:border-indigo/30'}`}
          >
            <div className="text-lg">👦 Student</div>
            <div className="text-sm text-ink-soft font-normal">Practice and track your progress</div>
          </button>
          <button
            onClick={() => setRole('teacher')}
            className={`w-full p-4 rounded-2xl border-2 text-left font-semibold transition-all ${role === 'teacher' ? 'border-indigo bg-lavender' : 'border-line bg-surface hover:border-indigo/30'}`}
          >
            <div className="text-lg">👩‍🏫 Teacher</div>
            <div className="text-sm text-ink-soft font-normal">View class heatmap and override scores</div>
          </button>
          <button
            onClick={() => setRole('parent')}
            className={`w-full p-4 rounded-2xl border-2 text-left font-semibold transition-all ${role === 'parent' ? 'border-indigo bg-lavender' : 'border-line bg-surface hover:border-indigo/30'}`}
          >
            <div className="text-lg">👨‍👩‍👧 Parent</div>
            <div className="text-sm text-ink-soft font-normal">View plain-language progress summary</div>
          </button>
        </div>

        <button onClick={handleContinue} className="btn btn-primary btn-block">
          Continue →
        </button>
      </div>
    </div>
  )
}
