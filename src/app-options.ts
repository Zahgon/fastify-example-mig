/**
 * Options passed to the application at bootstrap time.
 * These mirror the `opts` object the original Fastify plugin received:
 * `testing` selects the mock authorization utilities and skips the real
 * Elasticsearch client shutdown, while `elasticMock` injects a mock
 * connection into the Elasticsearch client.
 */
export interface AppOptions {
  testing?: boolean
  elasticMock?: { getConnection(): unknown }
  [key: string]: unknown
}

/**
 * Injection token used to provide the bootstrap `AppOptions` to any
 * provider that needs them (Elasticsearch, Authorization, ...).
 */
export const APP_OPTIONS = 'APP_OPTIONS'
