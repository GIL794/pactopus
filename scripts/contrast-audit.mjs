import fs from 'node:fs';
import path from 'node:path';

const cssPath = path.join(process.cwd(), 'app', 'globals.css');
const css = fs.readFileSync(cssPath, 'utf8');

function extractBlock(selectorRegex) {
  const m = css.match(selectorRegex);
  if (!m) return '';
  return m[1] || '';
}

function parseVars(block) {
  const vars = {};
  const re = /--([a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g;
  for (;;) {
    const m = re.exec(block);
    if (!m) break;
    vars[`--${m[1]}`] = m[2].trim();
  }
  return vars;
}

function resolveVar(vars, key, seen = new Set()) {
  const raw = vars[key];
  if (!raw) return undefined;
  if (!raw.includes('var(')) return raw;
  if (seen.has(key)) return raw;
  seen.add(key);
  return raw.replace(/var\((--[a-zA-Z0-9-_]+)\)/g, (_m, dep) => {
    const depVal = resolveVar(vars, dep, seen);
    return depVal ?? '';
  }).trim();
}

function hexToRgb(hex) {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b };
}

function parseRgbTriplet(value) {
  const parts = value.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length !== 3) return null;
  const [r, g, b] = parts.map(Number);
  if ([r, g, b].some(n => Number.isNaN(n))) return null;
  return { r, g, b };
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function luminance({ r, g, b }) {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrast(a, b) {
  const L1 = luminance(a);
  const L2 = luminance(b);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

function blendOver(bg, fg, alpha) {
  const t = clamp01(alpha);
  return {
    r: Math.round(bg.r * (1 - t) + fg.r * t),
    g: Math.round(bg.g * (1 - t) + fg.g * t),
    b: Math.round(bg.b * (1 - t) + fg.b * t),
  };
}

function resolveScenario({ network, theme }) {
  const root = parseVars(extractBlock(/:root\s*\{([\s\S]*?)\}/m));
  const dark = parseVars(extractBlock(/html\[data-theme='dark'\],\s*[\r\n]+body\[data-theme='dark'\]\s*\{([\s\S]*?)\}/m));
  const arc = parseVars(extractBlock(/body\[data-network='arc'\],\s*[\r\n]+html\[data-network='arc'\]\s*\{([\s\S]*?)\}/m));
  const algo = parseVars(extractBlock(/body\[data-network='algorand'\],\s*[\r\n]+html\[data-network='algorand'\]\s*\{([\s\S]*?)\}/m));

  const vars = { ...root, ...(theme === 'dark' ? dark : {}), ...(network === 'arc' ? arc : algo) };
  const resolved = {};
  for (const k of Object.keys(vars)) {
    resolved[k] = resolveVar(vars, k);
  }
  return resolved;
}

function rgbFromVar(resolved, key) {
  const v = resolved[key];
  if (!v) return null;
  if (v.startsWith('#')) return hexToRgb(v);
  return parseRgbTriplet(v);
}

function assertMin(name, ratio, min, failures) {
  const ok = ratio >= min;
  const line = `${ok ? 'PASS' : 'FAIL'} ${name}: ${ratio.toFixed(2)} (min ${min})`;
  console.log(line);
  if (!ok) failures.push(line);
}

function run(network) {
  console.log(`\n=== ${network.toUpperCase()} LIGHT ===`);
  const v = resolveScenario({ network, theme: 'light' });

  const bgBase = rgbFromVar(v, '--bg-base');
  const bgSurface = rgbFromVar(v, '--bg-surface');
  const bgElevated = rgbFromVar(v, '--bg-elevated');
  const textPrimary = rgbFromVar(v, '--text-primary');
  const textSecondary = rgbFromVar(v, '--text-secondary');
  const textMuted = rgbFromVar(v, '--text-muted');

  const failures = [];

  assertMin('text-primary on bg-base', contrast(textPrimary, bgBase), 4.5, failures);
  assertMin('text-secondary on bg-base', contrast(textSecondary, bgBase), 4.5, failures);
  assertMin('text-muted on bg-base', contrast(textMuted, bgBase), 4.5, failures);
  assertMin('text-primary on bg-surface', contrast(textPrimary, bgSurface), 4.5, failures);
  assertMin('text-secondary on bg-surface', contrast(textSecondary, bgSurface), 4.5, failures);
  assertMin('text-primary on bg-elevated', contrast(textPrimary, bgElevated), 4.5, failures);

  const ctaFrom = rgbFromVar(v, '--cta-from-rgb');
  const ctaTo = rgbFromVar(v, '--cta-to-rgb');
  const white = { r: 255, g: 255, b: 255 };
  assertMin('cta white on start', contrast(white, ctaFrom), 4.5, failures);
  assertMin('cta white on end', contrast(white, ctaTo), 4.5, failures);

  const success = rgbFromVar(v, '--success');
  const successRgb = rgbFromVar(v, '--success-rgb');
  const danger = rgbFromVar(v, '--danger');
  const dangerRgb = rgbFromVar(v, '--danger-rgb');
  const accentCyan = rgbFromVar(v, '--accent-cyan');
  const brand = rgbFromVar(v, '--brand-rgb');
  const brandTertiary = rgbFromVar(v, '--brand-tertiary-rgb');

  const successBg = blendOver(bgSurface, successRgb, 0.14);
  const dangerBg = blendOver(bgSurface, dangerRgb, 0.14);
  const brandBg = blendOver(bgSurface, brand, 0.12);
  const tertiaryBg = blendOver(bgSurface, brandTertiary, 0.12);

  assertMin('success text on success badge bg', contrast(success, successBg), 4.5, failures);
  assertMin('danger text on danger badge bg', contrast(danger, dangerBg), 4.5, failures);
  assertMin('accent-cyan text on brand badge bg', contrast(accentCyan, brandBg), 4.5, failures);
  assertMin('tertiary text on tertiary badge bg', contrast(brandTertiary, tertiaryBg), 3.0, failures);

  return failures;
}

const allFailures = [...run('arc'), ...run('algorand')];
if (allFailures.length) {
  console.log(`\nFAILURES: ${allFailures.length}`);
  process.exitCode = 1;
} else {
  console.log('\nAll checks passed.');
}
