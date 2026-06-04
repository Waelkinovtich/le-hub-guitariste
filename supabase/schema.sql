-- Hub du Guitariste — schéma initial
-- Exécuter dans Supabase : SQL Editor → New query → Run

-- ---------------------------------------------------------------------------
-- Profils utilisateurs (liés à auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('teacher', 'student')),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Élèves (fiche pédagogique gérée par le professeur)
-- ---------------------------------------------------------------------------
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  level text,
  instrument text,
  progress smallint not null default 0 check (progress >= 0 and progress <= 100),
  created_at timestamptz not null default now()
);

create index if not exists students_teacher_id_idx on public.students (teacher_id);
create index if not exists students_profile_id_idx on public.students (profile_id);

-- ---------------------------------------------------------------------------
-- Cours
-- ---------------------------------------------------------------------------
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  lesson_date date not null,
  lesson_time time not null,
  duration_minutes integer not null default 45 check (duration_minutes > 0),
  topic text not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists lessons_teacher_date_idx on public.lessons (teacher_id, lesson_date);
create index if not exists lessons_student_date_idx on public.lessons (student_id, lesson_date);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.lessons enable row level security;

-- Profils : lecture de son propre profil
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Élèves : le professeur gère sa liste
create policy "students_teacher_select"
  on public.students for select
  using (teacher_id = auth.uid());

create policy "students_teacher_insert"
  on public.students for insert
  with check (teacher_id = auth.uid());

create policy "students_teacher_update"
  on public.students for update
  using (teacher_id = auth.uid());

create policy "students_teacher_delete"
  on public.students for delete
  using (teacher_id = auth.uid());

-- Élève connecté : lecture de sa fiche
create policy "students_self_select"
  on public.students for select
  using (profile_id = auth.uid());

-- Cours : professeur
create policy "lessons_teacher_select"
  on public.lessons for select
  using (teacher_id = auth.uid());

create policy "lessons_teacher_insert"
  on public.lessons for insert
  with check (teacher_id = auth.uid());

create policy "lessons_teacher_update"
  on public.lessons for update
  using (teacher_id = auth.uid());

create policy "lessons_teacher_delete"
  on public.lessons for delete
  using (teacher_id = auth.uid());

-- Cours : élève (via sa fiche students)
create policy "lessons_student_select"
  on public.lessons for select
  using (
    exists (
      select 1 from public.students s
      where s.id = lessons.student_id and s.profile_id = auth.uid()
    )
  );

-- Profil du professeur visible par l'élève (nom du prof)
create policy "profiles_teacher_visible_to_student"
  on public.profiles for select
  using (
    role = 'teacher'
    and exists (
      select 1 from public.students s
      where s.teacher_id = profiles.id and s.profile_id = auth.uid()
    )
  );
