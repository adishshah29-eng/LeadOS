-- ============================================================================
-- Tenant-isolation test. Paste into the Supabase SQL Editor and Run.
--
-- It creates two companies and five users, then acts as each user and tries
-- what they must NOT be able to do. Everything runs inside one DO block that
-- ends by raising an error on purpose, so ALL test data is rolled back.
--
--   Success:  ERROR: ALL 19 (21 after migration 0004) RLS ISOLATION CHECKS PASSED
--   Failure:  ERROR: FAIL: <what leaked>
--
-- Run it after every migration that touches policies.
-- ============================================================================

do $$
declare
  org_a uuid := 'aaaaaaaa-0000-4000-8000-00000000000a';
  org_b uuid := 'bbbbbbbb-0000-4000-8000-00000000000b';
  owner_a uuid := 'aaaaaaaa-0000-4000-8000-0000000000a1';
  agent_a uuid := 'aaaaaaaa-0000-4000-8000-0000000000a2';
  manager_a uuid := 'aaaaaaaa-0000-4000-8000-0000000000a3';
  viewer_a uuid := 'aaaaaaaa-0000-4000-8000-0000000000a4';
  owner_b uuid := 'bbbbbbbb-0000-4000-8000-0000000000b1';
  p1 uuid := 'aaaaaaaa-0000-4000-8000-0000000000f1';
  p2 uuid := 'aaaaaaaa-0000-4000-8000-0000000000f2';
  pb uuid := 'bbbbbbbb-0000-4000-8000-0000000000f3';
  l1 uuid := 'cccccccc-0000-4000-8000-000000000001'; -- org A, project 1, assigned to agent
  l2 uuid := 'cccccccc-0000-4000-8000-000000000002'; -- org A, project 2, unassigned
  lb uuid := 'cccccccc-0000-4000-8000-000000000003'; -- org B
  n bigint;
  passed int := 0;
