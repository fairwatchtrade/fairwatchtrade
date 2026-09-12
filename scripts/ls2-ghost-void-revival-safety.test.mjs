/* LS2 — bounded Ghost/Void functional misuse and dormant-revival safety.
   Run: node scripts/ls2-ghost-void-revival-safety.test.mjs

   This contract inspects only the adjudicated historical owners. Each label
   names the realistic mutation it catches. */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const normalized = (source) => source.replace(/\s+/g, " ").trim();
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function unsafePaint(className, allowedColorClasses = []) {
  return className.split(/\s+/).some((token) => {
    if (allowedColorClasses.includes(token)) return false;
    const utility = token.split(":").at(-1);
    return /^(?:opacity-(?!100$)|filter(?:$|-)|brightness-|contrast-|saturate-|grayscale|invert|sepia|text-(?:\[|white$|black$))/.test(utility);
  });
}
const assertAnchor = (path, expression, label) => assert.match(normalized(read(path)), expression, label);
const tree = (path) => ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const jsxName = (node) => node.tagName.getText();
const attr = (opening, name) => opening.attributes.properties.find((property) => ts.isJsxAttribute(property) && property.name.text === name);
function attrText(source, opening, name) {
  const property = attr(opening, name);
  return property?.initializer ? source.slice(property.initializer.getStart(), property.initializer.getEnd()) : null;
}
function classText(source, opening) {
  const value = attrText(source, opening, "className");
  return value?.slice(1, -1) ?? null;
}
function assertPaintSafe(source, opening, label, { allowColorStyle = false, allowedColorClasses = [] } = {}) {
  const className = classText(source, opening);
  assert.notEqual(className, null, `${label} has a source-derived className`);
  assert.ok(!unsafePaint(className, allowedColorClasses), `${label} has no opacity, filter, or unruled class color override`);
  const style = attrText(source, opening, "style");
  assert.ok(!style || (!/opacity|filter/.test(style) && (allowColorStyle || !/color\s*:/.test(style))), `${label} has no opacity/filter/color style override`);
}
function findOpening(sourceFile, predicate) {
  let match;
  const visit = (node) => {
    if (!match && (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && predicate(node)) match = node;
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  assert.ok(match, "expected JSX node exists");
  return match;
}
function jsxAncestors(node) {
  const ancestors = [];
  for (let parent = node.parent; parent; parent = parent.parent) if (ts.isJsxElement(parent) && parent.openingElement !== node) ancestors.push(parent.openingElement);
  return ancestors;
}

const curation = read("components/CurationReviewCard.tsx");
const bell = read("components/NotificationsBell.tsx");
const rail = read("components/ListingActionRail.tsx");
const listingPage = read("app/listings/[id]/page.tsx");
const nav = read("components/NavBar.tsx");

assert.match(normalized(curation), /<p className="fw-transaction-fact mt-2 uppercase text-\[var\(--muted\)\]"> Updated/, "completed public Curation timestamp uses --muted, not below-floor Ghost");
assert.match(normalized(bell), /style=\{\{ color: hasUnread \? "#C9A84C" : "var\(--muted\)" \}\}/, "enabled zero-unread Bell uses --muted, not below-floor Ghost");

// Catches removal/rerouting or any inserted dimming wrapper on the actual
// ordinary-user Curation chain, derived from JSX ancestry rather than copies.
const pageTree = tree("app/listings/[id]/page.tsx");
const railNode = findOpening(pageTree, (node) => jsxName(node) === "ListingActionRail" && attrText(listingPage, node, "variant") === '"rail"' && attrText(listingPage, node, "curation") === "{curation}");
const pageChain = jsxAncestors(railNode).filter((opening) => /^[a-z]/.test(jsxName(opening)));
assert.deepEqual(pageChain.map(jsxName), ["aside", "div", "div", "main"], "page → outer container → opening grid → rail aside is the exact Curation ancestor sequence");
const expectedPageClasses = [
  "hidden min-[56rem]:col-start-2 min-[56rem]:row-start-1 min-[56rem]:row-span-2 min-[56rem]:mt-[112px] min-[56rem]:grid min-[56rem]:-translate-x-[54px] min-[56rem]:gap-[14px] min-[56rem]:self-start",
  "relative min-[56rem]:grid min-[56rem]:grid-cols-[minmax(0,974px)_clamp(224px,20vw,276px)] min-[56rem]:grid-rows-[auto_auto] min-[56rem]:items-start min-[56rem]:gap-x-[var(--space-6)] min-[56rem]:gap-y-0",
  "relative mx-auto w-full max-w-3xl px-6 py-8 sm:px-8 min-[56rem]:ml-[50px] min-[56rem]:mr-0 min-[56rem]:w-[calc(100%_-_50px)] min-[56rem]:max-w-none min-[67rem]:mx-auto min-[67rem]:w-full min-[67rem]:max-w-[1438px] min-[67rem]:pl-[82px] min-[67rem]:pr-6",
  "min-h-screen bg-[var(--ink)] pb-32 text-[var(--platinum)]",
];
for (const [index, opening] of pageChain.entries()) {
  assert.equal(classText(listingPage, opening), expectedPageClasses[index], `Curation ancestor ${jsxName(opening)} keeps its exact source class`);
  assertPaintSafe(listingPage, opening, `Curation ancestor ${jsxName(opening)}`, {
    allowedColorClasses: index === 3 ? ["text-[var(--platinum)]"] : [],
  });
}
assert.match(normalized(rail), /import CurationReviewCard from "@\/components\/CurationReviewCard";/, "rail imports Curation card");
assert.match(normalized(rail), /\{curation && \( <CurationReviewCard listingId=\{listingId\} signedIn=\{curation\.signedIn\} initialState=\{curation\.state\} summary=\{curation\.summary\} \/> \)\}/, "rail renders Curation through its bounded branch");
const curationTree = tree("components/CurationReviewCard.tsx");
const timestamp = findOpening(curationTree, (node) => jsxName(node) === "p" && attrText(curation, node, "className")?.includes("fw-transaction-fact"));
const cardValue = /const CARD = "([^"]+)";/.exec(curation)?.[1];
assert.ok(cardValue, "Curation CARD source string exists");
assert.equal(cardValue, "border border-[var(--border-gold)] px-[18px] pb-[18px] pt-[18px]", "Curation CARD keeps its exact paint-safe source class");
const timestampSection = jsxAncestors(timestamp).find((opening) => jsxName(opening) === "section");
assert.equal(attrText(curation, timestampSection, "className"), "{CARD}", "completed timestamp's section ancestor resolves CARD");
assert.ok(!unsafePaint(cardValue), "resolved Curation CARD has no opacity, filter, or color override");
assert.equal(attrText(curation, timestampSection, "style"), null, "completed timestamp CARD ancestor has no inline paint override");

assert.match(normalized(nav), /import NotificationsBell from "@\/components\/NotificationsBell";/, "NavBar imports Bell");
const navTree = tree("components/NavBar.tsx");
const bellNode = findOpening(navTree, (node) => jsxName(node) === "NotificationsBell");
const navChain = jsxAncestors(bellNode);
assert.deepEqual(navChain.map(jsxName), ["div", "div", "nav"], "utility div → header div → nav is the exact Bell ancestor sequence");
for (const [opening, expected] of navChain.map((opening, index) => [opening, ["hidden min-w-0 items-center gap-6 shell:flex", "flex h-14 w-full items-center justify-between px-6", "w-full border-b border-[var(--border-subtle)] bg-[var(--ink)]"][index]])) {
  assert.equal(classText(nav, opening), expected, `Bell ancestor ${jsxName(opening)} keeps its exact source class`);
  assertPaintSafe(nav, opening, `Bell ancestor ${jsxName(opening)}`);
}
const bellTree = tree("components/NotificationsBell.tsx");
const bellButton = findOpening(bellTree, (node) => jsxName(node) === "button" && attrText(bell, node, "aria-expanded") === "{open}");
const bellChain = jsxAncestors(bellButton);
assert.deepEqual(bellChain.map(jsxName), ["div"], "Bell button has exactly its wrapper ancestor");
assert.equal(classText(bell, bellChain[0]), "relative", "Bell wrapper keeps its exact source class");
assertPaintSafe(bell, bellChain[0], "Bell wrapper");
assert.equal(classText(bell, bellButton), "relative flex items-center transition-colors", "Bell button keeps its exact source class");
assertPaintSafe(bell, bellButton, "Bell button", { allowColorStyle: true });
assert.equal(attrText(bell, bellButton, "style"), '{{ color: hasUnread ? "#C9A84C" : "var(--muted)" }}', "Bell button pins only its intended color style");

const globals = read("app/globals.css");
function lightDark(name) {
  const match = new RegExp(`--${name}:\\s*light-dark\\((#[0-9A-F]{6}), (#[0-9A-F]{6})\\);`).exec(globals);
  assert.ok(match, `${name} is an asserted live light-dark declaration`);
  return { light: match[1], dark: match[2] };
}
const ink = lightDark("ink");
const muted = lightDark("muted");
const ghost = lightDark("ghost");
assert.deepEqual(ink, { light: "#F3F0E8", dark: "#0D0F14" }, "--ink declaration remains exact");
assert.deepEqual(muted, { light: "#6B655B", dark: "#818799" }, "--muted declaration remains exact");
assert.deepEqual(ghost, { light: "#8E887C", dark: "#646B7A" }, "--ghost declaration remains exact");
assert.match(globals, /--void:\s+light-dark\(#ABA495, #3D424F\);/, "--void definition remains byte-exact with no global reset");
function luminance(hex) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}
function contrast(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}
for (const [mode, before, after] of [["Light", 3.0925, 5.0692], ["Dark", 3.5836, 5.3480]]) {
  const key = mode.toLowerCase();
  assert.equal(contrast(ghost[key], ink[key]).toFixed(4), before.toFixed(4), `${mode} Ghost/ink parsed from live declarations is hand-checked`);
  assert.equal(contrast(muted[key], ink[key]).toFixed(4), after.toFixed(4), `${mode} Muted/ink parsed from live declarations is hand-checked`);
  assert.ok(after > before && after >= 4.5, `${mode} corrected functional text improves and clears 4.5:1`);
}

// Exact normalized JSX/class + role/copy anchors prevent a permitted token
// from moving to unrelated user-facing text while retaining a raw file count.
const ghostAnchors = [
  ["components/DealerAcceleratorRoom.tsx", /<input[\s\S]*?placeholder="https:\/\/yourdealer\.com"[\s\S]*?className="fw-input[^"]*placeholder:text-\[var\(--ghost\)\][^"]*"/, "dealer website placeholder"],
  ["components/VaultSpecificationUpgrade.tsx", /<input[\s\S]*?placeholder="Search filename or Brand&hellip;"[\s\S]*?aria-label="Search by filename or Brand"[\s\S]*?placeholder:text-\[var\(--ghost\)\]/, "Vault filename search placeholder"],
  ["components/VaultSpecificationUpgrade.tsx", /aria-hidden="true"[\s\S]*?className="text-\[8px\] uppercase tracking-\[2px\] text-\[var\(--ghost\)\]"[\s\S]*?structural upgrade/, "Vault decorative aria-hidden transfer marker"],
  ["components/GenerateCollectorDossierButton.tsx", /<button type="button" onClick=\{generate\} disabled=\{busy\} className="[^"]*disabled:text-\[var\(--ghost\)\]"\s*> \{busy \? "Generating…" : "Generate Collector Dossier"\}/, "disabled collector dossier control"],
  ["components/ImportedDraftsWorkspace.tsx", /<label className=\{`flex items-center gap-2 text-\[11px\] \$\{ awaitingValue \? "cursor-not-allowed text-\[var\(--ghost\)\]"[\s\S]*?<input type="checkbox"[\s\S]*?disabled=\{!editable \|\| awaitingValue\}[\s\S]*?> Confirmed by dealer <\/label>/, "disabled imported confirmation label"],
];
for (const [path, expression, label] of ghostAnchors) assertAnchor(path, expression, `${label} remains the exact lawful Ghost anchor`);
assert.equal(ghostAnchors.length, 5, "five lawful Ghost direct-text consumers remain");
assert.doesNotMatch(curation, /var\(--ghost\)/, "Curation has no Ghost direct-text consumer");
assert.doesNotMatch(bell, /var\(--ghost\)/, "Bell has no Ghost direct-text consumer");

const voidAnchors = [
  ["app/globals.css", /\.fw-input::placeholder \{ color: var\(--void\); font-style: italic; \}/, "shared input placeholder CSS"],
  ["components/DescriptionStep.tsx", /<textarea[\s\S]*?placeholder="I bought this from the original owner in Geneva[\s\S]*?className="[^"]*placeholder:text-\[var\(--void\)\][^"]*"/, "seller description placeholder"],
  ["components/DetailsStep.tsx", /const inputCls = "[^"]*placeholder:text-\[var\(--void\)\][^"]*";[\s\S]*?<textarea[\s\S]*?placeholder="Service history, previous ownership, how you acquired it…"/, "seller details input placeholder treatment"],
  ["components/VaultGalaxy.tsx", /<input[\s\S]*?placeholder="Try: manual wind or Moser"[\s\S]*?className="[^"]*placeholder:text-\[var\(--void\)\][^"]*"/, "Vault search placeholder"],
  ["components/SellerProfile.tsx", /<span className="text-\[11px\] text-\[var\(--void\)\]">›<\/span> <span className="text-\[11px\] tracking-\[0\.5px\] text-\[var\(--muted\)\]">Sellers<\/span> <span className="text-\[11px\] text-\[var\(--void\)\]">›<\/span>/, "Seller Profile ornamental breadcrumb separators"],
  ["app/error.tsx", /<div className="absolute left-6 top-6[^"]*text-\[var\(--void\)\][^"]*"> <Link href="\/"[\s\S]*?> Home <\/Link> <\/div>/, "inert error breadcrumb wrapper"],
  ["app/not-found.tsx", /<div className="absolute left-6 top-6[^"]*text-\[var\(--void\)\][^"]*"> <Link href="\/"[\s\S]*?> Home <\/Link> <\/div>/, "inert not-found breadcrumb wrapper"],
  ["components/reassurance/SignInRequired.tsx", /<div className="absolute left-6 top-5[^"]*text-\[var\(--void\)\][^"]*"> <Link href="\/"[\s\S]*?> Home <\/Link> <\/div>/, "inert sign-in-required breadcrumb wrapper"],
];
for (const [path, expression, label] of voidAnchors) assertAnchor(path, expression, `${label} remains the exact lawful/inert Void anchor`);
assert.equal(voidAnchors.length + 1, 9, "nine lawful/inert Void direct-text uses remain (Seller separators provide two)");
const dormantVoid = [["components/reassurance/ListingDeclined.tsx", "/sell", "Sell", "Review"], ["components/reassurance/ListingSold.tsx", "/browse", "Browse", "Listing"], ["components/reassurance/NoSearchResults.tsx", "/browse", "Browse", "Search"]];
for (const [path, href, primary, terminal] of dormantVoid) assertAnchor(path, new RegExp(`<div className="absolute left-6 top-5[^\"]*text-\\[var\\(--void\\)\\][^\"]*"> <Link href="${href.replace("/", "\\/")}"[\\s\\S]*?> ${primary} <\\/Link> <span>›<\\/span> <span>${terminal}<\\/span> <\\/div>`), `${path} retains its exact dormant functional breadcrumb node`);

const b8 = read("scripts/ls1-b3-functional-copy.test.mjs");
const dormantSetDeclaration = /const DORMANT_TREATMENT_PATHS = new Set\(\[([\s\S]*?)\]\);/.exec(b8)?.[1];
assert.ok(dormantSetDeclaration, "B8 declares its dormant treatment path set");
for (const [path] of dormantVoid) assert.match(dormantSetDeclaration, new RegExp(`"${escape(path)}"`), `B8 dormant-path declaration owns ${path}`);
assert.match(read("package.json"), /"prebuild": "node scripts\/ls1-b3-functional-copy\.test\.mjs"/, "B8 remains normal build-lifecycle enforcement owner");

const voidLaw = read("docs/product-laws/Void-Token-Governance.md");
assert.match(voidLaw, /may never be used for information the user needs to read/, "existing Void law carries the readable-role boundary");
assert.equal(readdirSync(new URL("docs/product-laws/", root)).filter((name) => /void.*token|token.*void/i.test(name)).length, 1, "no parallel Void-token law exists");

for (const pattern of [/const hasUnread = unreadCount > 0;/, /const badge = unreadCount > 9 \? "9\+" : String\(unreadCount\);/, /aria-label=\{hasUnread \? `Notifications, \$\{unreadCount\} unread` : "Notifications"\}/, /aria-expanded=\{open\}/, /onClick=\{\(\) => setOpen\(\(o\) => !o\)\}/, /setInterval\(load, POLL_MS\)/, /method: "PATCH"/, /\{hasUnread && \(/, /\{badge\}/, /background: "#C9A84C", color: "var\(--ink\)"/]) assert.match(bell, pattern, `Bell behavior survives correction: ${pattern}`);
for (const pattern of [/const \[state, setState\] = useState\(initialState\);/, /const \[busy, setBusy\] = useState\(false\);/, /const \[error, setError\] = useState<string \| null>\(null\);/, /fetch\(`\/api\/listings\/\$\{listingId\}\/curation-request`, \{ method: "POST" \}\)/, /router\.push\(`\/login\?callbackUrl=/, /router\.refresh\(\);/, /if \(state === "completed" && summary\)/]) assert.match(curation, pattern, `Curation behavior survives correction: ${pattern}`);

console.log("ls2-ghost-void-revival-safety: 2 corrected anchors, 5 lawful Ghost, 9 lawful/inert Void, 3 dormant B8-protected violations PASS");
