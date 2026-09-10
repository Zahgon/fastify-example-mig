import { Module } from '@nestjs/common'
import { StatusController } from './status.controller.js'

/**
 * Registers the status controller. This is a genuine NestJS controller
 * (as opposed to the raw Fastify routes used for the admin/redirect
 * features that rely on framework-specific hooks and serialization).
 */
@Module({
  controllers: [StatusController]
})
export class StatusModule {}
