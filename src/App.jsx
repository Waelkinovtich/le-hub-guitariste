import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import TeacherDashboard from './pages/teacher/TeacherDashboard'
import StudentsPage from './pages/teacher/StudentsPage'
import PlanningPage from './pages/teacher/PlanningPage'
import ExercisesPage from './pages/teacher/ExercisesPage'
import StudentDashboard from './pages/student/StudentDashboard'
import StudentExercisesPage from './pages/student/StudentExercisesPage'
import StudentProgressPage from './pages/student/StudentProgressPage'
import StudentLessonsPage from './pages/student/StudentLessonsPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoginPage />} />

          <Route
            path="/professeur"
            element={
              <ProtectedRoute requiredRole="teacher">
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<TeacherDashboard />} />
            <Route path="eleves" element={<StudentsPage />} />
            <Route path="planning" element={<PlanningPage />} />
            <Route path="exercices" element={<ExercisesPage />} />
          </Route>

          <Route
            path="/eleve"
            element={
              <ProtectedRoute requiredRole="student">
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<StudentDashboard />} />
            <Route path="exercices" element={<StudentExercisesPage />} />
            <Route path="progression" element={<StudentProgressPage />} />
            <Route path="cours" element={<StudentLessonsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