begin
  -- ---------------------------------------------------------------- setup
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '{}'::jsonb, now(), now()
  from (values (owner_a, 'rls-owner-a@test.invalid'), (agent_a, 'rls-agent-a@test.invalid'), (manager_a, 'rls-manager-a@test.invalid'),
               (viewer_a, 'rls-viewer-a@test.invalid'), (owner_b, 'rls-owner-b@test.invalid')) as u(id, email);

  insert into public.organizations (id, name, slug) values (org_a, 'RLS Test A', 'rls-test-a'), (org_b, 'RLS Test B', 'rls-test-b');
  insert into public.memberships (org_id, user_id, role) values
    (org_a, owner_a, 'owner'), (org_a, agent_a, 'agent'), (org_a, manager_a, 'manager'), (org_a, viewer_a, 'viewer'), (org_b, owner_b, 'owner');
  insert into public.projects (id, org_id, name) values (p1, org_a, 'P1'), (p2, org_a, 'P2'), (pb, org_b, 'PB');
  insert into public.project_members (org_id, project_id, user_id) values (org_a, p1, manager_a), (org_a, p1, viewer_a);
  insert into public.leads (id, org_id, project_id, name, assigned_to) values
    (l1, org_a, p1, 'Lead one', agent_a), (l2, org_a, p2, 'Lead two', null), (lb, org_b, pb, 'Lead B', null);
  insert into public.ad_rollup_daily (org_id, project_id, level, entity_id, date, spend, results) values
    (org_a, p1, 'project', p1::text, current_date, 100, 1), (org_a, p2, 'project', p2::text, current_date, 200, 2);

  -- ------------------------------------------------------- owner of org B
  perform set_config('request.jwt.claims', json_build_object('sub', owner_b, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into n from public.leads where org_id = org_a;
  if n <> 0 then raise exception 'FAIL: org B owner can read % org A leads', n; end if; passed := passed + 1;

  select count(*) into n from public.organizations where id = org_a;
  if n <> 0 then raise exception 'FAIL: org B owner can read org A'; end if; passed := passed + 1;

  select count(*) into n from public.memberships where org_id = org_a;
  if n <> 0 then raise exception 'FAIL: org B owner can read org A roster'; end if; passed := passed + 1;

  update public.leads set name = 'hacked' where id = l1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: org B owner updated an org A lead'; end if; passed := passed + 1;

  begin
    insert into public.leads (org_id, name) values (org_a, 'injected');
    raise exception 'FAIL: org B owner inserted a lead into org A';
  exception when insufficient_privilege then passed := passed + 1;
  end;

  begin
    perform public.write_audit(org_a, 'forged', 'x');
    raise exception 'FAIL: org B owner wrote to org A audit log';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
    passed := passed + 1;
  end;

  begin
    perform public.create_invitation(org_a, 'x@test.invalid', 'admin', 'hash-x');
    raise exception 'FAIL: org B owner invited someone into org A';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
    passed := passed + 1;
  end;

  select count(*) into n from public.ad_rollup_daily where org_id = org_a;
  if n <> 0 then raise exception 'FAIL: org B owner can read org A ad numbers'; end if; passed := passed + 1;

  -- Client report links (migration 0004), when present.
  if to_regclass('public.report_links') is not null then
    perform set_config('role', 'none', true);
    execute format($q$insert into public.report_links (org_id, label, token_hash, expires_at) values (%L, 'A link', repeat('a', 64), now() + interval '1 day')$q$, org_a);
    perform set_config('role', 'authenticated', true);
    execute format('select count(*) from public.report_links where org_id = %L', org_a) into n;
    if n <> 0 then raise exception 'FAIL: org B owner can see org A report links'; end if; passed := passed + 1;
    if public.public_report(repeat('b', 64), 30) is not null then raise exception 'FAIL: an unknown report link returned data'; end if; passed := passed + 1;
  end if;

  -- ------------------------------------------------------- agent of org A
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('sub', agent_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into n from public.leads where org_id = org_a;
  if n <> 1 then raise exception 'FAIL: agent sees % leads, expected only their 1 assigned lead', n; end if; passed := passed + 1;

  update public.leads set status = 'contacted' where id = l1;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: agent cannot update the status of their own lead'; end if; passed := passed + 1;

  begin
    update public.leads set assigned_to = null where id = l1;
    raise exception 'FAIL: agent reassigned a lead';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
    passed := passed + 1;
  end;

  -- ----------------------------------------------------- manager of org A
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('sub', manager_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into n from public.leads where org_id = org_a;
  if n <> 1 then raise exception 'FAIL: manager sees % leads, expected 1 (project P1 only)', n; end if; passed := passed + 1;

  select count(*) into n from public.ad_rollup_daily where org_id = org_a;
  if n <> 1 then raise exception 'FAIL: manager sees % project rollups, expected 1', n; end if; passed := passed + 1;

  begin
    insert into public.leads (org_id, project_id, name) values (org_a, p2, 'wrong project');
    raise exception 'FAIL: manager added a lead to a project they are not assigned to';
  exception when insufficient_privilege then passed := passed + 1;
  end;

  -- ------------------------------------------------------ viewer of org A
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('sub', viewer_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into n from public.leads where org_id = org_a;
  if n <> 0 then raise exception 'FAIL: viewer can read % leads (contact details)', n; end if; passed := passed + 1;

  select count(*) into n from public.ad_rollup_daily where org_id = org_a;
  if n <> 1 then raise exception 'FAIL: viewer sees % project rollups, expected 1', n; end if; passed := passed + 1;

  -- ------------------------------------------------------- owner of org A
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('sub', owner_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  select count(*) into n from public.leads;
  if n <> 2 then raise exception 'FAIL: org A owner sees % leads, expected their 2', n; end if; passed := passed + 1;

  begin
    perform public.worker_meta_token(org_a);
    raise exception 'FAIL: a signed-in user can call a worker function';
  exception when insufficient_privilege then passed := passed + 1;
  end;

  -- ------------------------------------------------------------ anonymous
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);

  select count(*) into n from public.leads;
  if n <> 0 then raise exception 'FAIL: anonymous visitors can read leads'; end if; passed := passed + 1;

  perform set_config('role', 'none', true);
  raise exception 'ALL % RLS ISOLATION CHECKS PASSED (test data rolled back)', passed;
end $$;
