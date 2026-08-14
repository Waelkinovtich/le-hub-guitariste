import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PeriodProvider } from './context/PeriodContext'
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
import RattrapagePage from './pages/teacher/RattrapagePage'
import GroupesPage from './pages/groupes/GroupesPage'
import GroupDetailPage from './pages/groupes/GroupDetailPage'
import StudentDashboard from './pages/student/StudentDashboard'
import StudentExercisesPage from './pages/student/StudentExercisesPage'
import StudentProgressPage from './pages/student/StudentProgressPage'
import StudentLessonsPage from './pages/student/StudentLessonsPage'
import SondagePage from './pages/SondagePage'
import SchoolSchedulePage from './pages/SchoolSchedulePage'
import SurveyResultsPage from './pages/SurveyResultsPage'
import SendSurveyPage from './pages/SendSurveyPage'
import QuickSurveyPage from './pages/QuickSurveyPage'
import ManageSurveysPage from './pages/ManageSurveysPage'
import SchoolNotesPage from './pages/SchoolNotesPage'
import SchoolsPage from './pages/SchoolsPage'
import SchoolDetailPage from './pages/SchoolDetailPage'
import SchoolsComparativePage from './pages/SchoolsComparativePage'
import RevenueTrackingPage from './pages/RevenueTrackingPage'
import MessageTemplatesPage from './pages/MessageTemplatesPage'
import SchedulingAssistantPage from './pages/SchedulingAssistantPage'
import ObjectivesPage from './pages/ObjectivesPage'
import SimulationPage from './pages/SimulationPage'
import TravelPage from './pages/TravelPage'
import { useTheme } from './hooks/useTheme'

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
          <Route path="groupes" element={<GroupesPage />} />
          <Route path="groupes/:id" element={<GroupDetailPage />} />
          <Route path="exercices" element={<ExercisesPage />} />
          <Route path="reglages" element={<SettingsPage />} />
          <Route path="rattrapage" element={<RattrapagePage />} />
        </Route>
        <Route path="/admin" element={<ProtectedRoute requiredRole="teacher"><Layout /></ProtectedRoute>}>
          <Route path="ecoles" element={<SchoolSchedulePage />} />
          <Route path="sondages" element={<SurveyResultsPage />} />
          <Route path="sondages/gerer" element={<ManageSurveysPage />} />
          <Route path="envoyer-sondage" element={<SendSurveyPage />} />
          <Route path="ecoles/notes" element={<SchoolNotesPage />} />
          <Route path="ecoles/liste" element={<SchoolsPage />} />
          <Route path="ecoles/comparatif" element={<SchoolsComparativePage />} />
          <Route path="ecoles/:id" element={<SchoolDetailPage />} />
          <Route path="revenus" element={<RevenueTrackingPage />} />
          <Route path="messages" element={<MessageTemplatesPage />} />
          <Route path="planning-intelligent" element={<SchedulingAssistantPage />} />
          <Route path="objectifs" element={<ObjectivesPage />} />
          <Route path="simulation" element={<SimulationPage />} />
          <Route path="deplacements" element={<TravelPage />} />
        </Route>
        <Route path="/eleve" element={<ProtectedRoute requiredRole="student"><Layout /></ProtectedRoute>}>
          <Route index element={<StudentDashboard />} />
          <Route path="exercices" element={<StudentExercisesPage />} />
          <Route path="progression" element={<StudentProgressPage />} />
          <Route path="cours" element={<StudentLessonsPage />} />
        </Route>
        <Route path="/sondage/:token" element={<SondagePage />} />
        <Route path="/sondage-rapide/:token" element={<QuickSurveyPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

function ThemeInit() {
  useTheme() // applique le thème sauvegardé dès le montage
  return null
}

export default function App() {
  return (
    <AuthProvider>
      <PeriodProvider>
        <BrowserRouter>
          <ThemeInit />
          <AppShell />
        </BrowserRouter>
      </PeriodProvider>
    </AuthProvider>
  )
}
