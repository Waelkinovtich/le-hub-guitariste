-- ============================================================================
-- migration-cascade-multi-groupes-suivi.sql
-- Session du 2026-09-07 — 3 tâches
-- À EXÉCUTER DANS SUPABASE SQL EDITOR (jamais exécuté automatiquement).
-- Chaque bloc est idempotent (IF NOT EXISTS / OR REPLACE).
-- ============================================================================

-- ── Tâche 1 — Cascade DnD ────────────────────────────────────────────────────
-- Aucune migration SQL : fonctionnalité 100 % frontend.
-- Correction : handleCascadeRequest inclut désormais les positions actuelles
-- de toutes les autres propositions comme créneaux bloquants lors du calcul
-- de l'alternative pour l'élève déplacé.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Tâche 2 — Groupes candidats dans le Planning intelligent ─────────────────
-- Aucune migration SQL : fonctionnalité 100 % frontend (commit fba45d2).
-- Les tables music_groups et group_members existaient déjà.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Tâche 3 — Suivi du temps de travail non rémunéré ─────────────────────────
-- Table work_time_entries : saisie libre de temps de préparation,
-- déplacement administratif et tâches admin, filtrable par période.

create table if not exists public.work_time_entries (
  id               uuid         primary key default gen_random_uuid(),
  teacher_id       uuid         not null references auth.users(id) on delete cascade,
  date             date         not null,
  -- Catégories : preparation | deplacement_admin | administratif | autre
  categorie        text         not null
    check (categorie in ('preparation', 'deplacement_admin', 'administratif', 'autre')),
  duree_minutes    int          not null check (duree_minutes > 0),
  description      text,
  created_at       timestamptz  not null default now()
);

-- Index pour les requêtes fréquentes : un prof filtre par date descendante
create index if not exists work_time_entries_teacher_date
  on public.work_time_entries (teacher_id, date desc);

-- RLS strict : identique aux autres tables du projet
-- (chaque prof ne voit et ne modifie que ses propres entrées)
alter table public.work_time_entries enable row level security;

-- Supprime et recrée la policy pour garantir l'idempotence
drop policy if exists "teacher_own_work_time" on public.work_time_entries;
create policy "teacher_own_work_time"
  on public.work_time_entries
  for all
  using  (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- ── Fin de migration ──────────────────────────────────────────────────────────
