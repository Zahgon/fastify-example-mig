import { Global, Module } from '@nestjs/common'
import { AuthorizationService } from './authorization.service.js'

@Global()
@Module({
  providers: [AuthorizationService],
  exports: [AuthorizationService]
})
export class AuthorizationModule {}
