-- Run once in Supabase SQL editor
create extension if not exists pg_cron;

create or replace function public.purge_trashed_projects()
returns void
language plpgsql
security definer
as $$
declare
  purged_project_id uuid;
begin
  for purged_project_id in
    select id
    from public.projects
    where deleted_at is not null
      and deleted_at < now() - interval '30 days'
  loop
    insert into public.audit_logs (project_id, action, payload)
    values (
      purged_project_id,
      'project_purged',
      jsonb_build_object('source', 'scheduler', 'retentionDays', 30)
    );

    delete from public.projects
    where id = purged_project_id;
  end loop;
end;
$$;

select cron.schedule(
  'purge-trashed-projects-daily',
  '0 3 * * *',
  $$select public.purge_trashed_projects();$$
);
