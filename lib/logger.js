'use strict';

/**
 * Unified structured logger — shared across all @chrishan apps.
 *
 * Supports two usage patterns:
 *
 * Pattern 1 (ArlOS/Feed style — direct function call):
 *   const log = require('@chrishan/shared/lib/logger')('startup');
 *   log.info('Server ready', { port: 8080 });
 *   log.error('Query failed', err);
 *
 * Pattern 2 (Recharge style — named export):
 *   const { createLogger } = require('@chrishan/shared/lib/logger');
 *   const log = createLogger('startup');
 *   log.info('Server ready', { port: 8080 });
 *
 * Features:
 *   - Level filtering via LOG_LEVEL env (debug|info|warn|error, default: info)
 *   - Spread args support (multiple data args, Error objects)
 *   - Consistent format: {ts} [{module}] {LEVEL} {msg} {data}
 *
 * Output:
 *   2026-03-28T01:30:00.000Z [startup] INFO Server ready {"port":8080}
 *   2026-03-28T01:30:00.000Z [startup] ERROR Query failed Error: connection refused
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LOG_LEVEL = LEVELS[process.env.LOG_LEVEL || 'info'] || LEVELS.info;

function formatArgs(...args) {
  return args.map(a =>
    a instanceof Error ? a.message :
    typeof a === 'object' ? JSON.stringify(a) : String(a)
  ).join(' ');
}

function createLogger(module) {
  const prefix = `[${module}]`;

  function format(level, msg, ...args) {
    const ts = new Date().toISOString();
    const extra = args.length ? ' ' + formatArgs(...args) : '';
    return `${ts} ${prefix} ${level} ${msg}${extra}`;
  }

  return {
    info(msg, ...args) {
      if (LOG_LEVEL <= LEVELS.info) {
        console.log(format('INFO', msg, ...args));
      }
    },
    warn(msg, ...args) {
      if (LOG_LEVEL <= LEVELS.warn) {
        console.warn(format('WARN', msg, ...args));
      }
    },
    error(msg, ...args) {
      if (LOG_LEVEL <= LEVELS.error) {
        console.error(format('ERROR', msg, ...args));
      }
    },
    debug(msg, ...args) {
      if (LOG_LEVEL <= LEVELS.debug) {
        console.log(format('DEBUG', msg, ...args));
      }
    },
  };
}

// Support both: require('logger')('module') and { createLogger } = require('logger')
module.exports = createLogger;
module.exports.createLogger = createLogger;
