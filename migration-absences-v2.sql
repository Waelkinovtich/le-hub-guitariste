-- =============================================================================
-- MIGRATION v2 — Suivi manuel du statut d'excuse sur absence_declarations
-- =============================================================================
-- Contexte : la colonne `excused` est calculée automatiquement lors de la
-- déclaration (règle 48h). Cette migration ajoute `excused_manual` pour
-- distinguer le statut automatique d'une modification manuelle par le professeur.
--
-- NULL   = statut calculé automatiquement (règle des 48h, valeur initiale)
-- TRUE   = excusé manuellement par le professeur (override)
-- FALSE  = non excusé manuellement par le professeur (override)
--
-- L'UI lit : excused_manual IS NOT NULL → "Modifié manuellement"
--            excused_manual IS NULL     → "Règle 48h (automatique)"
-- =============================================================================

-- ─── Ajout de la colonne ─────────────────────────────────────────────────────
-- DEFAULT NULL : toutes les déclarations existantes gardent le statut auto.
-- IF NOT EXISTS protège contre une ré-exécution accidentelle.

ALTER TABLE absence_declarations
  ADD COLUMN IF NOT EXISTS excused_manual boolean DEFAULT NULL;
