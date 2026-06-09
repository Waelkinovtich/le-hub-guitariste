import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import TeacherDashboard from './pages/teacher/TeacherDashboard'
import StudentsPage from './pages/teacher/StudentsPage'
import PlanningPage from './pages/teacher/PlanningPage'
import ExercisesPage from './pages/teacher/ExercisesPage'
import StudentDetailPage from './pages/teacher/StudentDetailPage'
import EmargementPage from './pages/teacher/EmargementPage'
import SettingsPage from './pages/teacher/SettingsPage'
import StudentDashboard from './pages/student/StudentDashboard'
import StudentExercisesPage from './pages/student/StudentExercisesPage'
import StudentProgressPage from './pages/student/StudentProgressPage'
import StudentLessonsPage from './pages/student/StudentLessonsPage'

function ConfigWarning() {
  const { isSupabaseConfigured, authError } = useAuth()
  if (isSupabaseConfigured && !authError) return null
  return (
    <div className="bg-guitar-600/20 border-b border-guitar-600/40 px-4 py-2 text-center text-sm text-guitar-300">
      {authError || 'Supabase non configure'}
    </div>
  )
}

function AppShell() {
  const { loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-void text-muted-foreground">
        <div className="w-8 h-8 border-2 border-guitar-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm">Chargement</p>
      </div>
    )
  }
  return (
    <>
      <ConfigWarning />
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/professeur" element={<ProtectedRoute requiredRole="teacher"><Layout /></ProtectedRoute>}>
          <Route index element={<TeacherDashboard />} />
          <Route path="eleves" element={<StudentsPage />} />
          <Route path="eleves/:id" element={<StudentDetailPage />} />
          <Route path="planning" element={<PlanningPage />} />
          <Route path="emargement" element={<EmargementPage />} />
          <Route path="exercices" element={<ExercisesPage />} />
          <Route path="reglages" element={<SettingsPage />} />
        </Route>
        <Route path="/eleve" element={<ProtectedRoute requiredRole="student"><Layout /></ProtectedRoute>}>
          <Route index element={<StudentDashboard />} />
          <Route path="exercices" element={<StudentExercisesPage />} />
          <Route path="progression" element={<StudentProgressPage />} />
          <Route path="cours" element={<StudentLessonsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AuthProvider>
  )
}
