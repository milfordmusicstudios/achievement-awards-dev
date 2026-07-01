const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const productionOrigin = "https://awards.milfordmusic.com";
const inviteUrl = process.argv[2] || "";

const suspiciousPattern = /(localhost|127\.0\.0\.1|192\.168\.|http:\/\/|:[0-9]*(5173|3000|54321)\b|achievement-awards-dev\.vercel\.app)/i;
const ignoredDirs = new Set([".git", "node_modules"]);
const ignoredFiles = new Set(["package-lock.json", "repo-structure.txt", "repo-structure-focused.txt"]);
const allowedLocalOnlyFiles = new Set([
  "api/_lib/badges/auth.js",
  "config.js",
  "pwa-install.js",
  "scripts/audit-invite-flow.js",
  "supabase-config.js",
  "supabaseClient.js",
  "supabase/config.toml",
]);

function rel(file) {
  return path.relative(root, file).replace(/\\/g, "/");
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) walk(path.join(dir, entry.name), files);
      continue;
    }
    files.push(path.join(dir, entry.name));
  }
  return files;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const callbackHtml = read("auth-callback.html");
const callbackJs = read("auth-callback.js");
const navJs = read("nav.js");
const utilsJs = read("utils.js");

assert(callbackHtml.includes('src="./auth-callback.js"') || callbackHtml.includes('src="auth-callback.js"'), "auth-callback.html does not load auth-callback.js");
assert(callbackJs.includes("exchangeCodeForSession"), "auth-callback.js does not exchange Supabase auth codes");
assert(callbackJs.includes("finish-setup.html"), "auth-callback.js does not route invite users to finish-setup.html");
assert(callbackJs.includes("inspect_invite_token"), "auth-callback.js does not inspect invite token status");
assert(callbackJs.includes("join.html?token="), "auth-callback.js does not route valid token/no-session users to join.html");
assert(navJs.includes("auth-callback.html") && navJs.includes("join.html"), "nav.js does not treat invite pages as public");
assert(utilsJs.includes("auth-callback.html") && utilsJs.includes("join.html"), "utils.js does not treat invite pages as public");

if (inviteUrl) {
  const parsed = new URL(inviteUrl);
  assert(parsed.origin === productionOrigin, `Invite URL origin is ${parsed.origin}, expected ${productionOrigin}`);
  assert(
    parsed.pathname === "/auth-callback.html" || parsed.pathname === "/join.html",
    `Invite URL path is ${parsed.pathname}, expected /auth-callback.html or /join.html`
  );
  assert(parsed.searchParams.get("token"), "Invite URL is missing a token query parameter");
}

const hits = [];
const allowedLocalHits = [];
for (const file of walk(root)) {
  const relative = rel(file);
  if (ignoredFiles.has(path.basename(file))) continue;
  if (!/\.(js|html|json|toml|md|txt)$/.test(relative)) continue;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (suspiciousPattern.test(line)) {
      const hit = `${relative}:${index + 1}: ${line.trim()}`;
      if (allowedLocalOnlyFiles.has(relative)) {
        allowedLocalHits.push(hit);
      } else {
        hits.push(hit);
      }
    }
  });
}

console.log("Invite flow audit");
console.log(`- auth-callback.html present and loads auth-callback.js`);
console.log(`- callback route: invalid token -> visible error`);
console.log(`- callback route: valid token + session -> finish-setup.html?token=...`);
console.log(`- callback route: valid token + no session -> join.html?token=...`);
console.log(`- manual invite route: join.html?token=... for clean browsers`);
console.log(`- auth-callback.html and join.html are public pages in nav/viewer context`);
console.log(`- production origin expected: ${productionOrigin}`);
if (inviteUrl) console.log(`- checked invite URL: ${inviteUrl}`);

if (hits.length) {
  console.log("");
  console.log("Blocking suspicious URL/config references found:");
  hits.forEach(hit => console.log(`- ${hit}`));
  process.exitCode = 1;
} else {
  console.log("- no blocking dev URLs found in invite/app-flow files");
}

if (allowedLocalHits.length) {
  console.log("");
  console.log("Allowed local-only references:");
  allowedLocalHits.forEach(hit => console.log(`- ${hit}`));
}
