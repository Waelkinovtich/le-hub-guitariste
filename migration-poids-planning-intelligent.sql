-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION : poids de pondération des facteurs du Planning intelligent
-- Fichier : migration-poids-planning-intelligent.sql
-- À exécuter manuellement dans Supabase SQL Editor.
-- Migration additive et idempotente (ADD COLUMN IF NOT EXISTS).
-- RLS inchangé — aucune nouvelle table, aucune politique modifiée.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Chaque curseur va de 0 (facteur désactivé) à 100 (poids plein).
-- Par défaut à 100 → comportement identique à l'état avant migration.
-- Exception : poids_regroupement_age = 0 par défaut (nouveau facteur, désactivé).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS poids_regroupement_ecole   smallint NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS poids_adjacence             smallint NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS poids_alternance_debutants  smallint NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS poids_distance              smallint NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS poids_vacances              smallint NOT NULL DEFAULT 100,
  -- Nouveau facteur : regroupement par âge — désactivé par défaut
  ADD COLUMN IF NOT EXISTS poids_regroupement_age      smallint NOT NULL DEFAULT 0,
  -- Écart maximal en années entre deux élèves pour déclencher le bonus d'âge proche
  ADD COLUMN IF NOT EXISTS ecart_age_proche            integer  NOT NULL DEFAULT 4;

COMMENT ON COLUMN profiles.poids_regroupement_ecole
  IS 'Poids (0–100) du bonus "même école ce jour" dans le Planning intelligent. 0 = désactivé.';
COMMENT ON COLUMN profiles.poids_adjacence
  IS 'Poids (0–100) du bonus "créneau adjacent à la même école". 0 = désactivé.';
COMMENT ON COLUMN profiles.poids_alternance_debutants
  IS 'Poids (0–100) du bonus "pas de débutants consécutifs". 0 = désactivé.';
COMMENT ON COLUMN profiles.poids_distance
  IS 'Poids (0–100) du bonus "école proche du domicile". 0 = désactivé.';
COMMENT ON COLUMN profiles.poids_vacances
  IS 'Poids (0–100) de la pénalité "période de vacances". 0 = désactivé.';
COMMENT ON COLUMN profiles.poids_regroupement_age
  IS 'Poids (0–100) du bonus "créneaux consécutifs avec élèves d''âge proche". 0 = désactivé (défaut).';
COMMENT ON COLUMN profiles.ecart_age_proche
  IS 'Écart maximal en années entre deux élèves pour activer le bonus de regroupement par âge (défaut : 4).';
