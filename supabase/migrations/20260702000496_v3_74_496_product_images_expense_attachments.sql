-- v3.74.496: Product images (max 3) + expense receipt attachments (images/PDF)
-- Applied to production on 2026-07-02 via Supabase MCP

-- 1) Products: array of image URLs (max 3)
alter table public.products
  add column if not exists image_urls text[] not null default '{}';

alter table public.products
  drop constraint if exists products_image_urls_max3;
alter table public.products
  add constraint products_image_urls_max3
  check (coalesce(array_length(image_urls, 1), 0) <= 3);

-- 2) Expenses: attachments metadata (path/name/mime/size)
alter table public.expenses
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- 3) Storage buckets
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 2097152, array['image/webp','image/jpeg','image/png']),
  ('expense-attachments', 'expense-attachments', false, 10485760, array['image/webp','image/jpeg','image/png','application/pdf'])
on conflict (id) do nothing;

-- 4) Storage RLS policies (path prefix = company_id, same pattern as backups bucket)

-- product-images: public read (bucket is public)
drop policy if exists product_images_read_v3_74_496 on storage.objects;
create policy product_images_read_v3_74_496 on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists product_images_insert_v3_74_496 on storage.objects;
create policy product_images_insert_v3_74_496 on storage.objects
  for insert with check (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.company_members cm
      where cm.user_id = auth.uid()
        and (storage.foldername(objects.name))[1] = cm.company_id::text
    )
  );

drop policy if exists product_images_delete_v3_74_496 on storage.objects;
create policy product_images_delete_v3_74_496 on storage.objects
  for delete using (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.company_members cm
      where cm.user_id = auth.uid()
        and (storage.foldername(objects.name))[1] = cm.company_id::text
    )
  );

-- expense-attachments: private, company members only (read via signed URLs)
drop policy if exists expense_attachments_read_v3_74_496 on storage.objects;
create policy expense_attachments_read_v3_74_496 on storage.objects
  for select using (
    bucket_id = 'expense-attachments'
    and exists (
      select 1 from public.company_members cm
      where cm.user_id = auth.uid()
        and (storage.foldername(objects.name))[1] = cm.company_id::text
    )
  );

drop policy if exists expense_attachments_insert_v3_74_496 on storage.objects;
create policy expense_attachments_insert_v3_74_496 on storage.objects
  for insert with check (
    bucket_id = 'expense-attachments'
    and exists (
      select 1 from public.company_members cm
      where cm.user_id = auth.uid()
        and (storage.foldername(objects.name))[1] = cm.company_id::text
    )
  );

drop policy if exists expense_attachments_delete_v3_74_496 on storage.objects;
create policy expense_attachments_delete_v3_74_496 on storage.objects
  for delete using (
    bucket_id = 'expense-attachments'
    and exists (
      select 1 from public.company_members cm
      where cm.user_id = auth.uid()
        and (storage.foldername(objects.name))[1] = cm.company_id::text
    )
  );
