import type postgres from "postgres";

export async function installTrackingTrigger(sql: postgres.Sql) {
  await sql`
    create unlogged table if not exists _nuxvel_touched_tables (
      table_name text primary key
    )
  `;

  await sql`
    create or replace function _nuxvel_track_touched_table() returns trigger as $$
    begin
      insert into _nuxvel_touched_tables (table_name)
      values (format('%I.%I', tg_table_schema, tg_table_name))
      on conflict do nothing;
      return null;
    end;
    $$ language plpgsql
  `;

  await sql`
    create or replace function _nuxvel_attach_tracking_trigger() returns event_trigger as $$
    declare
      obj record;
    begin
      for obj in select * from pg_event_trigger_ddl_commands() loop
        if obj.command_tag = 'CREATE TABLE' and obj.object_type = 'table' then
          execute format(
            'create trigger _nuxvel_track_touched after insert or update or delete on %s for each statement execute function _nuxvel_track_touched_table()',
            obj.object_identity
          );
        end if;
      end loop;
    end;
    $$ language plpgsql
  `;

  const [{ exists }] = await sql`
    select exists(select 1 from pg_event_trigger where evtname = '_nuxvel_track_new_tables')
  `;

  if (!exists) {
    await sql.unsafe(`
      create event trigger _nuxvel_track_new_tables
      on ddl_command_end
      when tag in ('CREATE TABLE')
      execute function _nuxvel_attach_tracking_trigger()
    `);
  }
}

export async function resetTouchedTables(sql: postgres.Sql) {
  const rows = await sql<{ table_name: string }[]>`
    select table_name from _nuxvel_touched_tables
  `;

  if (rows.length === 0) return;

  const tables = rows.map((row) => row.table_name).join(", ");
  await sql.unsafe(`truncate table ${tables} restart identity cascade`);
  await sql`truncate table _nuxvel_touched_tables`;
}
