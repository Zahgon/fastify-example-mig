import { Global, Module } from '@nestjs/common'
import { AdminRoutes } from './admin.routes.js'

@Global()
@Module({
  providers: [AdminRoutes],
  exports: [AdminRoutes]
})
export class AdminModule {}
