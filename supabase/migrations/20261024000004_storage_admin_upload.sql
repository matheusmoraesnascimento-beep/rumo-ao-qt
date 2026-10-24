-- Upload/atualização/remoção de recortes no bucket PRIVADO `provas` somente por administradores
-- (tabela public.admins, gerenciada só via SQL). Usuários comuns continuam só com leitura.
grant execute on function public.is_admin() to authenticated;

drop policy if exists "provas_admin_insert" on storage.objects;
drop policy if exists "provas_admin_update" on storage.objects;
drop policy if exists "provas_admin_delete" on storage.objects;
create policy "provas_admin_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'provas' and public.is_admin());
create policy "provas_admin_update" on storage.objects for update to authenticated
  using (bucket_id = 'provas' and public.is_admin()) with check (bucket_id = 'provas' and public.is_admin());
create policy "provas_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'provas' and public.is_admin());
