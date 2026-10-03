-- =============================================================================
-- J&J Sportswear: SAMPLE catalog (demo data only)
-- =============================================================================
-- Run once in the Supabase SQL editor after the owner account exists.
-- Every product here is tagged 'sample'. Remove them all with
-- supabase/seed/remove-sample-products.sql before entering the real catalog.
-- Prices, stock counts, and images are illustrative, not the shop's real data.
-- =============================================================================

begin;

do $$
begin
  if not exists (select 1 from public.profiles where role = 'owner') then
    raise exception 'No owner account yet. Sign up and promote the owner first.';
  end if;
  if exists (select 1 from public.product_tags where lower(tag) = 'sample') then
    raise exception 'Sample products are already loaded. Run remove-sample-products.sql first to reload them.';
  end if;
end;
$$;

create temp table _sample (name text primary key, id uuid not null) on commit drop;

-- Products
with owner as (
  select id from public.profiles where role = 'owner' order by created_at limit 1
), inserted as (
  insert into public.products (name, description, base_price, created_by)
  select v.name, v.description, v.base_price, owner.id
  from owner, (values
    ('Reversible Liga Jersey', 'Two-sided mesh jersey for barangay leagues. Print a number on each side.', 650.00),
    ('Sublimated Basketball Jersey', 'Full-sublimation jersey; colors are dyed into the fabric so they won''t crack or fade.', 850.00),
    ('Basketball Shorts', 'Mesh game shorts with an elastic drawstring waist.', 450.00),
    ('Practice Pinnie', 'Lightweight mesh pinnie for scrimmages and drills.', 280.00),
    ('Volleyball Jersey', 'Fitted cap-sleeve jersey for volleyball teams.', 600.00),
    ('Volleyball Spandex Shorts', 'Compression shorts with a wide waistband.', 350.00),
    ('Sepak Takraw Jersey', 'Breathable jersey cut for kicks and spikes.', 550.00),
    ('Esports Jersey', 'Long-sleeve team jersey with room for player tags and sponsor logos.', 750.00),
    ('Dri-fit Practice Tee', 'Quick-dry training tee for practice and PE.', 380.00),
    ('Classic Polo Shirt', 'Pique polo for office and school uniforms; embroidery-ready.', 550.00),
    ('Warmer Jacket', 'Full-zip team warmer with a stand-up collar.', 1250.00),
    ('Pullover Hoodie', 'Fleece-lined hoodie with a front pouch pocket.', 950.00),
    ('Arm Sleeve', 'Compression arm sleeve for shooters.', 150.00),
    ('Crew Socks (3 pairs)', 'Cushioned athletic crew socks, three pairs per pack.', 220.00),
    ('Sports Headband', 'Terry-cloth headband that keeps sweat off the eyes.', 90.00),
    ('Team Cap', 'Six-panel cap with an adjustable strap; logo-ready front.', 320.00)
  ) as v (name, description, base_price)
  returning id, name
)
insert into _sample (name, id) select name, id from inserted;

