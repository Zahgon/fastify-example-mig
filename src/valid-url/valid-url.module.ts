import { Global, Module } from '@nestjs/common'
import { ValidUrlService } from './valid-url.service.js'

/**
 * Exposes the `ValidUrlService` application-wide, mirroring the
 * non-encapsulated `validUrl` plugin of the original application
 * (`fastify.isValidUrl`).
 */
@Global()
@Module({
  providers: [ValidUrlService],
  exports: [ValidUrlService]
})
export class ValidUrlModule {}
