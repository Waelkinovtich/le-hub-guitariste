-- Données d'exemple (après création des comptes Auth)
-- 1. Créez dans Authentication → Users :
--    - marie.dubois@guitare.fr (mot de passe au choix) → copiez l'UUID
--    - lucas.martin@guitare.fr → copiez l'UUID
-- 2. Remplacez TEACHER_UUID et STUDENT_UUID ci-dessous, puis exécutez ce script.

-- INSERT INTO public.profiles (id, role, first_name, last_name, email, phone) VALUES
--   ('TEACHER_UUID', 'teacher', 'Marie', 'Dubois', 'marie.dubois@guitare.fr', '06 12 34 56 78'),
--   ('STUDENT_UUID', 'student', 'Lucas', 'Martin', 'lucas.martin@guitare.fr', '06 98 76 54 32');

-- INSERT INTO public.students (teacher_id, profile_id, first_name, last_name, email, phone, level, instrument, progress) VALUES
--   ('TEACHER_UUID', 'STUDENT_UUID', 'Lucas', 'Martin', 'lucas.martin@guitare.fr', '06 98 76 54 32', 'Intermédiaire', 'Guitare électrique', 72),
--   ('TEACHER_UUID', NULL, 'Emma', 'Leroy', 'emma.leroy@email.fr', NULL, 'Débutant', 'Guitare folk', 38),
--   ('TEACHER_UUID', NULL, 'Théo', 'Bernard', 'theo.bernard@email.fr', NULL, 'Avancé', 'Guitare classique', 89);

-- Puis insérez des cours en reliant student_id aux UUID générés dans public.students.
