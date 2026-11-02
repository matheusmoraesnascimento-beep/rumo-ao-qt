-- Executar somente em conexão autorizada. Não inclui dados pessoais.
begin read only;
select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name;
select table_name, ordinal_position, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position;
select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by c.relname;
select tablename, policyname, roles, cmd, qual, with_check from pg_policies where schemaname = 'public' order by tablename, policyname;
select c.relname as tabela, con.conname, pg_get_constraintdef(con.oid) as definicao from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' order by c.relname, con.conname;
select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by tablename, indexname;
select event_object_table, trigger_name, action_statement from information_schema.triggers where trigger_schema = 'public' order by event_object_table, trigger_name;
select p.proname, pg_get_function_identity_arguments(p.oid) as argumentos, p.prosecdef as security_definer from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by p.proname;
-- Gera consultas agregadas para execução posterior, sujeitas às permissões da conexão.
select format('select %L as tabela, count(*) as total from %I.%I;', table_name, table_schema, table_name) as consulta_contagem from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name;
commit;
