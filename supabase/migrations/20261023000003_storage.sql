-- Storage PRIVADO. Recortes das provas: leitura só para autenticados (URL assinada curta).
-- Upload de provas: somente via service role (script scripts/enviar-imagens.ts), fora do browser.
insert into storage.buckets (id, name, public) values ('provas', 'provas', false)
  on conflict (id) do update set public = false;
insert into storage.buckets (id, name, public) values ('redacoes', 'redacoes', false)
  on conflict (id) do update set public = false;

drop policy if exists "provas_read_authenticated" on storage.objects;
create policy "provas_read_authenticated" on storage.objects for select to authenticated
  using (bucket_id = 'provas');

-- Anexos de redação: pasta = uid do dono
drop policy if exists "redacoes_owner_select" on storage.objects;
drop policy if exists "redacoes_owner_insert" on storage.objects;
drop policy if exists "redacoes_owner_delete" on storage.objects;
create policy "redacoes_owner_select" on storage.objects for select to authenticated
  using (bucket_id = 'redacoes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "redacoes_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'redacoes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "redacoes_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'redacoes' and (storage.foldername(name))[1] = auth.uid()::text);
