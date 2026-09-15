-- ─── Migration : mode "horaire fixe" pour les liens ensemble ────────────────
-- Tâche : TÂCHE 2 — nouveau mode "Créneau fixe à confirmer"
--
-- Additive — aucune donnée existante n'est modifiée.
-- Les tokens existants reçoivent mode = 'choix' par défaut (comportement actuel conservé).
--
-- À exécuter dans Supabase SQL Editor AVANT de déployer la nouvelle version.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ensemble_tokens
  ADD COLUMN IF NOT EXISTS mode text
    DEFAULT 'choix'
    CHECK (mode IN ('choix', 'fixe'));

-- Vérification post-migration (optionnel — lecture seule)
-- SELECT id, label, mode FROM ensemble_tokens ORDER BY created_at DESC LIMIT 10;
