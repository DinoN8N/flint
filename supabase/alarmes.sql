-- ════════════════════════════════════════════════════════════════════════════
-- FLINT — LES ALARMES (26 sept. 2026)
-- À jouer une fois dans Supabase → SQL Editor. Rejouable sans danger.
--
-- CE QU'ELLE CONTIENT : les alarmes que la personne a réglées dans la page
-- Alarmes de l'app — une heure, des jours, un nom, une sonnerie, un rappel —
-- et le réglage de son réveil intelligent. Pas une nuit, pas un battement :
-- la décision « sonner plus tôt » se prend sur le téléphone, avec le sommeil
-- mesuré sur le téléphone, et rien de ce qu'elle lit ne monte ici.
--
-- POURQUOI LE SERVEUR N'EST PAS LA SOURCE DE L'HEURE QUI SONNE. Une alarme
-- doit sonner en mode avion. L'app range chaque alarme sur le téléphone
-- d'abord (et la pose dans iOS par AlarmKit), puis la recopie ici. Cette
-- table est la copie qui survit à une réinstallation et qui suit le compte
-- d'un iPhone à l'autre.
--
-- Correspondance avec la demande (noms anglais → colonnes) :
--   id → id · userId → client_id · hour → heure · minute → minute
--   enabled → active · label → libelle · recurrence → jours
--   sound → sonnerie · snoozeEnabled → rappel · snoozeDuration → rappel_min
--   type (classic | smart) → genre (classique | intelligente)
--   paramètres du réveil intelligent → fenetre_min
--   createdAt → cree_le · updatedAt → modifie_le
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.alarmes (
  -- Tiré par l'app, pas par la base : une alarme créée hors ligne a déjà son
  -- identifiant, et c'est lui qui voyage jusqu'ici au retour du réseau.
  id           uuid primary key,
  -- Posé par la base à l'insertion. L'app ne l'envoie jamais : le RLS
  -- ci-dessous refuse de toute façon une ligne qui ne serait pas la sienne.
  client_id    uuid not null default auth.uid()
               references auth.users(id) on delete cascade,
  genre        text not null default 'classique'
               check (genre in ('classique', 'intelligente')),
  -- L'heure LOCALE du téléphone. Pour le réveil intelligent, c'est l'heure
  -- GARANTIE (l'heure après laquelle on refuse de dormir), pas un espoir.
  heure        smallint not null check (heure between 0 and 23),
  minute       smallint not null check (minute between 0 and 59),
  active       boolean  not null default true,
  -- Vide = « Alarme » à l'affichage, dans la langue du téléphone.
  libelle      text     not null default '' check (char_length(libelle) <= 60),
  -- Les jours de la semaine, convention de `Calendar` : 1 = dimanche …
  -- 7 = samedi. Vide = une seule fois.
  jours        smallint[] not null default '{}'
               check (jours <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  sonnerie     text     not null default 'systeme' check (char_length(sonnerie) <= 40),
  rappel       boolean  not null default true,
  rappel_min   smallint not null default 9 check (rappel_min between 1 and 60),
  -- Réveil intelligent seulement : la largeur de la fenêtre AVANT l'heure
  -- garantie. 0 = il sonne à l'heure pile.
  fenetre_min  smallint not null default 0 check (fenetre_min between 0 and 90),
  -- Une alarme « une seule fois » : l'instant où elle doit sonner. Un autre
  -- iPhone du même compte sait ainsi qu'elle est passée, et l'éteint.
  echeance     timestamptz,
  cree_le      timestamptz not null default now(),
  -- ÉCRIT PAR L'APP : c'est l'instant du geste, pas de l'arrivée ici. Un
  -- changement fait hors ligne à 7 h et remonté à 9 h reste « de 7 h » quand
  -- deux iPhones se départagent.
  modifie_le   timestamptz not null default now()
);

-- Un seul réveil intelligent par compte. L'app l'adopte à la première
-- synchronisation au lieu d'en créer un second.
create unique index if not exists alarmes_une_intelligente
  on public.alarmes (client_id) where genre = 'intelligente';
create index if not exists alarmes_client_idx on public.alarmes (client_id);

-- ── RLS : chacun ne voit, n'écrit et n'efface QUE ses alarmes ──────────────
alter table public.alarmes enable row level security;

drop policy if exists "alarmes : lire les siennes"       on public.alarmes;
drop policy if exists "alarmes : créer les siennes"      on public.alarmes;
drop policy if exists "alarmes : modifier les siennes"   on public.alarmes;
drop policy if exists "alarmes : supprimer les siennes"  on public.alarmes;

create policy "alarmes : lire les siennes"
  on public.alarmes for select using (auth.uid() = client_id);
create policy "alarmes : créer les siennes"
  on public.alarmes for insert with check (auth.uid() = client_id);
create policy "alarmes : modifier les siennes"
  on public.alarmes for update using (auth.uid() = client_id)
  with check (auth.uid() = client_id);
-- Contrairement à `clients`, une alarme S'EFFACE : c'est un geste de la page
-- (le « − » rouge, le balayage), et il doit réellement la retirer d'ici.
create policy "alarmes : supprimer les siennes"
  on public.alarmes for delete using (auth.uid() = client_id);

-- Supabase accorde par défaut TOUT sur une table neuve à `anon` et à
-- `authenticated` — TRUNCATE compris, qui ne passe pas par le RLS. On repart
-- de rien et on n'accorde que les quatre verbes dont l'app a besoin.
revoke all on public.alarmes from anon, authenticated;
grant select, insert, update, delete on public.alarmes to authenticated;

-- ── Deux colonnes qui ne bougent plus après la création ────────────────────
-- L'app renvoie la ligne entière à chaque modification (upsert) : sans ce
-- garde-fou, `cree_le` serait réécrit, et une ligne pourrait changer de
-- propriétaire si quelqu'un forgeait `client_id`.
create or replace function public.alarmes_garder_origine()
returns trigger language plpgsql as $$
begin
  new.cree_le   := old.cree_le;
  new.client_id := old.client_id;
  return new;
end $$;

drop trigger if exists alarmes_garder_origine on public.alarmes;
create trigger alarmes_garder_origine
  before update on public.alarmes
  for each row execute function public.alarmes_garder_origine();

-- ── Un plafond, contre l'abus ──────────────────────────────────────────────
-- Cent alarmes par compte. L'Horloge d'iOS n'en montre jamais autant, et la
-- clé publique est dans chaque copie de l'app : sans plafond, un jeton
-- valide pourrait remplir la table.
create or replace function public.alarmes_plafond()
returns trigger language plpgsql
security definer set search_path = '' as $$
begin
  -- L'upsert de l'app passe par INSERT … ON CONFLICT : ce déclencheur part
  -- donc aussi pour une MODIFICATION. Une ligne qui existe déjà n'ajoute rien.
  if exists (select 1 from public.alarmes where id = new.id) then
    return new;
  end if;
  if (select count(*) from public.alarmes where client_id = new.client_id) >= 100 then
    raise exception 'trop d''alarmes pour ce compte' using errcode = '54000';
  end if;
  return new;
end $$;

drop trigger if exists alarmes_plafond on public.alarmes;
create trigger alarmes_plafond
  before insert on public.alarmes
  for each row execute function public.alarmes_plafond();
