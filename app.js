import bootstrap from './dist/bootstrap.js'

/**
 * This is the entry point of our application. The application is built with
 * NestJS running on top of the Fastify HTTP adapter. To preserve the public
 * interface used by the test suite (register this module as a plugin on a
 * Fastify instance and use `.inject()`, `.config`, `.indices`, `.close()`),
 * this file remains a valid Fastify plugin that delegates to the compiled
 * NestJS bootstrap.
 */
export default async function (fastify, opts) {
  return bootstrap(fastify, opts)
}
