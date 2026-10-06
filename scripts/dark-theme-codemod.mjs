#!/usr/bin/env node
/*
 * Dark-theme codemod (app redesign, 2026-10).
 *
 * Rewrites the light-theme colour utilities across the app to the semantic dark
 * tokens defined in src/app/globals.css (@theme: canvas, surface, fill, fg,
 * muted, line, …), keeping every variant prefix (hover:, focus:, sm:, …) and
 * opacity modifier (/70) intact. Hue tints become translucent tints of the same
 * hue, and dark-on-light status text is lifted to its light shade.
 *
 * Skips src/components/landing (its light product mocks are intentional) and
 * anything not .tsx. Idempotent: the semantic names it writes are never inputs.
 *
 *   node scripts/dark-theme-codemod.mjs           # rewrite files
 *   node scripts/dark-theme-codemod.mjs --check   # report only, exit 1 if any remain
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../src", import.meta.url));
const SKIP_DIRS = [join(ROOT, "components/landing")];
const check = process.argv.includes("--check");

// ---- neutral (slate/gray) mapping, per property ----------------------------
const NEUTRAL = {
  bg: { 50: "canvas", 100: "fill", 200: "fill-strong", 300: "fill-max", 400: "fill-max", 500: "subtle", 600: "surface-hi", 700: "surface-hi", 800: "surface-hi", 900: "surface-hi", 950: "canvas" },
  text: { 50: "fg", 100: "fg", 200: "fg-3", 300: "faint", 400: "subtle", 500: "muted", 600: "fg-3", 700: "fg-2", 800: "fg", 900: "fg", 950: "fg" },
  border: { 50: "line-soft", 100: "line-soft", 150: "line-soft", 200: "line", 300: "line-strong", 400: "line-strong", 500: "line-strong", 600: "line-strong", 700: "line-strong", 800: "line", 900: "line" },
  placeholder: { 300: "faint", 400: "subtle", 500: "muted" },
};
NEUTRAL.divide = NEUTRAL.border;
NEUTRAL.ring = NEUTRAL.border;
NEUTRAL.outline = NEUTRAL.border;
NEUTRAL.fill = NEUTRAL.text;
NEUTRAL.stroke = NEUTRAL.text;

const HUES = ["red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose"];
// The brand ramps (globals.css): their 500 is the bright logo hue.
const BRAND = { "brand": "brand", "accent-purple": "violet", "accent-yellow": "orange", "accent-green": "fuchsia" };

function mapHue(prop, family, shade) {
  const n = Number(shade);
  const tintOf = (pct) => `${family}-500/${pct}`;
  if (prop === "bg") {
    if (n <= 50) return tintOf(10);
    if (n <= 100) return tintOf(15);
    if (n <= 200) return tintOf(22);
    return null; // 300+ stay: solid accents and buttons
  }
  if (prop === "border" || prop === "ring" || prop === "divide" || prop === "outline") {
    if (n <= 100) return tintOf(20);
    if (n <= 200) return tintOf(30);
    if (n <= 300) return tintOf(40);
    return null;
  }
  if (prop === "text" || prop === "fill" || prop === "stroke" || prop === "placeholder") {
    if (BRAND[family]) {
      if (family === "brand" && n >= 600) return "brand-500";
      if (n >= 600) return `${BRAND[family]}-300`;
      return null;
    }
    if (n >= 800) return `${family}-200`;
    if (n >= 600) return `${family}-300`;
    if (n === 500) return `${family}-400`;
    return null; // 50–400 are already light, used on dark
  }
  return null;
}

const PROPS = "bg|text|border|ring|divide|placeholder|fill|stroke|outline";
const FAMILIES = ["slate", "gray", "zinc", "neutral", "stone", ...HUES, ...Object.keys(BRAND)].sort((a, b) => b.length - a.length).join("|");
// prefix: any chain of variants (hover:, md:, group-hover:, data-[x]:, …)
const RE = new RegExp(String.raw`(?<![\w\-\[/])((?:[a-z0-9\-\[\]=&_]+:)*)(${PROPS})-(white|${FAMILIES})(?:-(\d{2,3}))?(\/\d{1,3})?(?![\w\-])`, "g");

function rewrite(token, prefix, prop, family, shade, opacity) {
  opacity = opacity || "";
  if (family === "white") {
    if (prop === "bg") return `${prefix}bg-surface${opacity}`;
    // a translucent white edge was "frosted glass" on light; on dark it glows
    if (prop === "border" && /^\/(5\d|6\d|7\d|8\d|9\d)$/.test(opacity)) return `${prefix}border-line`;
    return null; // text-white, border-white/x: already right on dark
  }
  if (!shade) return null;
  if (["slate", "gray", "zinc", "neutral", "stone"].includes(family)) {
    const m = NEUTRAL[prop]?.[shade];
    return m ? `${prefix}${prop}-${m}${opacity}` : null;
  }
  const m = mapHue(prop, family, shade);
  if (!m) return null;
  // a tint already carries its own alpha; an explicit /NN on top is dropped
  return `${prefix}${prop}-${m}${m.includes("/") ? "" : opacity}`;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (SKIP_DIRS.some((d) => p.startsWith(d))) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

let files = 0, changes = 0;
const unmapped = new Map();
for (const file of walk(ROOT)) {
  const src = readFileSync(file, "utf8");
  let n = 0;
  const next = src.replace(RE, (token, prefix, prop, family, shade, opacity) => {
    const r = rewrite(token, prefix, prop, family, shade, opacity);
    if (r === null) {
      if (family !== "white" && !(prop === "text" && family === "white")) {
        const key = `${prop}-${family}${shade ? "-" + shade : ""}`;
        unmapped.set(key, (unmapped.get(key) || 0) + 1);
      }
      return token;
    }
    if (r !== token) n++;
    return r;
  });
  if (n) {
    files++;
    changes += n;
    if (!check) writeFileSync(file, next);
  }
}

console.log(`${check ? "would change" : "changed"} ${changes} utilities in ${files} files`);
const kept = [...unmapped.entries()].sort((a, b) => b[1] - a[1]);
if (kept.length) console.log("kept as-is (already suit a dark ground):", kept.map(([k, v]) => `${k}×${v}`).join(" "));
if (check && changes) process.exit(1);
