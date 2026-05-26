/**
 * Internal structured logger for the NirikshaAI SDK.
 * Respects the NIRIKSHA_LOG_LEVEL environment variable (debug|info|warn|error).
 * All messages are prefixed with [NirikshaAI].
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

function currentLevel(): number {
  const env = (process.env['NIRIKSHA_LOG_LEVEL'] ?? 'warn').toLowerCase() as LogLevel
  return LEVELS[env] ?? LEVELS.warn
}

function log(level: LogLevel, msg: string, ...args: unknown[]): void {
  if (LEVELS[level] < currentLevel()) return
  const prefix = '[NirikshaAI]'
  switch (level) {
    case 'debug': console.debug(prefix, msg, ...args); break // eslint-disable-line no-console
    case 'info':  console.info(prefix, msg, ...args);  break // eslint-disable-line no-console
    case 'warn':  console.warn(prefix, msg, ...args);  break // eslint-disable-line no-console
    case 'error': console.error(prefix, msg, ...args); break // eslint-disable-line no-console
  }
}

export const logger = {
  debug: (msg: string, ...args: unknown[]) => log('debug', msg, ...args),
  info:  (msg: string, ...args: unknown[]) => log('info',  msg, ...args),
  warn:  (msg: string, ...args: unknown[]) => log('warn',  msg, ...args),
  error: (msg: string, ...args: unknown[]) => log('error', msg, ...args),
}
