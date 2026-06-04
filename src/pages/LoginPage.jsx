import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Guitar, GraduationCap, UserCircle, Mail, Lock, ArrowRight, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, user, authError } = useAuth()
  const [role, setRole] = useState('teacher')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (user) {
      navigate(user.role === 'teacher' ? '/professeur' : '/eleve', { replace: true })
    }
  }, [user, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const result = await login(email, password, role)
    setSubmitting(false)
    if (result.success) {
      navigate(role === 'teacher' ? '/professeur' : '/eleve')
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden border-r border-border-subtle">
        <div className="absolute inset-0 bg-gradient-to-br from-guitar-700/20 via-surface to-void" />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `repeating-linear-gradient(
              90deg,
              transparent,
              transparent 48px,
              #dc262608 48px,
              #dc262608 49px
            )`,
          }}
        />
        <div className="relative z-10 flex flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl guitar-gradient flex items-center justify-center">
              <Guitar className="w-6 h-6 text-white" />
            </div>
            <span className="font-display text-2xl">Hub du Guitariste</span>
          </div>

          <div className="max-w-md">
            <h1 className="font-display text-5xl leading-tight mb-4">
              Votre studio pédagogique, <span className="text-gradient-guitar italic">en ligne</span>
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Gérez vos élèves, planifiez vos cours et suivez la progression — connecté à Supabase.
            </p>
          </div>

          <p className="text-sm text-muted">
            Comptes créés dans Supabase Auth + table profiles
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl guitar-gradient flex items-center justify-center">
              <Guitar className="w-5 h-5 text-white" />
            </div>
            <span className="font-display text-xl">Hub du Guitariste</span>
          </div>

          <h2 className="text-2xl font-semibold mb-1">Connexion</h2>
          <p className="text-muted-foreground text-sm mb-8">
            Choisissez votre profil pour accéder à la plateforme
          </p>

          <div className="grid grid-cols-2 gap-3 mb-8">
            <button
              type="button"
              onClick={() => { setRole('teacher'); setError('') }}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                role === 'teacher'
                  ? 'border-guitar-600 bg-guitar-600/10 text-guitar-400'
                  : 'border-border-subtle bg-surface-raised hover:border-border text-muted-foreground'
              }`}
            >
              <GraduationCap className="w-6 h-6" />
              <span className="text-sm font-medium">Professeur</span>
            </button>
            <button
              type="button"
              onClick={() => { setRole('student'); setError('') }}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                role === 'student'
                  ? 'border-guitar-600 bg-guitar-600/10 text-guitar-400'
                  : 'border-border-subtle bg-surface-raised hover:border-border text-muted-foreground'
              }`}
            >
              <UserCircle className="w-6 h-6" />
              <span className="text-sm font-medium">Élève</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-muted-foreground mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@email.fr"
                  required
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-surface-raised border border-border-subtle focus:border-guitar-600 focus:ring-1 focus:ring-guitar-600/50 outline-none transition-all text-sm"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-muted-foreground mb-1.5">
                Mot de passe
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-surface-raised border border-border-subtle focus:border-guitar-600 focus:ring-1 focus:ring-guitar-600/50 outline-none transition-all text-sm"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-guitar-400 bg-guitar-600/10 border border-guitar-600/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl guitar-gradient text-white font-medium hover:opacity-90 transition-opacity shadow-lg shadow-guitar-600/25 disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Se connecter
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {authError && !error && (
            <p className="mt-4 text-xs text-center text-guitar-400/90 leading-relaxed">
              {authError}
            </p>
          )}

          <p className="mt-6 text-xs text-center text-muted leading-relaxed">
            Utilisez un compte créé dans Supabase Authentication, avec un profil correspondant dans la table profiles.
          </p>
        </div>
      </div>
    </div>
  )
}