-- Tags (every product also gets 'sample')
insert into public.product_tags (product_id, tag)
select s.id, v.tag
from (values
  ('Reversible Liga Jersey', 'sample'),
  ('Reversible Liga Jersey', 'basketball'),
  ('Reversible Liga Jersey', 'jersey'),
  ('Reversible Liga Jersey', 'reversible'),
  ('Sublimated Basketball Jersey', 'sample'),
  ('Sublimated Basketball Jersey', 'basketball'),
  ('Sublimated Basketball Jersey', 'jersey'),
  ('Sublimated Basketball Jersey', 'sublimation'),
  ('Basketball Shorts', 'sample'),
  ('Basketball Shorts', 'basketball'),
  ('Basketball Shorts', 'shorts'),
  ('Practice Pinnie', 'sample'),
  ('Practice Pinnie', 'basketball'),
  ('Practice Pinnie', 'training'),
  ('Practice Pinnie', 'pinnie'),
  ('Volleyball Jersey', 'sample'),
  ('Volleyball Jersey', 'volleyball'),
  ('Volleyball Jersey', 'jersey'),
  ('Volleyball Spandex Shorts', 'sample'),
  ('Volleyball Spandex Shorts', 'volleyball'),
  ('Volleyball Spandex Shorts', 'shorts'),
  ('Volleyball Spandex Shorts', 'spandex'),
  ('Sepak Takraw Jersey', 'sample'),
  ('Sepak Takraw Jersey', 'sepak takraw'),
  ('Sepak Takraw Jersey', 'jersey'),
  ('Esports Jersey', 'sample'),
  ('Esports Jersey', 'esports'),
  ('Esports Jersey', 'jersey'),
  ('Esports Jersey', 'long sleeve'),
  ('Dri-fit Practice Tee', 'sample'),
  ('Dri-fit Practice Tee', 'tee'),
  ('Dri-fit Practice Tee', 'dri-fit'),
  ('Dri-fit Practice Tee', 'training'),
  ('Classic Polo Shirt', 'sample'),
  ('Classic Polo Shirt', 'polo'),
  ('Classic Polo Shirt', 'uniform'),
  ('Warmer Jacket', 'sample'),
  ('Warmer Jacket', 'jacket'),
  ('Warmer Jacket', 'warmer'),
  ('Warmer Jacket', 'team'),
  ('Pullover Hoodie', 'sample'),
  ('Pullover Hoodie', 'hoodie'),
  ('Pullover Hoodie', 'team'),
  ('Arm Sleeve', 'sample'),
  ('Arm Sleeve', 'accessory'),
  ('Arm Sleeve', 'arm sleeve'),
  ('Arm Sleeve', 'basketball'),
  ('Crew Socks (3 pairs)', 'sample'),
  ('Crew Socks (3 pairs)', 'accessory'),
  ('Crew Socks (3 pairs)', 'socks'),
  ('Sports Headband', 'sample'),
  ('Sports Headband', 'accessory'),
  ('Sports Headband', 'headband'),
  ('Team Cap', 'sample'),
  ('Team Cap', 'accessory'),
  ('Team Cap', 'cap')
) as v (name, tag)
join _sample s using (name);

-- Primary images: sample illustrations shipped in public/samples/
insert into public.product_images (product_id, image_url, is_primary)
select s.id, v.image_url, true
from (values
  ('Reversible Liga Jersey', '/samples/reversible-liga-jersey.svg'),
  ('Sublimated Basketball Jersey', '/samples/sublimated-basketball-jersey.svg'),
  ('Basketball Shorts', '/samples/basketball-shorts.svg'),
  ('Practice Pinnie', '/samples/practice-pinnie.svg'),
  ('Volleyball Jersey', '/samples/volleyball-jersey.svg'),
  ('Volleyball Spandex Shorts', '/samples/volleyball-spandex-shorts.svg'),
  ('Sepak Takraw Jersey', '/samples/sepak-takraw-jersey.svg'),
  ('Esports Jersey', '/samples/esports-jersey.svg'),
  ('Dri-fit Practice Tee', '/samples/dri-fit-practice-tee.svg'),
  ('Classic Polo Shirt', '/samples/classic-polo-shirt.svg'),
  ('Warmer Jacket', '/samples/warmer-jacket.svg'),
  ('Pullover Hoodie', '/samples/pullover-hoodie.svg'),
  ('Arm Sleeve', '/samples/arm-sleeve.svg'),
  ('Crew Socks (3 pairs)', '/samples/crew-socks-3-pairs.svg'),
  ('Sports Headband', '/samples/sports-headband.svg'),
  ('Team Cap', '/samples/team-cap.svg')
) as v (name, image_url)
join _sample s using (name);

