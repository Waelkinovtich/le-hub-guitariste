-- =====================================================================
-- Correction des policies RLS anonymes manquantes sur les tables ensemble
-- =====================================================================
-- Cause : les policies "anon_insert_ensemble_participant" et
-- "anon_insert_ensemble_response" référencent t.expires_at dans leur
-- WITH CHECK. PostgreSQL valide les colonnes au moment du CREATE POLICY —
-- si expires_at n'existait pas encore sur ensemble_tokens (ajouté par
-- migration-enrichissement-sondage-ensemble.sql), les CREATE POLICY ont
-- échoué silencieusement (SQL Editor : erreur par instruction, pas de
-- rollback global). RLS est activé mais sans policy anon INSERT →
-- tout INSERT anonyme est bloqué avec "violates row-level security policy".
--
-- Cette migration est idempotente (DROP IF EXISTS avant CREATE).
-- RLS jamais affaibli : les policies recréées sont identiques à l'intention
-- initiale, expires_at existant désormais grâce à migration-enrichissement.
-- =====================================================================

-- Tâche 0a : s'assurer qu'expires_at existe (idempotent grâce à IF NOT EXISTS)
-- Nécessaire si migration-enrichissement-sondage-ensemble.sql n'a pas encore
-- été appliquée — sans cette colonne le CREATE POLICY échouerait à nouveau.
ALTER TABLE public.ensemble_tokens
  ADD COLUMN IF NOT EXISTS expires_at     timestamptz,
  ADD COLUMN IF NOT EXISTS participant_id uuid REFERENCES public.ensemble_participants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS school_id      uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS school_name    text;

-- Tâche 0b : recréer la policy INSERT anon sur ensemble_participants
DROP POLICY IF EXISTS "anon_insert_ensemble_participant" ON public.ensemble_participants;
CREATE POLICY "anon_insert_ensemble_participant"
  ON public.ensemble_participants
  FOR INSERT
  WITH CHECK (
    -- Autorisé seulement si un token valide du même professeur existe.
    -- expires_at IS NULL = token sans expiration (comportement par défaut).
    EXISTS (
      SELECT 1 FROM public.ensemble_tokens t
      WHERE t.teacher_id = ensemble_participants.teacher_id
        AND (t.used_at IS NULL OR t.token_type = 'generique')
        AND (t.expires_at IS NULL OR t.expires_at > now())
    )
  );

-- Tâche 0c : recréer la policy INSERT anon sur ensemble_responses
DROP POLICY IF EXISTS "anon_insert_ensemble_response" ON public.ensemble_responses;
CREATE POLICY "anon_insert_ensemble_response"
  ON public.ensemble_responses
  FOR INSERT
  WITH CHECK (
    -- Autorisé seulement si le token référencé est valide et non expiré.
    EXISTS (
      SELECT 1 FROM public.ensemble_tokens t
      WHERE t.id = token_id
        AND (t.used_at IS NULL OR t.token_type = 'generique')
        AND (t.expires_at IS NULL OR t.expires_at > now())
    )
  );

-- Vérification attendue après exécution :
-- SELECT policyname, cmd, roles FROM pg_policies
-- WHERE tablename IN ('ensemble_participants', 'ensemble_responses')
-- ORDER BY tablename, policyname;
-- → doit lister "anon_insert_ensemble_participant" et "anon_insert_ensemble_response"
