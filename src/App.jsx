import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PeriodProvider } from './context/PeriodContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
// LoginPage chargé de façon synchrone : c'est la première page rendue,
// avant tout contexte d'authentification — la charger en différé créerait
// un flash blanc à l'ouverture de l'app.
import LoginPage from './pages/LoginPage'
import { useTheme } from './hooks/useTheme'

// ─── Pages chargées en différé (code splitting) ──────────────────────────────
// Chaque import() produit un chunk distinct. Le bundle initial est ainsi réduit
// au strict nécessaire (auth, layout, providers) ; les pages se chargent
// à la demande lors de la première navigation vers chaque route.

const TeacherDashboard       = lazy(() => import('./pages/teacher/TeacherDashboard'))
const StudentsPage           = lazy(() => import('./pages/teacher/StudentsPage'))
const PlanningPage           = lazy(() => import('./pages/teacher/PlanningPage'))
const ExercisesPage          = lazy(() => import('./pages/teacher/ExercisesPage'))
const StudentDetailPage      = lazy(() => import('./pages/teacher/StudentDetailPage'))
const EmargementPage         = lazy(() => import('./pages/teacher/EmargementPage'))
const SettingsPage           = lazy(() => import('./pages/teacher/SettingsPage'))
const RattrapagePage         = lazy(() => import('./pages/teacher/RattrapagePage'))
const GroupesPage            = lazy(() => import('./pages/groupes/GroupesPage'))
const GroupDetailPage        = lazy(() => import('./pages/groupes/GroupDetailPage'))
const StudentDashboard       = lazy(() => import('./pages/student/StudentDashboard'))
const StudentExercisesPage   = lazy(() => import('./pages/student/StudentExercisesPage'))
const StudentProgressPage    = lazy(() => import('./pages/student/StudentProgressPage'))
const StudentLessonsPage     = lazy(() => import('./pages/student/StudentLessonsPage'))
const SondagePage            = lazy(() => import('./pages/SondagePage'))
const SchoolSchedulePage     = lazy(() => import('./pages/SchoolSchedulePage'))
const SurveyResultsPage      = lazy(() => import('./pages/SurveyResultsPage'))
const SendSurveyPage         = lazy(() => import('./pages/SendSurveyPage'))
const QuickSurveyPage        = lazy(() => import('./pages/QuickSurveyPage'))
const ManageSurveysPage      = lazy(() => import('./pages/ManageSurveysPage'))
const SchoolNotesPage        = lazy(() => import('./pages/SchoolNotesPage'))
const SchoolsPage            = lazy(() => import('./pages/SchoolsPage'))
const SchoolDetailPage       = lazy(() => import('./pages/SchoolDetailPage'))
const SchoolsComparativePage = lazy(() => import('./pages/SchoolsComparativePage'))
const RevenueTrackingPage    = lazy(() => import('./pages/RevenueTrackingPage'))
const MessageTemplatesPage   = lazy(() => import('./pages/MessageTemplatesPage'))
const SchedulingAssistantPage = lazy(() => import('./pages/SchedulingAssistantPage'))
const ObjectivesPage         = lazy(() => import('./pages/ObjectivesPage'))
const TravelPage             = lazy(() => import('./pages/TravelPage'))

// ─── Écran de chargement (fallback Suspense) ──────────────────────────────────
// Spinner minimaliste inline — identique au spinner d'AppShell —, importé ici
// pour éviter un import supplémentaire dans le bundle DataState au niveau App.
function PageChargement() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
      <div className="w-8 h-8 border-2 border-guitar-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm">Chargement…</p>
    </div>
  )
}

// ─── Avertissement de configuration Supabase ──────────────────────────────────

function ConfigWarning() {
  const { isSupabaseConfigured, authError } = useAuth()
  if (isSupabaseConfigured && !authError) return null
  return (
    <div className="bg-guitar-600/20 border-b border-guitar-600/40 px-4 py-2 text-center text-sm text-guitar-300">
      {authError || 'Supabase non configuré'}
    </div>
  )
}

// ─── Shell principal ──────────────────────────────────────────────────────────

function AppShell() {
  const { loading } = useAuth()

  // Chargement du contexte d'authentification (lecture session Supabase)
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
      {/*
        Suspense global : attrape uniquement les routes publiques hors Layout
        (SondagePage, QuickSurveyPage) qui n'ont pas de Suspense interne.
        Les routes dans Layout ont leur propre Suspense (voir Layout.jsx) —
        le spinner de navigation s'affiche dans le contenu sans masquer la sidebar.
      */}
      <Suspense fallback={<PageChargement />}>
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
            <Route path="simulation" element={<Navigate to="/admin/objectifs" replace />} />
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
      </Suspense>
    </>
  )
}

// ─── Initialisation du thème ──────────────────────────────────────────────────

function ThemeInit() {
  useTheme() // applique le thème sauvegardé dès le montage
  return null
}

// ─── Racine de l'application ──────────────────────────────────────────────────

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
