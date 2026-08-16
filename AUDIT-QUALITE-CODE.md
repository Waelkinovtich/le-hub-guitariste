# Audit de qualité du code — Hub Guitariste

> Généré le 2026-08-16. Lecture complète de `src/` et `api/`.  
> **Légende de sévérité :** 🔴 Impact utilisateur probable · 🟠 Dette technique significative · 🟡 Amélioration de lisibilité

---

## api/send-surveys.js

| # | Sévérité | Localisation | Problème | Suggestion |
|---|---|---|---|---|
| 1 | 🔴 | L. ~10 `VERCEL_URL` | URL de production `'https://le-hub-guitariste.vercel.app'` en dur — tout autre déploiement (branche preview, staging) enverra des liens cassés | Remplacer par `process.env.VERCEL_URL \|\| 'http://localhost:5173'` |
| 2 | 🔴 | L. ~12 `FROM_EMAIL` | Email expéditeur `'waelkens.f@gmail.com'` en dur — impossible de changer sans modifier le code | Utiliser `process.env.FROM_EMAIL` |
| 3 | 🟠 | `templateReinscription`, `templateNouvelEleve`, `templateSondageRapide` | Prénom "Florent Waelkens" hardcodé dans les 3 templates d'e-mail | Le récupérer depuis la table `profiles` (déjà en base) ou l'injecter depuis l'appelant |
| 4 | 🟠 | Objets sujets/corps des templates | Année scolaire `'2026-2027'` en dur dans les sujets d'e-mail | Calculer dynamiquement avec `currentSchoolYear()` déjà disponible dans `services/schools.js` |

---

## src/services/lessons.js

| # | Sévérité | Localisation | Problème | Suggestion |
|---|---|---|---|---|
| 5 | 🟠 | L. 89 `createLesson` | Payload Supabase sur une seule ligne de >200 caractères — illisible à la revue | Éclater en objet multi-lignes au-dessus de l'appel `.insert()` |
| 6 | 🟠 | L. 95 `updateLesson` | Même problème que #5 | Idem |

---

## src/services/students.js

| # | Sévérité | Localisation | Problème | Suggestion |
|---|---|---|---|---|
| 7 | 🟠 | L. 52 `createStudent` | Payload Supabase sur une seule ligne de >200 caractères | Objet multi-lignes |
| 8 | 🟠 | L. 58 `updateStudent` | Même problème que #7 | Idem |

---

## src/services/messageTemplates.js

| # | Sévérité | Localisation | Problème | Suggestion |
|---|---|---|---|---|
| 9 | 🟠 | L. 63-66 `CLOSING_FORMULA` | Prénom "Florent" hardcodé dans la formule de politesse des 3 types d'audience | Paramétrer depuis le profil connecté, ou accepter `firstName` en argument |
| 10 | 🟡 | L. 48-52 `applyVariables` | `'{jour}'`, `'{heure}'`, `'{duree}'` toujours résolus en chaîne vide — les variables sont déclarées mais jamais alimentées | Soit les supprimer de la map, soit les documenter comme "à implémenter" |

---

## src/services/schools.js

| # | Sévérité | Localisation | Problème | Suggestion |
|---|---|---|---|---|
| 11 | 🟡 | L. 8 `fetchTeacherSchools` | Chaîne de sélection Supabase très longue (~30 colonnes) sur une seule ligne | La déclarer comme constante nommée `SCHOOL_SELECT` (pattern déjà utilisé pour `LESSON_SELECT`) |
| 12 | 🟡 | `fetchSchoolsOverview` | La fonction mélange trois niveaux : 1) requêtes parallèles, 2) construction de maps intermédiaires, 3) mapping final — lisible mais dense | Extraire les phases de mapping en fonctions internes nommées (`buildRateMap`, `buildCountMap`) pour que `fetchSchoolsOverview` reste un orchestrateur pur |

---

## src/utils/vacances.js

