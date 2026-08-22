import { Routes, Route, Navigate } from 'react-router-dom'
import Welcome from './pages/Welcome'
import StudentHome from './pages/StudentHome'
import Scan from './pages/Scan'
import Results from './pages/Results'
import Practice from './pages/Practice'
import Games from './pages/Games'
import Progress from './pages/Progress'
import TeacherDashboard from './pages/TeacherDashboard'
import StudentProfile from './pages/StudentProfile'
import ParentView from './pages/ParentView'

const API_BASE = import.meta.env.VITE_API_URL || '/'

export { API_BASE }

export default function App() {
  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/home" element={<StudentHome />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/results/:scanId" element={<Results />} />
        <Route path="/practice" element={<Practice />} />
        <Route path="/games" element={<Games />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/teacher" element={<TeacherDashboard />} />
        <Route path="/student/:studentId" element={<StudentProfile />} />
        <Route path="/parent" element={<ParentView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
