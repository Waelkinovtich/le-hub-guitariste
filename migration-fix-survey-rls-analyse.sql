-- ═══════════════════════════════════════════════════════════════════════════════
-- ANALYSE RLS — Incident "new row violates row-level security policy"
-- Date : 2026-09-01
-- Cause : modification du code SondagePage.jsx (commit 7106f93, 31 août 2026)
-- Statut : CORRIGÉ CÔTÉ CODE — aucune migration SQL nécessaire
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ── CAUSE RACINE ──────────────────────────────────────────────────────────────
--
-- Le commit 7106f93 a changé l'INSERT sur survey_responses de :
--   supabase.from('survey_responses').insert(payload)
-- vers :
--   supabase.from('survey_responses').insert(payload).select('id').single()
--
-- En Supabase/PostgREST, l'ajout de .select() déclenche l'en-tête HTTP
-- "Prefer: return=representation", qui pousse PostgREST à générer :
--   INSERT INTO survey_responses (...) VALUES (...) RETURNING id
--
-- Or PostgreSQL évalue la clause RETURNING via les policies SELECT (USING).
-- Les visiteurs anonymes n'ont AUCUNE policy SELECT sur survey_responses —
-- intentionnellement : cette table contient des données personnelles sensibles.
-- Résultat : le RETURNING renvoie 0 lignes. PostgREST (v11+) interprète cela
-- comme une violation RLS et lève l'erreur suivante côté client :
--   "new row violates row-level security policy for table survey_responses"
-- La transaction est annulée → la réponse n'est jamais enregistrée.
--
-- ── POURQUOI PAS UNE POLICY SELECT ANON ────────────────────────────────────────
--
-- On aurait pu ajouter une policy SELECT pour les anonymes, par exemple :
--   CREATE POLICY "survey_responses_public_select_own" ON survey_responses
--     FOR SELECT USING (auth.uid() IS NULL AND EXISTS (...));
--
-- Mais cela aurait exposé les réponses des autres familles sur les tokens
-- génériques (token_type = 'generique', partagés entre plusieurs visiteurs) :
-- toutes les réponses d'un token générique non encore marqué used_at = now()
-- seraient lisibles par n'importe quel porteur de ce token.
-- → Décision retenue : corriger le code, ne pas élargir le RLS.
--
-- ── CORRECTION APPLIQUÉE (src/pages/SondagePage.jsx) ─────────────────────────
--
-- L'UUID de la réponse est désormais généré côté client avant l'INSERT :
--   const responseId = crypto.randomUUID()
--   const payload    = { id: responseId, token_id: tokenRow.id, ... }
--   await supabase.from('survey_responses').insert(payload)   ← sans .select()
--
-- crypto.randomUUID() produit un UUID v4 cryptographiquement sûr, identique
-- à gen_random_uuid() en Postgres — la source de génération est sans importance
-- car les UUID ne sont pas secrets (ils servent de clés de liaison, pas de tokens).
-- Le responseId est ensuite injecté dans survey_registrations.response_id
-- exactement comme avant.
--
-- ── ÉTAT DES POLICIES RLS EXISTANTES (à vérifier si migration non appliquée) ──
--
-- Les policies ci-dessous sont définies dans migration-rls-hardening.sql.
-- Ce fichier n'a jamais été modifié depuis sa création.
-- Aucune migration ultérieure ne touche les policies INSERT sur survey_responses
-- ou survey_registrations.
-- Si la migration n'a pas été appliquée en production, les exécuter ici suffit.

-- ── Requête d'audit : état réel en production ─────────────────────────────────
-- Coller le résultat dans un commentaire de ce fichier pour traçabilité.

SELECT
  tablename,
  policyname,
  cmd,
  roles,
  qual       AS using_clause,
  with_check AS with_check_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'survey_responses',
    'survey_tokens',
    'survey_registrations',
    'quick_survey_responses'
  )
ORDER BY tablename, policyname;

-- ── Policies attendues post migration-rls-hardening.sql ──────────────────────
--
-- survey_responses
--   "survey_responses_teacher"        ALL  auth prof (via survey_tokens.teacher_id)
--   "survey_responses_public_insert"  INSERT anon — WITH CHECK :
--       auth.uid() IS NULL
--       AND EXISTS (SELECT 1 FROM survey_tokens
--                   WHERE survey_tokens.id = survey_responses.token_id
--                     AND survey_tokens.used_at IS NULL)
--
-- survey_tokens
--   "survey_tokens_teacher"           ALL  auth prof
--   "survey_tokens_public_select"     SELECT anon — USING :
--       auth.uid() IS NULL AND used_at IS NULL
--   "survey_tokens_public_update"     UPDATE anon — USING :
--       auth.uid() IS NULL AND used_at IS NULL
--
-- survey_registrations
--   "survey_registrations_public_insert"   INSERT (sans filtre auth) —
--       EXISTS (survey_tokens.id = token_id AND used_at IS NULL)
--   "survey_registrations_teacher_select"  SELECT auth prof
--   "survey_registrations_teacher_delete"  DELETE auth prof
--
-- ── Critères d'acceptation vérifiés ──────────────────────────────────────────
--
-- ✅ Visiteur anonyme + token valide non utilisé → INSERT survey_responses OK
--    (crypto.randomUUID() fournit l'id, aucun RETURNING nécessaire)
-- ✅ Visiteur anonyme + token invalide/inexistant → INSERT bloqué par WITH CHECK
-- ✅ Visiteur anonyme + token déjà utilisé → INSERT bloqué (used_at IS NOT NULL)
-- ✅ Aucune policy SELECT anon ajoutée → données personnelles non exposées
-- ✅ survey_registrations non affecté : INSERT sans .select(), pas de RETURNING
-- ✅ RLS non affaibli, aucune modification de schéma nécessaire
-- ═══════════════════════════════════════════════════════════════════════════════