| # | Sévérité | Localisation | Problème | Suggestion |
|---|---|---|---|---|
| 13 | 🔴 | Constantes de dates | Dates de vacances uniquement valides pour 2025-2026 — l'application affichera de faux jours de vacances à partir de septembre 2026 | Ajouter les dates 2026-2027 (ou mieux : charger depuis une source externe/éditable) ; documenter clairement que la mise à jour annuelle est nécessaire |
| 14 | 🟡 | `"Noel"`, `"Ete"` | Accents manquants : `"Noël"` et `"Été"` — incohérent avec la charte linguistique du projet | Les corriger + mettre à jour les clés correspondantes dans `VACANCES_META` |
| 15 | 🟡 | `getVacances()` | Correspondance entre le tableau `noms` et le tableau `périodes` par position — si l'ordre change, les libellés sont inversés sans erreur visible | Rassembler nom et dates dans le même objet dès la définition |

---

## src/utils/exportPDF.js

| # | Sévérité | Localisation | Problème | Suggestion |
|---|---|---|---|---|
| 16 | 🟠 | L. 23-29 `STATUS_LABELS` | Objet dupliqué : les mêmes libellés existent déjà dans `src/utils/lessonStatus.js` (`LESSON_STATUSES`) | Importer depuis `lessonStatus.js` et construire la map via `.reduce()` |
| 17 | 🟡 | Constantes de mise en page PDF | Valeurs magiques répétées partout : `14` (marge X), `18` (départ Y), `15`, `9`, `13`, `10` (tailles de police) — aucun nom, aucune unité | Déclarer des constantes nommées en tête de fichier : `PDF_MARGIN_X = 14`, `PDF_FONT_TITLE = 15`, etc. |

---

## src/utils/schoolColors.js

