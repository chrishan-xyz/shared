'use strict';

// ---------------------------------------------------------------------------
// Unified Structured Logger — shared across all @chrishan apps
// ---------------------------------------------------------------------------

interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
}

const LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const LOG_LEVEL: number = LEVELS[process.env.LOG_LEVEL || 'info'] ?? LEVELS.info;

function formatArgs(...args: unknown[]): string {
  return args.map(a =>
    a instanceof Error ? a.message :
    typeof a === 'object' ? JSON.stringify(a) : String(a)
  ).join(' ');
}

function createLogger(module: string): Logger {
  const prefix = `[${module}]`;

  function format(level: string, msg: string, ...args: unknown[]): string {
    const ts = new Date().toISOString();
    const extra = args.length ? ' ' + formatArgs(...args) : '';
    return `${ts} ${prefix} ${level} ${msg}${extra}`;
  }

  return {
    info(msg: string, ...args: unknown[]): void {
      if (LOG_LEVEL <= LEVELS.info) {
        console.log(format('INFO', msg, ...args));
      }
    },
    warn(msg: string, ...args: unknown[]): void {
      if (LOG_LEVEL <= LEVELS.warn) {
        console.warn(format('WARN', msg, ...args));
      }
    },
    error(msg: string, ...args: unknown[]): void {
      if (LOG_LEVEL <= LEVELS.error) {
        console.error(format('ERROR', msg, ...args));
      }
    },
    debug(msg: string, ...args: unknown[]): void {
      if (LOG_LEVEL <= LEVELS.debug) {
        console.log(format('DEBUG', msg, ...args));
      }
    },
  };
}

// Support both: require('logger')('module') and { createLogger } = require('logger')
// Documented `as` assertion: dual-export pattern requires type widening to support
// both `createLogger('x')` and `require('logger')('x')` call signatures.
const exportedFn = createLogger as typeof createLogger & { createLogger: typeof createLogger };
exportedFn.createLogger = createLogger;

export = exportedFn;
