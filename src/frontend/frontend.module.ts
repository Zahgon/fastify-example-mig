import { Global, Module } from '@nestjs/common'
import { FrontendRoutes } from './frontend.routes.js'

@Global()
@Module({
  providers: [FrontendRoutes],
  exports: [FrontendRoutes]
})
export class FrontendModule {}