| # | Sévérité | Localisation | Problème | Suggestion |
|---|---|---|---|---|
| 18 | 🟡 | `SCHOOL_COLORS` | Les 8 couleurs de palette ne sont pas commentées — aucune explication sur leur origine (accessibilité ? cohérence Tailwind ?) ni sur leur rôle (couleur #1 = première école par ordre de création ?) | Ajouter un commentaire sur le critère de choix et le comportement quand le nombre d'écoles dépasse 8 |
| 19 | 🟡 | Valeur par défaut `#6b7280` | Couleur de fallback (gris) non documentée comme "école sans couleur attribuée" | Extraire en constante `SCHOOL_COLOR_DEFAULT` |

---

## src/pages/SchedulingAssistantPage.jsx

| # | Sévérité | Localisation | Problème | Suggestion |
|---|---|---|---|---|
| 20 | 🟠 | L. 9-14 `getTeacherId()` | Appel direct à `supabase.auth.getUser()` qui court-circuite `AuthContext` — si la session expire, le comportement diverge du reste de l'app | Remplacer par le `user` fourni par `useAuth()` (déjà disponible dans tous les composants frères) |
| 21 | 🟠 | L. 18-29 `ScoreBadge` | Composant identique à celui défini dans `RattrapagePage.jsx` — duplication exacte | Extraire dans `src/components/ScoreBadge.jsx` et importer dans les deux pages |
| 22 | 🔴 | L. 225 `endDate = '2027-06-30'` | Date de fin des cours récurrents hardcodée — tous les cours générés à partir de la rentrée 2027 seront tronqués à juin 2027 | Calculer depuis `currentSchoolYear()` : fin de l'année en cours + un an |

---

## src/pages/teacher/EmargementPage.jsx

| # | Sévérité | Localisation | Problème | Suggestion |
|---|---|---|---|---|
| 23 | 🟠 | L. 25-26 `STATUS_COLORS`, `STATUS_LABELS` | Définis localement avec les mêmes valeurs que dans `lessonStatus.js` | Importer directement depuis `lessonStatus.js` (la map peut être construite par `.reduce()`) |
| 24 | 🟡 | L. 30-57 `getRange()` | Helpers internes `pad` et `fmt` sont des réimplémentations de `toISODate` déjà dans `format.js` | Utiliser `toISODate` importé |
| 25 | 🟡 | L. 59-66 `fmtDuree()` | Fonction identique à `minutesToLabel()` dans `RattrapagePage.jsx` | Extraire dans `format.js` sous un nom commun |

---

## src/pages/teacher/RattrapagePage.jsx

| # | Sévérité | Localisation | Problème | Suggestion |
|---|---|---|---|---|
| 26 | 🟠 | Lignes 1-50 | `ScoreBadge` dupliqué depuis `SchedulingAssistantPage.jsx` (voir #21) | Idem — extraire en composant partagé |
| 27 | 🟡 | `minutesToLabel()` | Fonction locale similaire à `fmtDuree()` dans EmargementPage.jsx (voir #25) | Idem — centraliser dans `format.js` |

---

## src/pages/TravelPage.jsx

| # | Sévérité | Localisation | Problème | Suggestion |
|---|---|---|---|---|
| 28 | 🟠 | L. 22-33 `téléchargerCSV()` | Fonction identique à celle dans `RevenueTrackingPage.jsx` — copier-coller exact | Extraire dans `src/utils/csv.js` ou `format.js` et importer |

---

## src/pages/RevenueTrackingPage.jsx

| # | Sévérité | Localisation | Problème | Suggestion |
|---|---|---|---|---|
| 29 | 🟠 | L. 17-28 `téléchargerCSV()` | Même duplication que #28 | Idem |

---

## src/hooks/useFetch.js

| # | Sévérité | Localisation | Problème | Suggestion |
|---|---|---|---|---|
| 30 | 🟡 | Corps du `useEffect` vs callback `reload` | La logique async (setLoading → try/catch → setData/setError → setLoading(false)) est écrite deux fois quasi-identiquement | Extraire en fonction `run()` partagée entre l'effet et `reload` |

---

## src/context/PeriodContext.jsx

| # | Sévérité | Localisation | Problème | Suggestion |
|---|---|---|---|---|
| 31 | 🟡 | `filterStudentsByPeriod`, `filterLessonsByPeriod` | Deux fonctions de filtrage avec 4 modes chacune — elles n'utilisent pas de contexte React, ce sont de pures fonctions de transformation | Déplacer dans `src/utils/filters.js` pour les rendre testables indépendamment du contexte |

---

## src/pages/SchoolsPage.jsx

| # | Sévérité | Localisation | Problème | Suggestion |
|---|---|---|---|---|
| 32 | 🟡 | L. 35 `async function load()` | `supabase.auth.getUser()` appelé directement alors que `useAuth()` est disponible via `AuthContext` — incohérence avec le reste de l'app | Utiliser `const { user } = useAuth()` et supprimer l'appel direct |

---

## Résumé des priorités

### À corriger en premier (impact fonctionnel)

| # | Fichier | Raison |
|---|---|---|
| 1 | `api/send-surveys.js` | URL hardcodée → liens cassés sur tout déploiement non-production |
| 13 | `src/utils/vacances.js` | Dates périmées → vacances mal détectées dès sept. 2026 |
| 22 | `SchedulingAssistantPage.jsx` | Date butoir 2027-06-30 hardcodée → cours tronqués |

### Dette technique à planifier

| Catégorie | Fichiers concernés | Effort estimé |
|---|---|---|
| Duplication `ScoreBadge` | `RattrapagePage`, `SchedulingAssistantPage` | 30 min |
| Duplication `téléchargerCSV` | `TravelPage`, `RevenueTrackingPage` | 20 min |
| Duplication `STATUS_LABELS`/`STATUS_COLORS` | `EmargementPage`, `exportPDF` | 30 min |
| Duplication `fmtDuree`/`minutesToLabel` | `EmargementPage`, `RattrapagePage` | 15 min |
| Payloads Supabase sur une ligne | `lessons.js`, `students.js` | 30 min |
| `getTeacherId()` bypass AuthContext | `SchedulingAssistantPage`, `SchoolsPage` | 20 min |

### Lisibilité (faible risque, faible urgence)

- Magic numbers PDF (`exportPDF.js`)
- Couleurs sans commentaire (`schoolColors.js`)
- Accents manquants dans `vacances.js`
- Helpers `getRange()` dans EmargementPage pourraient utiliser `toISODate`
- `filterStudentsByPeriod` / `filterLessonsByPeriod` → utils séparés
