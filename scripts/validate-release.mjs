#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const adapter = read("content/site-adapter.js");
const contentScript = read("content/content-script.js");
const panel = read("content/panel.js");

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

check(manifest.manifest_version === 3, "manifest_version 必須是 3");
check(JSON.stringify(manifest.permissions) === JSON.stringify(["storage"]), "只應要求 storage API 權限");
check(!Object.hasOwn(manifest, "host_permissions"), "不應重複宣告 host_permissions");
check(manifest.background?.service_worker === "background/service-worker.js", "缺少 service worker");
check(fs.existsSync(path.join(root, "privacy.html")), "缺少內建隱私權政策頁");
check(fs.existsSync(path.join(root, "docs/privacy-policy.md")), "缺少公開隱私權政策文件");

const matches = manifest.content_scripts?.[0]?.matches || [];
const matchHosts = new Set(matches.map((pattern) => new URL(pattern.replace("*", "")).hostname));
const ruleHosts = new Set([...adapter.matchAll(/^\s{4}"([^"]+)": \{/gm)].map((match) => match[1]));
const plannerHosts = new Set(["planner.ikea.com.tw", "planner.ikea.com.hk"]);

for (const host of ruleHosts) check(matchHosts.has(host), `SITE_RULES 的 ${host} 未列入 manifest matches`);
for (const host of plannerHosts) check(matchHosts.has(host), `Planner 的 ${host} 未列入 manifest matches`);
for (const host of matchHosts) check(ruleHosts.has(host) || plannerHosts.has(host), `manifest 的 ${host} 沒有站點規則或 Planner 處理`);

check(/privacyAcceptedAt/.test(contentScript), "content script 缺少隱私同意門檻");
check(/if \(!privacyAccepted \|\| !extensionEnabled\) return/.test(contentScript), "點擊攔截未受隱私同意控制");
check(/btnAcceptPrivacy/.test(panel) && /btnDeclinePrivacy/.test(panel), "隱私揭露缺少同意或拒絕操作");
check(!/\beval\s*\(|new Function\s*\(|importScripts\s*\(|<script[^>]+src=/i.test(adapter + contentScript + panel), "發現可能的遠端或動態程式碼");

const requiredAssets = [
  ["docs/store-assets/promo-small-440x280.png", 440, 280],
  ["docs/store-assets/promo-marquee-1400x560.png", 1400, 560],
  ["docs/store-assets/screenshot-01-overview.png", 1280, 800],
  ["docs/store-assets/screenshot-02-add-product.png", 1280, 800],
  ["docs/store-assets/screenshot-03-room-list.png", 1280, 800],
  ["docs/store-assets/screenshot-04-export.png", 1280, 800],
  ["docs/store-assets/screenshot-05-export.png", 1280, 800]
];
for (const [file, expectedWidth, expectedHeight] of requiredAssets) {
  const absolute = path.join(root, file);
  check(fs.existsSync(absolute), `缺少商店素材 ${file}`);
  if (fs.existsSync(absolute)) {
    const png = fs.readFileSync(absolute);
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    check(width === expectedWidth && height === expectedHeight, `${file} 尺寸為 ${width}x${height}，應為 ${expectedWidth}x${expectedHeight}`);
  }
}

if (failures.length) {
  console.error(`Release validation failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Release validation passed: ${matchHosts.size} 個網站範圍、${ruleHosts.size} 組電商規則、${requiredAssets.length} 個必要商店素材。`);
