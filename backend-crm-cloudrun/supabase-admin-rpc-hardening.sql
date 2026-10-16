begin;

create or replace function crm_private.assert_admin()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1
    from public.user_profiles
    where id = (select auth.uid())
      and status = 'ativo'
      and role in ('admin', 'administrador')
  ) then
    raise exception 'Administrator privileges are required';
  end if;
end;
$$;
revoke all on function crm_private.assert_admin() from public, anon;
grant execute on function crm_private.assert_admin() to authenticated;

create or replace function crm_private.assert_admin_or_manager()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1
    from public.user_profiles
    where id = (select auth.uid())
      and status = 'ativo'
      and role in ('admin', 'administrador', 'gerente')
  ) then
    raise exception 'São necessários privilégios de administrador ou gerente.';
  end if;
end;
$$;
revoke all on function crm_private.assert_admin_or_manager() from public, anon;
grant execute on function crm_private.assert_admin_or_manager() to authenticated;

create or replace function public.admin_create_user(
  new_email text,
  new_name text,
  new_role text,
  new_team text default 'Equipe Principal'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  caller_role text;
  new_id uuid := pg_catalog.gen_random_uuid();
  clean_email text := lower(trim(new_email));
  clean_name text := trim(new_name);
  clean_role text := lower(trim(new_role));
  clean_team text := coalesce(nullif(trim(new_team), ''), 'Equipe Principal');
  encrypted_pw text := extensions.crypt('Senha@123', extensions.gen_salt('bf', 10));
begin
  -- Verifica permissão de admin ou gerente
  perform crm_private.assert_admin_or_manager();

  -- Se o chamador for gerente, impede criar administradores
  select role into caller_role
  from public.user_profiles
  where id = (select auth.uid());

  if caller_role = 'gerente' and clean_role in ('admin', 'administrador') then
    raise exception 'Gerentes não possuem permissão para criar contas de Administrador.';
  end if;

  -- Valida se o email já existe
  if exists (select 1 from auth.users where email = clean_email) or
     exists (select 1 from public.user_profiles where lower(email) = clean_email) then
    raise exception 'Já existe um colaborador cadastrado com este e-mail.';
  end if;

  -- Cria usuário em auth.users com confirmação imediata de e-mail (sem disparar convite externo)
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, is_sso_user, deleted_at
  ) values (
    new_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    clean_email, encrypted_pw, now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('name', clean_name, 'role', clean_role, 'team', clean_team),
    now(), now(), '', '', '', '', false, null
  );

  -- Cria identidade em auth.identities para permitir login imediato por senha
  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    pg_catalog.gen_random_uuid(), new_id::text, new_id,
    jsonb_build_object('sub', new_id, 'email', clean_email, 'email_verified', true),
    'email', null, now(), now()
  );

  -- Insere ou atualiza em public.user_profiles (tratando o trigger on_auth_user_created)
  insert into public.user_profiles (
    id, email, name, role, team, status, created_at, updated_at
  ) values (
    new_id, clean_email, clean_name, clean_role, clean_team, 'ativo', now(), now()
  )
  on conflict (id) do update set
    email = excluded.email,
    name = excluded.name,
    role = excluded.role,
    team = excluded.team,
    status = 'ativo',
    updated_at = now();

  return jsonb_build_object(
    'success', true,
    'id', new_id,
    'email', clean_email,
    'name', clean_name,
    'role', clean_role,
    'team', clean_team
  );
end;
$$;

create or replace function public.admin_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform crm_private.assert_admin();
  if target_user_id = (select auth.uid()) then
    raise exception 'An administrator cannot delete their own account through this function';
  end if;
  delete from auth.users where id = target_user_id;
  delete from public.user_profiles where id = target_user_id;
end;
$$;

create or replace function public.admin_reset_user_credentials(target_user_id uuid, new_email text, new_password text)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform crm_private.assert_admin();
  if length(new_password) < 12 then
    raise exception 'The password must contain at least 12 characters';
  end if;
  update auth.users
  set email = lower(trim(new_email)),
      encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf', 10)),
      updated_at = now()
  where id = target_user_id;
  update public.user_profiles
  set email = lower(trim(new_email)), reset_requested = false
  where id = target_user_id;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.user_profiles (id, email, role, status)
  values (new.id, new.email, 'vendedor', 'pendente');
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select coalesce(crm_private.actor_role() in ('admin', 'administrador'), false);
$$;

create or replace function public.request_password_reset(request_email text)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if request_email is null or length(trim(request_email)) > 320 or position('@' in trim(request_email)) = 0 then
    return;
  end if;
  update public.user_profiles
  set reset_requested = true
  where lower(email) = lower(trim(request_email));
end;
$$;

alter function public.rls_auto_enable() set search_path = pg_catalog;

revoke all on function public.admin_create_user(text,text,text) from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
revoke all on function public.admin_reset_user_credentials(uuid,text,text) from public, anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

grant execute on function public.admin_create_user(text,text,text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.admin_reset_user_credentials(uuid,text,text) to authenticated;
grant execute on function public.is_admin() to authenticated;

commit;