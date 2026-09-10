import { Global, Module } from '@nestjs/common'
import { ConfigService } from './config.service.js'

/**
 * Exposes the validated application configuration application-wide.
 * Declared `@Global` so any module can inject `ConfigService` without
 * having to import this module explicitly, mirroring the non-encapsulated
 * nature of the original `@fastify/env` plugin (`fastify.config`).
 */
@Global()
@Module({
  providers: [ConfigService],
  exports: [ConfigService]
})
export class ConfigModule {}
