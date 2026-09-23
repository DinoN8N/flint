-- ════════════════════════════════════════════════════════════════════════════
-- FLINT — LA BASE CLIENTS
-- À jouer une fois dans Supabase → SQL Editor. Rejouable sans danger.
--
-- CE QU'ELLE CONTIENT, ET RIEN D'AUTRE : qui s'est inscrit, par quelle porte,
-- depuis quel appareil, et quand on l'a vu pour la dernière fois. Pas une
-- nuit, pas un battement, pas un repas. La promesse de l'onboarding (« tes
-- données restent sur ton iPhone ») reste vraie parce que cette table est la
-- SEULE que l'app écrit, et qu'elle tient en huit colonnes lisibles.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.clients (
  -- La clé primaire EST l'identifiant d'authentification. Pas de second
  -- identifiant à réconcilier, et la suppression du compte emporte la ligne.
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  prenom       text,
  -- « apple » / « google » / « email »
  fournisseur  text,
  -- L'UUID anonyme de `DeviceIdentite` — le lien avec tout ce que la personne
  -- avait déjà fait dans l'app AVANT de créer son compte.
  appareil     text,
  langue       text,
  version_app  text,
  cree_le      timestamptz not null default now(),
  vu_le        timestamptz not null default now()
);

-- ── RLS : chacun ne voit et n'écrit QUE sa ligne ────────────────────────────
--
-- Sans ceci, la clé `anon` — publique, présente dans chaque copie de l'app —
-- laisserait n'importe qui lire toute la base clients. C'est la protection,
-- il n'y en a pas d'autre, et elle doit être activée AVANT la première
-- inscription.
alter table public.clients enable row level security;

drop policy if exists "client lit sa ligne"    on public.clients;
drop policy if exists "client crée sa ligne"   on public.clients;
drop policy if exists "client met à jour sa ligne" on public.clients;

create policy "client lit sa ligne"
  on public.clients for select using (auth.uid() = id);

create policy "client crée sa ligne"
  on public.clients for insert with check (auth.uid() = id);

create policy "client met à jour sa ligne"
  on public.clients for update using (auth.uid() = id) with check (auth.uid() = id);

-- Pas de politique DELETE : une ligne ne s'efface qu'en supprimant le compte
-- (api/supprimer-compte.js), et la cascade ci-dessus s'en charge. Un client
-- qui pourrait effacer sa ligne sans effacer son compte laisserait un compte
-- fantôme que plus rien ne décrit.

-- `cree_le` ne doit jamais reculer : l'upsert de l'app renvoie la ligne
-- entière à chaque lancement, et sans ce garde-fou la date d'inscription
-- serait réécrite à « aujourd'hui » pour tout le monde, tous les jours.
create or replace function public.clients_garder_creation()
returns trigger language plpgsql as $$
begin
  new.cree_le := old.cree_le;
  return new;
end $$;

drop trigger if exists clients_garder_creation on public.clients;
create trigger clients_garder_creation
  before update on public.clients
  for each row execute function public.clients_garder_creation();

create index if not exists clients_cree_le_idx on public.clients (cree_le desc);
create index if not exists clients_appareil_idx on public.clients (appareil);

-- ── Le tableau de bord d'une seule requête ──────────────────────────────────
-- select * from public.inscriptions_par_jour;
-- `security_invoker` : SANS LUI, UNE VUE CONTOURNE LE RLS DE SA TABLE.
-- C'est le piège classique de Supabase — on verrouille la table, on expose
-- l'agrégat, et la clé publique lit les comptes de tout le monde. Avec, la
-- vue applique les mêmes règles que `clients` : elle ne rend rien à l'app, et
-- tout à l'éditeur SQL du tableau de bord.
create or replace view public.inscriptions_par_jour
  with (security_invoker = on) as
  select date_trunc('day', cree_le)::date as jour,
         count(*)                          as inscrits,
         count(*) filter (where fournisseur = 'apple')  as par_apple,
         count(*) filter (where fournisseur = 'google') as par_google,
         count(*) filter (where fournisseur = 'email')  as par_email
  from public.clients
  group by 1 order by 1 desc;

-- ── La suppression de compte, SANS clé service_role ─────────────────────────
--
-- (23 sept. 2026) Elle passait par api/supprimer-compte.js chez Vercel avec la
-- clé `service_role` en variable d'environnement — donc une clé secrète à
-- copier dans un dashboard, à faire tourner, et un endpoint de plus à
-- surveiller. Cette fonction remplace tout ça : elle tourne avec les droits de
-- son propriétaire (`security definer`), mais elle ne sait effacer QUE la
-- personne qui l'appelle (`auth.uid()`). Un jeton ne peut donc supprimer que
-- son propre compte, la cascade emporte la ligne `clients`, et aucun secret
-- n'existe nulle part. L'app l'appelle en POST /rest/v1/rpc/supprimer_mon_compte
-- avec son propre jeton.
create or replace function public.supprimer_mon_compte()
returns void
language plpgsql
security definer
-- `search_path` VIDE : une fonction `security definer` tourne avec les droits
-- de son propriétaire, et un search_path ouvert laisserait quelqu'un lui
-- faire résoudre `auth.users` vers une table homonyme dans un autre schéma.
-- Tout est donc qualifié en dur ci-dessous. (Version posée en base le 23 sept.
-- par la session des consoles ; ce fichier la reprend à l'identique.)
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'non authentifié' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

-- Ni le public ni la clé anonyme ne peuvent l'appeler : il faut un jeton de
-- session. Sans ces deux lignes, `anon` hériterait de l'EXECUTE par défaut.
revoke all on function public.supprimer_mon_compte() from public, anon;
grant execute on function public.supprimer_mon_compte() to authenticated;
