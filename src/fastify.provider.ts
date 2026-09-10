import type { FastifyInstance } from 'fastify'

/**
 * Injection token for the underlying Fastify instance that NestJS runs on.
 * Some features (authorization, redirects) need direct access to the
 * instance to read framework decorators such as `httpErrors` (added by the
 * sensible plugin) or to register raw routes and reply decorators that do
 * not map onto NestJS abstractions.
 */
export const FASTIFY_INSTANCE = 'FASTIFY_INSTANCE'

export type FastifyInstanceRef = FastifyInstance
