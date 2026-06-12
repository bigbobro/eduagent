/**
 * Structured logging with levels, request ID tagging, and JSON output.
 * Replaces scattered console.log calls with consistent, filterable logs.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  module: string
  requestId?: string
  sessionId?: string
  [key: string]: unknown
}

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context: LogContext
}

class Logger {
  private minLevel: LogLevel = 'info'

  constructor() {
    // In production, default to 'info'. Allow DEBUG=true env to enable 'debug'.
    if (process.env.NODE_ENV === 'production') {
      this.minLevel = 'info'
    } else if (process.env.DEBUG === 'true') {
      this.minLevel = 'debug'
    } else {
      this.minLevel = 'info'
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error']
    return levels.indexOf(level) >= levels.indexOf(this.minLevel)
  }

  private format(level: LogLevel, message: string, context: LogContext): string {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    }

    // In development, use human-readable format
    if (process.env.NODE_ENV !== 'production') {
      const tag = context.requestId
        ? `[${context.module} ${context.requestId}]`
        : `[${context.module}]`
      const extras = Object.entries(context)
        .filter(([k]) => k !== 'module' && k !== 'requestId' && k !== 'sessionId')
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(' ')
      return `${tag} ${message}${extras ? ' ' + extras : ''}`
    }

    // In production, use JSON for log aggregation
    return JSON.stringify(entry)
  }

  debug(message: string, context: LogContext): void {
    if (this.shouldLog('debug')) {
      console.log(this.format('debug', message, context))
    }
  }

  info(message: string, context: LogContext): void {
    if (this.shouldLog('info')) {
      console.log(this.format('info', message, context))
    }
  }

  warn(message: string, context: LogContext): void {
    if (this.shouldLog('warn')) {
      console.warn(this.format('warn', message, context))
    }
  }

  error(message: string, context: LogContext, error?: Error): void {
    if (this.shouldLog('error')) {
      const ctx = error ? { ...context, error: error.message, stack: error.stack } : context
      console.error(this.format('error', message, ctx))
    }
  }

  /**
   * Create a child logger with bound context (module, requestId, etc.)
   */
  child(baseContext: Partial<LogContext>): BoundLogger {
    return new BoundLogger(this, baseContext)
  }
}

class BoundLogger {
  constructor(
    private logger: Logger,
    private baseContext: Partial<LogContext>
  ) {}

  private mergeContext(context?: Partial<LogContext>): LogContext {
    return {
      module: this.baseContext.module || 'unknown',
      ...this.baseContext,
      ...context,
    } as LogContext
  }

  debug(message: string, context?: Partial<LogContext>): void {
    this.logger.debug(message, this.mergeContext(context))
  }

  info(message: string, context?: Partial<LogContext>): void {
    this.logger.info(message, this.mergeContext(context))
  }

  warn(message: string, context?: Partial<LogContext>): void {
    this.logger.warn(message, this.mergeContext(context))
  }

  error(message: string, context?: Partial<LogContext>, error?: Error): void {
    this.logger.error(message, this.mergeContext(context), error)
  }
}

// Singleton instance
export const logger = new Logger()

/**
 * Create a scoped logger for a module.
 *
 * Example:
 *   const log = createLogger('asr-proxy', { requestId: nanoid(8) })
 *   log.info('ASR session opened')
 *   log.error('ASR upstream failed', {}, err)
 */
export function createLogger(module: string, context?: Partial<LogContext>): BoundLogger {
  return logger.child({ module, ...context })
}
