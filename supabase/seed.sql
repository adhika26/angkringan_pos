-- =============================================================
-- Angkringan POS - Data contoh menu
-- Jalankan setelah schema.sql di Supabase > SQL Editor.
-- =============================================================

insert into public.categories (name, sort_order) values
  ('Makanan', 1),
  ('Camilan', 2),
  ('Minuman', 3),
  ('Rokok', 4)
on conflict (name) do nothing;

insert into public.products (name, category_id, price, stock)
select v.name, c.id, v.price, v.stock
from (values
  ('Nasi Kucing', 'Makanan', 5000, 100),
  ('Nasi Kucing Sambal Teri', 'Makanan', 6000, 100),
  ('Nasi Kucing Ayam Oseng', 'Makanan', 8000, 80),
  ('Sate Usus', 'Camilan', 3000, 100),
  ('Sate Telur Puyuh', 'Camilan', 4000, 100),
  ('Sate Kulit', 'Camilan', 3000, 80),
  ('Gorengan (Tempe/Tahu/Bakwan)', 'Camilan', 2000, 150),
  ('Ceker Setan', 'Camilan', 5000, 60),
  ('Teh Hangat', 'Minuman', 3000, 200),
  ('Es Teh', 'Minuman', 4000, 200),
  ('Kopi Hitam', 'Minuman', 4000, 100),
  ('Es Jeruk', 'Minuman', 6000, 80),
  ('Wedang Jahe', 'Minuman', 5000, 80),
  ('Air Mineral', 'Minuman', 4000, 100),
  ('Rokok Ketengan', 'Rokok', 3000, 200)
) as v(name, category_name, price, stock)
join public.categories c on c.name = v.category_name
where not exists (
  select 1 from public.products p where p.name = v.name
);
