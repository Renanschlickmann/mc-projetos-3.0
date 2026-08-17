-- MC PROJETOS v14 — atualização para cobranças extras
-- Pode rodar este arquivo inteiro no SQL Editor do Supabase.
-- Não apaga clientes, projetos ou pagamentos existentes.

create table if not exists public.mc_extras (
  user_id uuid not null references auth.users(id) on delete cascade,
  id bigint not null,
  projeto_id bigint not null,
  valor numeric(16,2) not null check (valor >= 0),
  descricao text not null default '',
  data date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint mc_extras_projeto_fk foreign key (user_id, projeto_id)
    references public.mc_projetos(user_id, id) on delete cascade
);

create index if not exists mc_extras_user_idx on public.mc_extras(user_id);
create index if not exists mc_extras_projeto_idx on public.mc_extras(user_id, projeto_id);

alter table public.mc_extras enable row level security;

drop policy if exists "mc_extras_select" on public.mc_extras;
drop policy if exists "mc_extras_insert" on public.mc_extras;
drop policy if exists "mc_extras_update" on public.mc_extras;
drop policy if exists "mc_extras_delete" on public.mc_extras;

create policy "mc_extras_select" on public.mc_extras for select to authenticated using ((select auth.uid()) = user_id);
create policy "mc_extras_insert" on public.mc_extras for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "mc_extras_update" on public.mc_extras for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "mc_extras_delete" on public.mc_extras for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.mc_extras to authenticated;

create or replace function public.mc_sync_state(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c jsonb;
  p jsonb;
  pg jsonb;
  ex jsonb;
begin
  if uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  delete from public.mc_extras where user_id = uid;
  delete from public.mc_pagamentos where user_id = uid;
  delete from public.mc_projetos where user_id = uid;
  delete from public.mc_clientes where user_id = uid;

  for c in select value from jsonb_array_elements(coalesce(payload->'clientes','[]'::jsonb)) loop
    insert into public.mc_clientes(user_id,id,nome,telefone,documento,cidade,obs)
    values(uid,(c->>'id')::bigint,c->>'nome',coalesce(c->>'telefone',''),coalesce(c->>'documento',''),coalesce(c->>'cidade',''),coalesce(c->>'obs',''));
  end loop;

  for p in select value from jsonb_array_elements(coalesce(payload->'projetos','[]'::jsonb)) loop
    insert into public.mc_projetos(user_id,id,cliente_id,tipo,nome,data,valor,valor_financiado,percentual,area,valor_ha,status,obs)
    values(
      uid,(p->>'id')::bigint,(p->>'clienteId')::bigint,p->>'tipo',p->>'nome',coalesce(nullif(p->>'data','')::date,current_date),
      coalesce((p->>'valor')::numeric,0),coalesce((p->>'valorFinanciado')::numeric,0),coalesce((p->>'percentual')::numeric,0),
      coalesce((p->>'area')::numeric,0),coalesce((p->>'valorHa')::numeric,0),coalesce(p->>'status','em_andamento'),coalesce(p->>'obs','')
    );
  end loop;

  for pg in select value from jsonb_array_elements(coalesce(payload->'pagamentos','[]'::jsonb)) loop
    insert into public.mc_pagamentos(user_id,id,projeto_id,valor,data,forma,obs)
    values(uid,(pg->>'id')::bigint,(pg->>'projetoId')::bigint,coalesce((pg->>'valor')::numeric,0),coalesce(nullif(pg->>'data','')::date,current_date),coalesce(pg->>'forma',''),coalesce(pg->>'obs',''));
  end loop;

  for ex in select value from jsonb_array_elements(coalesce(payload->'extras','[]'::jsonb)) loop
    insert into public.mc_extras(user_id,id,projeto_id,valor,descricao,data)
    values(uid,(ex->>'id')::bigint,(ex->>'projetoId')::bigint,coalesce((ex->>'valor')::numeric,0),coalesce(ex->>'descricao',''),coalesce(nullif(ex->>'data','')::date,current_date));
  end loop;
end;
$$;

grant execute on function public.mc_sync_state(jsonb) to authenticated;
