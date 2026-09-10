import { Global, Module } from '@nestjs/common'
import { RedirectRoutes } from './redirect.routes.js'

@Global()
@Module({
  providers: [RedirectRoutes],
  exports: [RedirectRoutes]
})
export class RedirectModule {}
