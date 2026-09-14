// Execute the actual route modules with deterministic database/session boundaries.
// PostgreSQL behavior is tested separately by dealer-room-publication.test.sql.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as metadata from '../lib/seo/routeMetadata.ts';
import * as sitemapPolicy from '../lib/seo/sitemap.ts';

const require = createRequire(import.meta.url);
const FOUNDER = '77a6893a-54fe-4373-9bf7-3327d0ba69cf';
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const fixture = (enabled) => ({ seller_id: OWNER, slug: 'fixture-dealer', business_name: 'Private Fixture Business', logo_url: null, location: 'Fixture location', tagline: 'Fixture tagline', admitted_at: '2026-09-01T00:00:00Z', public_room_enabled: enabled });

function load(path, dependencies) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const loaded = { exports: {} };
  const localRequire = (id) => {
    if (Object.hasOwn(dependencies, id)) {
      const dep = dependencies[id];
      return Object.hasOwn(dep, 'default') ? { __esModule: true, ...dep } : dep;
    }
    if (id.startsWith('@/')) throw new Error(`Unprovided boundary: ${id}`);
    return require(id);
  };
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename: path })(localRequire, loaded, loaded.exports);
  return loaded.exports;
}

// Only the Supabase boundary is replaced: queries and access intent remain real.
function database({ userId = null, dealer = null, service = false, calls = [], fail = false }) {
  return {
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }) },
    from(table) {
      assert.ok(['dealer_profiles', 'public_seller_profiles', 'listings'].includes(table));
      const query = { table, filters: [], columns: '', update: null };
      calls.push(query);
      const run = () => {
        if (fail) return { data: null, error: { message: 'injected database failure' } };
        let rows = table === 'dealer_profiles' ? (dealer ? [dealer] : [])
          : table === 'public_seller_profiles' ? [{ id: OWNER, display_name: 'Ordinary Seller', created_at: '2026-01-01' }] : [];
        if (table === 'dealer_profiles' && !service) rows = rows.filter((row) => row.public_room_enabled === true || row.seller_id === userId);
        rows = rows.filter((row) => query.filters.every(([key, value]) => row[key] === value));
        if (query.update) rows.forEach((row) => Object.assign(row, query.update));
        const fields = query.columns.split(',').map((s) => s.trim());
        return { data: rows.map((row) => query.columns === '*' ? { ...row } : Object.fromEntries(fields.map((key) => [key, row[key]]))), error: null };
      };
      const builder = {
        select(columns) { query.columns = columns; return builder; },
        eq(key, value) { query.filters.push([key, value]); return builder; },
        order() { return builder; }, limit() { return builder; },
        update(values) { assert.equal(service, true, 'client must never perform publication write'); query.update = values; return builder; },
        async maybeSingle() { const result = run(); return { ...result, data: result.data?.[0] ?? null }; },
        async single() { return builder.maybeSingle(); },
        then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
      };
      return builder;
    },
  };
}

function boundary(userId, dealer, { fail = false } = {}) {
  let serviceReads = 0;
  const calls = [];
  const session = database({ userId, dealer, calls });
  return {
    calls, serviceCount: () => serviceReads,
    deps: {
      '@/lib/supabase/server': { createClient: async () => session },
      '@/lib/supabase/service': { createServiceClient: () => { serviceReads++; assert.equal(userId, FOUNDER, 'trusted client must follow founder authorization'); return database({ dealer, service: true, calls, fail }); } },
    },
  };
}

const navigation = {
  redirect(path) { throw new Error(`REDIRECT:${path}`); },
  notFound() { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh() {} }),
};
const Browse = () => null;
const Seller = () => null;
function findElement(node, type) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === type) return node;
  for (const child of React.Children.toArray(node.props?.children)) {
    const match = findElement(child, type); if (match) return match;
  }
  return null;
}

