import { SENSITIVE_ENV_NAMES } from "./envguard";

let hooksInstalled = false;
const originalConsole: Record<string, (...args: unknown[]) => void> = {
  debug: console.debug.bind(console),
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

type EnvValueEntry = { name: string; value: string; length: number };

function getSensitiveEnvEntries(): EnvValueEntry[] {
  const entries: EnvValueEntry[] = [];
  for (const name of SENSITIVE_ENV_NAMES) {
    const val = process.env[name];
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      const s = String(val);
      entries.push({ name, value: s, length: s.length });
    }
  }
  entries.sort((a, b) => b.length - a.length);
  return entries;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Walked = unknown;

function redactKeysInObject(
  node: Walked,
  sensitiveKeys: string[],
  seen: WeakSet<object>
): Walked {
  if (node === null || node === undefined) return node;
  if (typeof node !== "object") return node;
  if (seen.has(node as object)) return "[REDACTED circular]";
  seen.add(node as object);

  if (Array.isArray(node)) {
    return node.map((item) => redactKeysInObject(item, sensitiveKeys, seen));
  }

  const obj = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const matchesSensitive = sensitiveKeys.some(
      (sk) => sk.toLowerCase() === key.toLowerCase()
    );
    if (matchesSensitive) {
      out[key] = `[REDACTED ${key}]`;
    } else {
      out[key] = redactKeysInObject(obj[key], sensitiveKeys, seen);
    }
  }
  return out;
}

export function redactSensitive(
  input: unknown,
  customSensitiveKeys?: string[]
): string {
  const sensitiveKeys = Array.from(
    new Set([...SENSITIVE_ENV_NAMES, ...(customSensitiveKeys ?? [])])
  );

  let serialized: string;
  try {
    if (typeof input === "string") {
      serialized = input;
    } else {
      const seen = new WeakSet<object>();
      const scrubbed = redactKeysInObject(input, sensitiveKeys, seen);
      serialized = JSON.stringify(scrubbed, (_, v) => {
        if (typeof v === "bigint") return v.toString();
        return v;
      });
    }
  } catch (err) {
    if (
      err instanceof TypeError &&
      /circular structure/i.test(err.message)
    ) {
      return "[REDACTED circular]";
    }
    try {
      return String(input);
    } catch {
      return "[REDACTED unstringifiable]";
    }
  }

  const envEntries = getSensitiveEnvEntries();
  let result = serialized;
  for (const entry of envEntries) {
    if (entry.length < 2) continue;
    try {
      const re = new RegExp(escapeRegex(entry.value), "g");
      result = result.replace(re, `[REDACTED ${entry.name}]`);
    } catch {
      if (result.includes(entry.value)) {
        result = result.split(entry.value).join(`[REDACTED ${entry.name}]`);
      }
    }
  }
  return result;
}

function isoPrefix(): string {
  const ts = new Date().toISOString();
  return `[pactopus] ${ts}`;
}

export const safeLogger = {
  debug(...args: unknown[]): void {
    const prefix = isoPrefix();
    const redacted = args.map((a) => redactSensitive(a));
    originalConsole.debug(prefix, ...redacted);
  },
  log(...args: unknown[]): void {
    const prefix = isoPrefix();
    const redacted = args.map((a) => redactSensitive(a));
    originalConsole.log(prefix, ...redacted);
  },
  info(...args: unknown[]): void {
    const prefix = isoPrefix();
    const redacted = args.map((a) => redactSensitive(a));
    originalConsole.info(prefix, ...redacted);
  },
  warn(...args: unknown[]): void {
    const prefix = isoPrefix();
    const redacted = args.map((a) => redactSensitive(a));
    originalConsole.warn(prefix, ...redacted);
  },
  error(...args: unknown[]): void {
    const prefix = isoPrefix();
    const redacted = args.map((a) => redactSensitive(a));
    originalConsole.error(prefix, ...redacted);
  },
};

export function installGlobalLogHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;

  const wrap = (methodName: "debug" | "log" | "info" | "warn" | "error") => {
    const original = originalConsole[methodName];
    return (...args: unknown[]) => {
      const prefix = isoPrefix();
      const redacted = args.map((a) => redactSensitive(a));
      original(prefix, ...redacted);
    };
  };

  console.debug = wrap("debug");
  console.log = wrap("log");
  console.info = wrap("info");
  console.warn = wrap("warn");
  console.error = wrap("error");
}