-- Variants: one per size and color
insert into public.product_variants (product_id, size, color, sku, price, stock_quantity, low_stock_threshold)
select s.id, v.size, v.color, v.sku, v.price, v.stock, 5
from (values
  ('Reversible Liga Jersey', 'S', 'Black', 'JRS-REV-BLK-S', 650.00, 1),
  ('Reversible Liga Jersey', 'M', 'Black', 'JRS-REV-BLK-M', 650.00, 7),
  ('Reversible Liga Jersey', 'L', 'Black', 'JRS-REV-BLK-L', 650.00, 15),
  ('Reversible Liga Jersey', 'XL', 'Black', 'JRS-REV-BLK-XL', 650.00, 18),
  ('Reversible Liga Jersey', '2XL', 'Black', 'JRS-REV-BLK-2XL', 700.00, 14),
  ('Reversible Liga Jersey', 'S', 'Royal', 'JRS-REV-ROY-S', 650.00, 22),
  ('Reversible Liga Jersey', 'M', 'Royal', 'JRS-REV-ROY-M', 650.00, 12),
  ('Reversible Liga Jersey', 'L', 'Royal', 'JRS-REV-ROY-L', 650.00, 10),
  ('Reversible Liga Jersey', 'XL', 'Royal', 'JRS-REV-ROY-XL', 650.00, 21),
  ('Reversible Liga Jersey', '2XL', 'Royal', 'JRS-REV-ROY-2XL', 700.00, 10),
  ('Sublimated Basketball Jersey', 'S', 'Court green', 'JRS-SUB-GRN-S', 850.00, 18),
  ('Sublimated Basketball Jersey', 'M', 'Court green', 'JRS-SUB-GRN-M', 850.00, 25),
  ('Sublimated Basketball Jersey', 'L', 'Court green', 'JRS-SUB-GRN-L', 850.00, 17),
  ('Sublimated Basketball Jersey', 'XL', 'Court green', 'JRS-SUB-GRN-XL', 850.00, 12),
  ('Sublimated Basketball Jersey', '2XL', 'Court green', 'JRS-SUB-GRN-2XL', 900.00, 12),
  ('Sublimated Basketball Jersey', 'S', 'Maroon', 'JRS-SUB-MRN-S', 850.00, 9),
  ('Sublimated Basketball Jersey', 'M', 'Maroon', 'JRS-SUB-MRN-M', 850.00, 13),
  ('Sublimated Basketball Jersey', 'L', 'Maroon', 'JRS-SUB-MRN-L', 850.00, 11),
  ('Sublimated Basketball Jersey', 'XL', 'Maroon', 'JRS-SUB-MRN-XL', 850.00, 14),
  ('Sublimated Basketball Jersey', '2XL', 'Maroon', 'JRS-SUB-MRN-2XL', 900.00, 18),
  ('Basketball Shorts', 'S', 'Black', 'SHR-BB-BLK-S', 450.00, 14),
  ('Basketball Shorts', 'M', 'Black', 'SHR-BB-BLK-M', 450.00, 12),
  ('Basketball Shorts', 'L', 'Black', 'SHR-BB-BLK-L', 450.00, 10),
  ('Basketball Shorts', 'XL', 'Black', 'SHR-BB-BLK-XL', 450.00, 2),
  ('Basketball Shorts', '2XL', 'Black', 'SHR-BB-BLK-2XL', 500.00, 13),
  ('Basketball Shorts', 'S', 'Navy', 'SHR-BB-NVY-S', 450.00, 8),
  ('Basketball Shorts', 'M', 'Navy', 'SHR-BB-NVY-M', 450.00, 10),
  ('Basketball Shorts', 'L', 'Navy', 'SHR-BB-NVY-L', 450.00, 19),
  ('Basketball Shorts', 'XL', 'Navy', 'SHR-BB-NVY-XL', 450.00, 0),
  ('Basketball Shorts', '2XL', 'Navy', 'SHR-BB-NVY-2XL', 500.00, 13),
  ('Practice Pinnie', 'S', 'Neon yellow', 'PIN-MSH-NYL-S', 280.00, 1),
  ('Practice Pinnie', 'M', 'Neon yellow', 'PIN-MSH-NYL-M', 280.00, 7),
  ('Practice Pinnie', 'L', 'Neon yellow', 'PIN-MSH-NYL-L', 280.00, 13),
  ('Practice Pinnie', 'XL', 'Neon yellow', 'PIN-MSH-NYL-XL', 280.00, 14),
  ('Practice Pinnie', 'S', 'Orange', 'PIN-MSH-ORG-S', 280.00, 18),
  ('Practice Pinnie', 'M', 'Orange', 'PIN-MSH-ORG-M', 280.00, 17),
  ('Practice Pinnie', 'L', 'Orange', 'PIN-MSH-ORG-L', 280.00, 14),
  ('Practice Pinnie', 'XL', 'Orange', 'PIN-MSH-ORG-XL', 280.00, 14),
  ('Volleyball Jersey', 'XS', 'White', 'JRS-VB-WHT-XS', 600.00, 25),
  ('Volleyball Jersey', 'S', 'White', 'JRS-VB-WHT-S', 600.00, 16),
  ('Volleyball Jersey', 'M', 'White', 'JRS-VB-WHT-M', 600.00, 6),
  ('Volleyball Jersey', 'L', 'White', 'JRS-VB-WHT-L', 600.00, 0),
  ('Volleyball Jersey', 'XL', 'White', 'JRS-VB-WHT-XL', 600.00, 25),
  ('Volleyball Jersey', 'XS', 'Red', 'JRS-VB-RED-XS', 600.00, 16),
  ('Volleyball Jersey', 'S', 'Red', 'JRS-VB-RED-S', 600.00, 24),
  ('Volleyball Jersey', 'M', 'Red', 'JRS-VB-RED-M', 600.00, 11),
  ('Volleyball Jersey', 'L', 'Red', 'JRS-VB-RED-L', 600.00, 10),
  ('Volleyball Jersey', 'XL', 'Red', 'JRS-VB-RED-XL', 600.00, 15),
  ('Volleyball Spandex Shorts', 'XS', 'Black', 'SHR-VB-BLK-XS', 350.00, 23),
  ('Volleyball Spandex Shorts', 'S', 'Black', 'SHR-VB-BLK-S', 350.00, 25),
  ('Volleyball Spandex Shorts', 'M', 'Black', 'SHR-VB-BLK-M', 350.00, 19),
  ('Volleyball Spandex Shorts', 'L', 'Black', 'SHR-VB-BLK-L', 350.00, 9),
  ('Volleyball Spandex Shorts', 'XL', 'Black', 'SHR-VB-BLK-XL', 350.00, 12),
  ('Sepak Takraw Jersey', 'S', 'Blue', 'JRS-ST-BLU-S', 550.00, 10),
  ('Sepak Takraw Jersey', 'M', 'Blue', 'JRS-ST-BLU-M', 550.00, 17),
  ('Sepak Takraw Jersey', 'L', 'Blue', 'JRS-ST-BLU-L', 550.00, 26),
  ('Sepak Takraw Jersey', 'XL', 'Blue', 'JRS-ST-BLU-XL', 550.00, 15),
  ('Sepak Takraw Jersey', 'S', 'Yellow', 'JRS-ST-YLW-S', 550.00, 20),
  ('Sepak Takraw Jersey', 'M', 'Yellow', 'JRS-ST-YLW-M', 550.00, 23),
  ('Sepak Takraw Jersey', 'L', 'Yellow', 'JRS-ST-YLW-L', 550.00, 17),
  ('Sepak Takraw Jersey', 'XL', 'Yellow', 'JRS-ST-YLW-XL', 550.00, 6),
  ('Esports Jersey', 'S', 'Black', 'JRS-ES-BLK-S', 750.00, 5),
  ('Esports Jersey', 'M', 'Black', 'JRS-ES-BLK-M', 750.00, 7),
  ('Esports Jersey', 'L', 'Black', 'JRS-ES-BLK-L', 750.00, 25),
  ('Esports Jersey', 'XL', 'Black', 'JRS-ES-BLK-XL', 750.00, 24),
  ('Esports Jersey', '2XL', 'Black', 'JRS-ES-BLK-2XL', 800.00, 24),
  ('Esports Jersey', '3XL', 'Black', 'JRS-ES-BLK-3XL', 800.00, 16),
  ('Esports Jersey', 'S', 'White', 'JRS-ES-WHT-S', 750.00, 22),
  ('Esports Jersey', 'M', 'White', 'JRS-ES-WHT-M', 750.00, 15),
  ('Esports Jersey', 'L', 'White', 'JRS-ES-WHT-L', 750.00, 22),
  ('Esports Jersey', 'XL', 'White', 'JRS-ES-WHT-XL', 750.00, 16),
  ('Esports Jersey', '2XL', 'White', 'JRS-ES-WHT-2XL', 800.00, 24),
  ('Esports Jersey', '3XL', 'White', 'JRS-ES-WHT-3XL', 800.00, 18),
  ('Dri-fit Practice Tee', 'S', 'Court green', 'TEE-DF-GRN-S', 380.00, 20),
  ('Dri-fit Practice Tee', 'M', 'Court green', 'TEE-DF-GRN-M', 380.00, 0),
  ('Dri-fit Practice Tee', 'L', 'Court green', 'TEE-DF-GRN-L', 380.00, 23),
  ('Dri-fit Practice Tee', 'XL', 'Court green', 'TEE-DF-GRN-XL', 380.00, 22),
  ('Dri-fit Practice Tee', '2XL', 'Court green', 'TEE-DF-GRN-2XL', 430.00, 15),
  ('Dri-fit Practice Tee', 'S', 'Heather gray', 'TEE-DF-HGR-S', 380.00, 18),
  ('Dri-fit Practice Tee', 'M', 'Heather gray', 'TEE-DF-HGR-M', 380.00, 12),
  ('Dri-fit Practice Tee', 'L', 'Heather gray', 'TEE-DF-HGR-L', 380.00, 24),
  ('Dri-fit Practice Tee', 'XL', 'Heather gray', 'TEE-DF-HGR-XL', 380.00, 16),
  ('Dri-fit Practice Tee', '2XL', 'Heather gray', 'TEE-DF-HGR-2XL', 430.00, 19),
  ('Dri-fit Practice Tee', 'S', 'Black', 'TEE-DF-BLK-S', 380.00, 7),
  ('Dri-fit Practice Tee', 'M', 'Black', 'TEE-DF-BLK-M', 380.00, 22),
  ('Dri-fit Practice Tee', 'L', 'Black', 'TEE-DF-BLK-L', 380.00, 7),
  ('Dri-fit Practice Tee', 'XL', 'Black', 'TEE-DF-BLK-XL', 380.00, 0),
  ('Dri-fit Practice Tee', '2XL', 'Black', 'TEE-DF-BLK-2XL', 430.00, 19),
  ('Classic Polo Shirt', 'S', 'White', 'POL-CL-WHT-S', 550.00, 22),
  ('Classic Polo Shirt', 'M', 'White', 'POL-CL-WHT-M', 550.00, 15),
  ('Classic Polo Shirt', 'L', 'White', 'POL-CL-WHT-L', 550.00, 20),
  ('Classic Polo Shirt', 'XL', 'White', 'POL-CL-WHT-XL', 550.00, 15),
  ('Classic Polo Shirt', '2XL', 'White', 'POL-CL-WHT-2XL', 600.00, 23),
  ('Classic Polo Shirt', 'S', 'Navy', 'POL-CL-NVY-S', 550.00, 5),
  ('Classic Polo Shirt', 'M', 'Navy', 'POL-CL-NVY-M', 550.00, 11),
  ('Classic Polo Shirt', 'L', 'Navy', 'POL-CL-NVY-L', 550.00, 10),
  ('Classic Polo Shirt', 'XL', 'Navy', 'POL-CL-NVY-XL', 550.00, 24),
  ('Classic Polo Shirt', '2XL', 'Navy', 'POL-CL-NVY-2XL', 600.00, 25),
  ('Warmer Jacket', 'S', 'Black', 'JKT-WRM-BLK-S', 1250.00, 16),
  ('Warmer Jacket', 'M', 'Black', 'JKT-WRM-BLK-M', 1250.00, 2),
  ('Warmer Jacket', 'L', 'Black', 'JKT-WRM-BLK-L', 1250.00, 25),
  ('Warmer Jacket', 'XL', 'Black', 'JKT-WRM-BLK-XL', 1250.00, 22),
  ('Warmer Jacket', '2XL', 'Black', 'JKT-WRM-BLK-2XL', 1300.00, 2),
  ('Warmer Jacket', 'S', 'Charcoal', 'JKT-WRM-CHR-S', 1250.00, 15),
  ('Warmer Jacket', 'M', 'Charcoal', 'JKT-WRM-CHR-M', 1250.00, 16),
  ('Warmer Jacket', 'L', 'Charcoal', 'JKT-WRM-CHR-L', 1250.00, 17),
  ('Warmer Jacket', 'XL', 'Charcoal', 'JKT-WRM-CHR-XL', 1250.00, 0),
  ('Warmer Jacket', '2XL', 'Charcoal', 'JKT-WRM-CHR-2XL', 1300.00, 26),
  ('Pullover Hoodie', 'S', 'Black', 'HOD-PO-BLK-S', 950.00, 14),
  ('Pullover Hoodie', 'M', 'Black', 'HOD-PO-BLK-M', 950.00, 12),
  ('Pullover Hoodie', 'L', 'Black', 'HOD-PO-BLK-L', 950.00, 12),
  ('Pullover Hoodie', 'XL', 'Black', 'HOD-PO-BLK-XL', 950.00, 15),
  ('Pullover Hoodie', '2XL', 'Black', 'HOD-PO-BLK-2XL', 1000.00, 21),
  ('Pullover Hoodie', 'S', 'Ash gray', 'HOD-PO-ASH-S', 950.00, 4),
  ('Pullover Hoodie', 'M', 'Ash gray', 'HOD-PO-ASH-M', 950.00, 21),
  ('Pullover Hoodie', 'L', 'Ash gray', 'HOD-PO-ASH-L', 950.00, 25),
  ('Pullover Hoodie', 'XL', 'Ash gray', 'HOD-PO-ASH-XL', 950.00, 10),
  ('Pullover Hoodie', '2XL', 'Ash gray', 'HOD-PO-ASH-2XL', 1000.00, 12),
  ('Arm Sleeve', 'S/M', 'Black', 'ACC-SLV-BLK-SM', 150.00, 9),
  ('Arm Sleeve', 'L/XL', 'Black', 'ACC-SLV-BLK-LXL', 150.00, 26),
  ('Arm Sleeve', 'S/M', 'White', 'ACC-SLV-WHT-SM', 150.00, 19),
  ('Arm Sleeve', 'L/XL', 'White', 'ACC-SLV-WHT-LXL', 150.00, 12),
  ('Crew Socks (3 pairs)', 'Free size', 'White', 'ACC-SCK-WHT-FS', 220.00, 9),
  ('Crew Socks (3 pairs)', 'Free size', 'Black', 'ACC-SCK-BLK-FS', 220.00, 10),
  ('Sports Headband', 'One size', 'Black', 'ACC-HB-BLK-OS', 90.00, 6),
  ('Sports Headband', 'One size', 'White', 'ACC-HB-WHT-OS', 90.00, 23),
  ('Sports Headband', 'One size', 'Red', 'ACC-HB-RED-OS', 90.00, 13),
  ('Team Cap', 'Adjustable', 'Black', 'ACC-CAP-BLK-ADJ', 320.00, 26),
  ('Team Cap', 'Adjustable', 'Navy', 'ACC-CAP-NVY-ADJ', 320.00, 2)
) as v (name, size, color, sku, price, stock)
join _sample s using (name);

-- Opening stock, logged like a restock so inventory history starts complete.
-- (The automatic opening-stock log only runs for signed-in staff, not the SQL editor.)
insert into public.inventory_transactions
  (variant_id, transaction_type, quantity, previous_stock, new_stock, reason, created_by)
select pv.id, 'restock', pv.stock_quantity, 0, pv.stock_quantity, 'Opening stock (sample data)',
       (select id from public.profiles where role = 'owner' order by created_at limit 1)
from public.product_variants pv
join _sample s on s.id = pv.product_id
where pv.stock_quantity > 0;

commit;

-- Loaded: 16 products, 129 variants (5 sold out, 9 low).