test('actual publication POST enforces auth, validation, target and exact resulting state', async () => {
  for (const [userId, body, expected] of [
    [null, { sellerId: OWNER, enabled: true }, 401],
    [OTHER, { sellerId: OWNER, enabled: true }, 403],
    [OWNER, { sellerId: OWNER, enabled: true }, 403],
    [FOUNDER, null, 400], [FOUNDER, [], 400], [FOUNDER, {}, 400],
    [FOUNDER, { sellerId: 'slug', enabled: true }, 400],
    [FOUNDER, { sellerId: OWNER, enabled: 'true' }, 400],
    [FOUNDER, { sellerId: OWNER }, 400],
  ]) {
    const b = boundary(userId, fixture(false));
    const { POST } = load('app/api/admin/dealers/publication/route.ts', b.deps);
    const response = await POST(new Request('http://test/api', { method: 'POST', body: JSON.stringify(body) }));
    assert.equal(response.status, expected);
    assert.equal(b.serviceCount(), 0);
  }
  for (const enabled of [true, false]) {
    const row = fixture(!enabled);
    const b = boundary(FOUNDER, row);
    const { POST } = load('app/api/admin/dealers/publication/route.ts', b.deps);
    const response = await POST(new Request('http://test/api', { method: 'POST', body: JSON.stringify({ sellerId: OWNER, enabled, business_name: 'attacker', admitted_by: OTHER }) }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { dealer: { seller_id: OWNER, slug: 'fixture-dealer', business_name: 'Private Fixture Business', public_room_enabled: enabled } });
    assert.deepEqual(b.calls[0].update, { public_room_enabled: enabled });
    assert.deepEqual(b.calls[0].filters, [['seller_id', OWNER]]);
    assert.equal(row.business_name, 'Private Fixture Business');
  }
  for (const [dealer, fail, expected, error] of [[null, false, 404, 'dealer_not_found'], [fixture(false), true, 500, 'publication_unconfirmed']]) {
    const b = boundary(FOUNDER, dealer, { fail });
    const { POST } = load('app/api/admin/dealers/publication/route.ts', b.deps);
    const response = await POST(new Request('http://test/api', { method: 'POST', body: JSON.stringify({ sellerId: OWNER, enabled: true }) }));
    assert.equal(response.status, expected); assert.equal((await response.json()).error, error);
  }
});

test('actual seller page and metadata enforce public/private slug and UUID matrix', async () => {
  for (const enabled of [true, false]) for (const userId of [null, OTHER, OWNER, FOUNDER]) for (const id of ['fixture-dealer', OWNER]) {
    const b = boundary(userId, fixture(enabled));
    const page = load('app/sellers/[id]/page.tsx', { ...b.deps, 'next/navigation': navigation, '@/lib/seo/routeMetadata': metadata, '@/components/BrowseClient': { default: Browse }, '@/components/SellerProfile': { default: Seller } });
    const args = { params: Promise.resolve({ id }) };
    const meta = await page.generateMetadata(args);
    const visible = enabled || userId === OWNER || userId === FOUNDER;
    if (enabled) {
      assert.equal(meta.robots.index, true);
      assert.equal(meta.alternates.canonical, 'https://www.fairwatchtrade.com/sellers/fixture-dealer');
      if (id === OWNER) { await assert.rejects(page.default(args), /REDIRECT:\/sellers\/fixture-dealer/); continue; }
    } else {
      assert.equal(meta.robots.index, false);
      assert.ok(!JSON.stringify(meta).includes('Private Fixture Business'));
      assert.ok(!JSON.stringify(meta).includes('/sellers/fixture-dealer'));
    }
    if (!visible && id === 'fixture-dealer') { await assert.rejects(page.default(args), /NOT_FOUND/); }
    else {
      const tree = await page.default(args);
      if (visible) {
        const browse = findElement(tree, Browse);
        assert.equal(browse.props.dealerScope.sellerId, OWNER);
        assert.equal(renderToStaticMarkup(tree).includes('Dealer Room not public'), !enabled);
        assert.ok(b.calls.some((q) => q.table === 'listings' && q.filters.some(([k,v]) => k === 'seller_id' && v === OWNER) && q.filters.some(([k,v]) => k === 'status' && v === 'published')));
      } else {
        assert.equal(tree.type, Seller);
        assert.equal(tree.props.seller.displayName, 'Ordinary Seller');
        assert.equal(findElement(tree, Browse), null);
      }
    }
    if (userId !== FOUNDER) assert.equal(b.serviceCount(), 0);
    if (userId === FOUNDER && !enabled) assert.ok(b.serviceCount() > 0);
  }
});

test('actual founder room gates service access and renders both publication actions', async () => {
  const control = load('components/DealerRoomPublicationControl.tsx', { 'next/navigation': navigation }).default;
  const Link = ({ children, ...props }) => React.createElement('a', props, children);
  for (const userId of [null, OWNER, OTHER]) {
    const b = boundary(userId, fixture(false));
    const page = load('app/admin/dealers/page.tsx', { ...b.deps, 'next/navigation': navigation, 'next/link': { default: Link }, '@/components/DealerRoomPublicationControl': { default: control } });
    await assert.rejects(page.default(), /REDIRECT:\//); assert.equal(b.serviceCount(), 0);
  }
  for (const enabled of [true, false]) {
    const b = boundary(FOUNDER, fixture(enabled));
    const page = load('app/admin/dealers/page.tsx', { ...b.deps, 'next/navigation': navigation, 'next/link': { default: Link }, '@/components/DealerRoomPublicationControl': { default: control } });
    const html = renderToStaticMarkup(await page.default());
    assert.match(html, /Dealer Rooms/); assert.match(html, /Private Fixture Business/); assert.match(html, /Sep 1, 2026/);
    assert.ok(html.includes(enabled ? 'Make Dealer Room Private' : 'Publish Dealer Room'));
    assert.ok(html.includes(enabled ? '>Public<' : '>Private<'));
  }
});

test('actual sitemap route filters publication on the anonymous discovery path', async () => {
  for (const enabled of [true, false]) {
    const calls = [];
    const db = database({ dealer: fixture(enabled), service: true, calls }); // bypass RLS so missing reader filter cannot pass accidentally
    const route = load('app/sitemap.ts', { '@/lib/discovery/publicDiscovery': { createDiscoveryClient: () => db }, '@/lib/seo/sitemap': sitemapPolicy });
    const entries = await route.default();
    assert.equal(entries.filter((entry) => entry.url.endsWith('/sellers/fixture-dealer')).length, enabled ? 1 : 0);
    assert.ok(calls.find((q) => q.table === 'dealer_profiles').filters.some(([key, value]) => key === 'public_room_enabled' && value === true));
    assert.ok(entries.every((entry) => !entry.url.includes(OWNER)));
  }
});
