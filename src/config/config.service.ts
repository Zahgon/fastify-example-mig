import { Injectable } from '@nestjs/common'

/**
 * The shape of the validated application configuration.
 * In the original Fastify application these values were validated
 * and exposed via `@fastify/env`. In NestJS we validate and expose
 * them through a dedicated provider.
 */
export interface AppConfig {
  NODE_ENV: string
  ELASTIC_CLOUD_ID?: string
  ELASTIC_ADDRESS?: string
  ELASTIC_API_KEY: string
  GITHUB_APP_ID: string
  GITHUB_APP_SECRET: string
  COOKIE_SECRET: string
  ALLOWED_USERS: string
}

const REQUIRED_KEYS = [
  'NODE_ENV',
  'ELASTIC_API_KEY',
  'GITHUB_APP_ID',
  'GITHUB_APP_SECRET',
  'COOKIE_SECRET',
  'ALLOWED_USERS'
] as const

/**
 * Reads and validates the configuration from `process.env`.
 * It mirrors the schema declared in the original `@fastify/env` setup:
 * NODE_ENV, ELASTIC_API_KEY, GITHUB_APP_ID, GITHUB_APP_SECRET, COOKIE_SECRET
 * and ALLOWED_USERS are required, while ELASTIC_CLOUD_ID and ELASTIC_ADDRESS
 * are optional.
 */
@Injectable()
export class ConfigService {
  readonly config: AppConfig

  constructor () {
    const env = process.env
    for (const key of REQUIRED_KEYS) {
      if (env[key] === undefined) {
        throw new Error(`env must have required property '${key}'`)
      }
    }

    this.config = {
      NODE_ENV: env.NODE_ENV as string,
      ELASTIC_CLOUD_ID: env.ELASTIC_CLOUD_ID,
      ELASTIC_ADDRESS: env.ELASTIC_ADDRESS,
      ELASTIC_API_KEY: env.ELASTIC_API_KEY as string,
      GITHUB_APP_ID: env.GITHUB_APP_ID as string,
      GITHUB_APP_SECRET: env.GITHUB_APP_SECRET as string,
      COOKIE_SECRET: env.COOKIE_SECRET as string,
      ALLOWED_USERS: env.ALLOWED_USERS as string
    }
  }
}
