-- =====================================================================
-- Correction des survey_responses bloquées au statut 'a_traiter'
-- Cause : handleDegrouper remettait incorrectement 'a_traiter' au lieu
-- de 'attente', laissant les élèves invisibles dans le Planning intelligent
-- (statsPlacement ne reconnaît pas 'a_traiter' comme catégorie valide).
-- =====================================================================

-- Tâche T1 : remettre toutes les réponses 'a_traiter' à 'attente'
-- (aucun risque : 'a_traiter' ne devrait jamais exister en production —
--  c'est un statut transitoire introduit par erreur)
UPDATE survey_responses
SET    status       = 'attente',
       assigned_day  = NULL,
       assigned_time = NULL
WHERE  status = 'a_traiter';

-- Vérification attendue : 0 lignes avec status='a_traiter' après exécution
-- SELECT id, first_name, last_name, status FROM survey_responses WHERE status = 'a_traiter';
