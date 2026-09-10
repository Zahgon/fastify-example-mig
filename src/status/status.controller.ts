import { readFileSync } from 'fs'
import { Controller, Get } from '@nestjs/common'

const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
) as { version: string }

/**
 * Exposes a status route, so it is possible to quickly understand if the
 * application is running and which version is deployed.
 */
@Controller('_app')
export class StatusController {
  @Get('status')
  onStatus (): { status: string, version: string } {
    return { status: 'ok', version }
  }
}
