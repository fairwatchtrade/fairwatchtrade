import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migrationFiles = readdirSync(new URL('../supabase/migrations/', import.meta.url))
  .filter((name) => name.endsWith('_dealer_room_publication_is_a_founder_act.sql'));

test('publication is a separate default-private database fact with deliberate backfill', () => {
  assert.equal(migrationFiles.length, 1, 'one migration must introduce Dealer Room publication');
  const sql = read(`supabase/migrations/${migrationFiles[0]}`);
  assert.match(sql, /public_room_enabled boolean not null default false/i);
  assert.match(sql, /set public_room_enabled = true\s+where slug in \('the-collector-identity', 'williams-watches'\)/i);
  assert.match(sql, /for select\s+to anon, authenticated\s+using \(public_room_enabled = true\)/i);
  assert.match(sql, /dealer_profiles_owner_read[\s\S]*for select\s+to authenticated\s+using \(seller_id = auth.uid\(\)\)/i);
  assert.doesNotMatch(sql, /grant\s+update/i);
  const admission = read('supabase/migrations/20260909120000_dealer_profiles_admission_is_a_founder_act.sql');
  assert.doesNotMatch(admission, /public_room_enabled/);
});

test('page and discovery readers consume publication without changing Level 2 access', () => {
  const page = read('app/sellers/[id]/page.tsx');
  assert.match(page, /select\("seller_id,slug,business_name,logo_url,location,tagline,public_room_enabled"\)/);
  assert.match(page, /dealer.public_room_enabled === true/);
  assert.match(page, /unpublishedDealerProfileMetadata\(\)/);
  assert.match(page, /Dealer Room not public/);
  assert.match(page, /Only you and FairWatchTrade can view this Dealer Room until FairWatchTrade publishes it\./);
  assert.match(read('app/sitemap.ts'), /\.eq\("public_room_enabled", true\)/);
  assert.doesNotMatch(read('lib/dealerAccess.ts'), /public_room_enabled/);
  assert.match(read('lib/seo/README.md'), /Public Dealer Room truth is `public_room_enabled`/);
  assert.doesNotMatch(read('lib/seo/README.md'), /dealer row → index|no second gate/);
});

test('founder has a gated room, doorway and single-field publication API', () => {
  for (const path of ['app/admin/dealers/page.tsx', 'app/api/admin/dealers/publication/route.ts', 'components/DealerRoomPublicationControl.tsx']) {
    assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), `${path} must exist`);
  }
  const api = read('app/api/admin/dealers/publication/route.ts');
  const gate = api.indexOf('user.id !== ADMIN_USER_ID');
  assert.ok(gate > 0 && gate < api.indexOf('createServiceClient();'));
  assert.match(api, /\.update\(\{ public_room_enabled: body.enabled \}\)/);
  assert.match(api, /\.eq\("seller_id", sellerId\)/);
  assert.match(api, /dealer_not_found/);
  const room = read('app/admin/dealers/page.tsx');
  assert.ok(room.indexOf('user.id !== ADMIN_USER_ID') < room.indexOf('createServiceClient();'));
  const control = read('components/DealerRoomPublicationControl.tsx');
  assert.match(control, /Publish Dealer Room/);
  assert.match(control, /Make Dealer Room Private/);
  assert.match(control, /unconfirmed/i);
  assert.match(read('components/MarketplaceControl.tsx'), /href="\/admin\/dealers"/);
});
