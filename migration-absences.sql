-- =============================================================================
-- MIGRATION — Système de déclaration d'absences élèves
-- =============================================================================
-- Architecture de sécurité (leçon tirée des bugs RLS sur les sondages) :
--   • Les tables ont RLS activé mais AUCUNE policy pour le rôle anon.
--   • Tout accès depuis un visiteur non authentifié passe EXCLUSIVEMENT par
--     les trois fonctions SECURITY DEFINER ci-dessous, qui font elles-mêmes
--     toutes les vérifications d'appartenance et de cohérence.
--   • REVOKE ALL FROM PUBLIC avant chaque GRANT EXECUTE TO anon.
-- =============================================================================

-- ─── 1a. Table absence_link ───────────────────────────────────────────────────
-- Un lien permanent et réutilisable par professeur (jamais expiré, jamais
-- marqué "utilisé"). Le token UUID sert d'identifiant public dans l'URL.

CREATE TABLE IF NOT EXISTS absence_link (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token      uuid        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT absence_link_teacher_unique UNIQUE (teacher_id)
);

ALTER TABLE absence_link ENABLE ROW LEVEL SECURITY;

-- Professeur authentifié : accès complet à sa propre ligne.
CREATE POLICY "absence_link_prof_own"
  ON absence_link
  FOR ALL
  TO authenticated
  USING  (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- Aucune policy anon : accès exclusif via les fonctions SECURITY DEFINER.


-- ─── 1b. Table absence_declarations ──────────────────────────────────────────
-- Une ligne par déclaration. Les champs lesson_* dénormalisent les données du
-- cours au moment de la déclaration (préservées même si le cours est modifié).
-- Annulation : cancelled_at mis à jour (jamais de DELETE).

CREATE TABLE IF NOT EXISTS absence_declarations (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id    uuid        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lesson_id     uuid        REFERENCES lessons(id) ON DELETE SET NULL,
  lesson_date   date        NOT NULL,
  lesson_time   time        NOT NULL,
  lesson_school text,
  declared_at   timestamptz NOT NULL DEFAULT now(),
  excused       boolean     NOT NULL DEFAULT false,
  cancelled_at  timestamptz
);

ALTER TABLE absence_declarations ENABLE ROW LEVEL SECURITY;

-- Professeur authentifié : accès complet à ses propres déclarations.
CREATE POLICY "absence_declarations_prof_own"
  ON absence_declarations
  FOR ALL
  TO authenticated
  USING  (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- Aucune policy anon : accès exclusif via les fonctions SECURITY DEFINER.


-- ─── Helper interne : normalisation du nom ───────────────────────────────────
-- Rend la comparaison insensible à la casse, aux espaces et aux accents FR.
-- Préfixé "_" pour signaler qu'il n'est pas destiné à être appelé directement.

CREATE OR REPLACE FUNCTION _normalize_name_absence(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $$
  SELECT translate(
    lower(trim(p_name)),
    'àáâãäèéêëìíîïòóôõöùúûüýÿçñÀÁÂÃÄÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝŸÇÑ',
    'aaaaaeeeeiiiioooouuuuuycnaaaaaeeeeiiiioooouuuuuycn'
  );
$$;


-- ─── Fonction 1 : find_student_for_absence ────────────────────────────────────
-- Vérifie le token, cherche l'élève par nom normalisé (prénom + nom ou
-- nom + prénom), et retourne ses données UNIQUEMENT si correspondance exacte.
-- Retourne NULL sans indice sur les autres élèves en cas d'échec.

CREATE OR REPLACE FUNCTION find_student_for_absence(p_token uuid, p_full_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_id    uuid;
  v_student       record;
  v_student_count int;
  v_name_norm     text;
  v_lessons       json;
  v_declarations  json;
BEGIN
  -- Étape 1 : token valide → teacher_id
  SELECT teacher_id INTO v_teacher_id
  FROM absence_link
  WHERE token = p_token;

  IF NOT FOUND THEN
    RETURN NULL;  -- Token inconnu : aucun indice pour le visiteur
  END IF;

  -- Étape 2 : normalisation du nom saisi
  v_name_norm := _normalize_name_absence(p_full_name);

  IF length(v_name_norm) < 2 THEN
    RETURN NULL;  -- Saisie trop courte pour être un nom valide
  END IF;

  -- Étape 3 : correspondance exacte et unique
  -- Accepte "prénom nom" ET "nom prénom" pour tolérer les inversions courantes.
  -- S'il y a 0 ou plusieurs correspondances : même réponse NULL (pas d'indice).
  SELECT count(*) INTO v_student_count
  FROM students
  WHERE teacher_id = v_teacher_id
    AND (
      _normalize_name_absence(first_name || ' ' || last_name) = v_name_norm
      OR _normalize_name_absence(last_name || ' ' || first_name) = v_name_norm
    );

  IF v_student_count <> 1 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_student
  FROM students
  WHERE teacher_id = v_teacher_id
    AND (
      _normalize_name_absence(first_name || ' ' || last_name) = v_name_norm
      OR _normalize_name_absence(last_name || ' ' || first_name) = v_name_norm
    )
  LIMIT 1;

  -- Étape 4 : cours à venir (date+heure strictement future, statut non annulé)
  SELECT json_agg(row_to_json(l) ORDER BY l.lesson_date, l.lesson_time)
  INTO v_lessons
  FROM (
    SELECT
      ls.id,
      ls.lesson_date,
      ls.lesson_time::text       AS lesson_time,
      ls.duration_minutes,
      st.school_name
    FROM lessons ls
    JOIN students st ON st.id = ls.student_id
    WHERE ls.student_id  = v_student.id
      AND ls.teacher_id  = v_teacher_id
      AND ls.status = 'planifie'
      AND (
        ls.lesson_date > current_date
        OR (ls.lesson_date = current_date AND ls.lesson_time > current_time)
      )
    ORDER BY ls.lesson_date, ls.lesson_time
  ) l;

  -- Étape 5 : historique complet des déclarations (passées + futures)
  SELECT json_agg(row_to_json(d) ORDER BY d.lesson_date DESC, d.lesson_time DESC)
  INTO v_declarations
  FROM (
    SELECT
      id,
      lesson_date,
      lesson_time::text  AS lesson_time,
      lesson_school,
      declared_at,
      excused,
      cancelled_at
    FROM absence_declarations
    WHERE student_id  = v_student.id
      AND teacher_id  = v_teacher_id
  ) d;

  -- Étape 6 : réponse structurée
  RETURN json_build_object(
    'student', json_build_object(
      'id',          v_student.id,
      'first_name',  v_student.first_name,
      'last_name',   v_student.last_name,
      'school_name', v_student.school_name
    ),
    'upcoming_lessons', COALESCE(v_lessons,      '[]'::json),
    'declarations',     COALESCE(v_declarations, '[]'::json)
  );
END;
$$;

REVOKE ALL   ON FUNCTION find_student_for_absence(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_student_for_absence(uuid, text) TO anon;


-- ─── Fonction 2 : declare_absence ────────────────────────────────────────────
-- Insère une déclaration pour un cours futur. Calcule automatiquement si
-- l'absence est "excusée" (≥ 48 h avant) ou non (< 48 h).
-- Refuse si le cours est passé, annulé, ou déjà déclaré.

CREATE OR REPLACE FUNCTION declare_absence(p_token uuid, p_student_id uuid, p_lesson_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_id uuid;
  v_lesson     record;
  v_lesson_ts  timestamptz;
  v_excused    boolean;
  v_decl_id    uuid;
BEGIN
  -- Vérification du token
  SELECT teacher_id INTO v_teacher_id
  FROM absence_link
  WHERE token = p_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'token_invalide';
  END IF;

  -- Le cours doit appartenir à ce professeur ET à cet élève, et ne pas être annulé
  SELECT ls.*, st.school_name AS _school_name
  INTO v_lesson
  FROM lessons ls
  JOIN students st ON st.id = ls.student_id
  WHERE ls.id          = p_lesson_id
    AND ls.teacher_id  = v_teacher_id
    AND ls.student_id  = p_student_id
    AND ls.status = 'planifie';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cours_introuvable';
  END IF;

  -- Timestamp du cours pour la vérification temporelle
  v_lesson_ts := (v_lesson.lesson_date::text || ' ' || v_lesson.lesson_time::text)::timestamptz;

  IF v_lesson_ts <= now() THEN
    RAISE EXCEPTION 'cours_passe';
  END IF;

  -- Pas de double déclaration active sur le même cours
  IF EXISTS (
    SELECT 1 FROM absence_declarations
    WHERE lesson_id   = p_lesson_id
      AND student_id  = p_student_id
      AND cancelled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'deja_declare';
  END IF;

  -- Règle des 48 h : excused = true si l'élève prévient ≥ 48 h à l'avance
  v_excused := (v_lesson_ts - now()) >= interval '48 hours';

  INSERT INTO absence_declarations (
    teacher_id, student_id, lesson_id,
    lesson_date, lesson_time, lesson_school, excused
  )
  VALUES (
    v_teacher_id, p_student_id, p_lesson_id,
    v_lesson.lesson_date, v_lesson.lesson_time, v_lesson._school_name,
    v_excused
  )
  RETURNING id INTO v_decl_id;

  RETURN json_build_object(
    'success',        true,
    'declaration_id', v_decl_id,
    'excused',        v_excused
  );
END;
$$;

REVOKE ALL   ON FUNCTION declare_absence(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION declare_absence(uuid, uuid, uuid) TO anon;


-- ─── Fonction 3 : cancel_absence_declaration ─────────────────────────────────
-- Annule une déclaration via UPDATE cancelled_at (jamais de DELETE).
-- Refuse si le cours est déjà passé ou si la déclaration est déjà annulée.
-- Vérifie que la déclaration appartient bien à un élève de ce professeur.

CREATE OR REPLACE FUNCTION cancel_absence_declaration(p_token uuid, p_declaration_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_id uuid;
  v_decl       record;
  v_lesson_ts  timestamptz;
BEGIN
  -- Vérification du token
  SELECT teacher_id INTO v_teacher_id
  FROM absence_link
  WHERE token = p_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'token_invalide';
  END IF;

  -- La déclaration doit appartenir à un cours de CE professeur
  SELECT * INTO v_decl
  FROM absence_declarations
  WHERE id          = p_declaration_id
    AND teacher_id  = v_teacher_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'declaration_introuvable';
  END IF;

  IF v_decl.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'deja_annulee';
  END IF;

  -- Annulation interdite si le cours est déjà passé
  v_lesson_ts := (v_decl.lesson_date::text || ' ' || v_decl.lesson_time::text)::timestamptz;

  IF v_lesson_ts <= now() THEN
    RAISE EXCEPTION 'cours_passe';
  END IF;

  -- Annulation : UPDATE, jamais DELETE (traçabilité)
  UPDATE absence_declarations
  SET cancelled_at = now()
  WHERE id = p_declaration_id;

  RETURN json_build_object('success', true);
END;
$$;

REVOKE ALL   ON FUNCTION cancel_absence_declaration(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_absence_declaration(uuid, uuid) TO anon;
