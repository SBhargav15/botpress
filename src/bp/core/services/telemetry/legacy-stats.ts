import LicensingService from 'common/licensing-service'
import { ConfigProvider } from 'core/config/config-loader'
import Database from 'core/database'
import { UserRepository } from 'core/repositories'
import { TelemetryRepository } from 'core/repositories/telemetry_payload'
import { TYPES } from 'core/types'
import { inject, injectable } from 'inversify'
import ms from 'ms'
import uuid from 'uuid'

import { GhostService } from '..'
import AuthService from '../auth/auth-service'
import { BotService } from '../bot-service'
import { CMSService } from '../cms'
import { JobService } from '../job-service'
import { WorkspaceService } from '../workspace-service'

import { TelemetryStats } from './telemetry-stats'

@injectable()
export class LegacyStats extends TelemetryStats {
  protected url: string
  protected lock: string
  protected interval: number

  constructor(
    @inject(TYPES.GhostService) ghostService: GhostService,
    @inject(TYPES.Database) database: Database,
    @inject(TYPES.LicensingService) licenseService: LicensingService,
    @inject(TYPES.JobService) jobService: JobService,
    @inject(TYPES.TelemetryRepository) telemetryRepo: TelemetryRepository,
    @inject(TYPES.ConfigProvider) private config: ConfigProvider,
    @inject(TYPES.CMSService) private cmsService: CMSService,
    @inject(TYPES.AuthService) private authService: AuthService,
    @inject(TYPES.UserRepository) private userRepository: UserRepository,
    @inject(TYPES.BotService) private botService: BotService,
    @inject(TYPES.WorkspaceService) private workspaceService: WorkspaceService
  ) {
    super(ghostService, database, licenseService, jobService, telemetryRepo)
    this.url = 'https://telemetry.botpress.io/ingest'
    this.lock = 'botpress:telemetry-legacyStats'
    this.interval = ms('1d')
  }

  protected async getStats() {
    const config = await this.config.getBotpressConfig()

    return {
      schema: '1.0.0',
      timestamp: new Date().toISOString(),
      uuid: uuid.v4(),
      server: await this.getServerStats(),
      license: {
        type: process.IS_PRO_ENABLED ? 'pro' : 'ce',
        status: await this.getLicenseStatus(),
        isProAvailable: process.IS_PRO_AVAILABLE,
        showPoweredBy: config.showPoweredBy
      },
      bots: {
        count: await this.getBotsCount()
      },
      workspaces: {
        count: await this.getWorkspacesCount(),
        pipelines: {
          stages: {
            count: await this.getPipelineStagesCount()
          }
        }
      },
      flows: {
        count: await this.getFlowCount()
      },
      nlu: {
        intents: {
          count: await this.getIntentsCount()
        },
        entities: {
          count: await this.getEntitiesCount()
        }
      },
      qna: {
        count: await this.getQnaCount()
      },
      hooks: {
        global: {
          count: await this.getGlobalHooksCount()
        }
      },
      actions: {
        global: {
          count: await this.getGlobalActionsCount()
        },
        bot: {
          count: await this.getBotActionsCount()
        }
      },
      contentElements: {
        count: await this.cmsService.countContentElements()
      },
      users: {
        superAdmins: {
          count: config.superAdmins.length
        },
        collaborators: {
          count: await this.getCollaboratorsCount()
        },
        chat: {
          count: await this.userRepository.getUserCount()
        }
      },
      auth: {
        strategies: {
          count: Object.keys(config.authStrategies).length
        }
      }
    }
  }

  private async getBotsCount(): Promise<number> {
    return (await this.botService.getBotsIds()).length
  }

  private async getWorkspacesCount(): Promise<number> {
    return (await this.workspaceService.getWorkspaces()).length
  }

  private async getPipelineStagesCount(): Promise<number> {
    const workspaces = await this.workspaceService.getWorkspaces()
    return workspaces.reduce((acc, workspace) => {
      return acc + workspace.pipeline.length
    }, 0)
  }

  private async getFlowCount(): Promise<number> {
    return (await this.ghostService.bots().directoryListing('/', '*/flows/*.flow.json', '*/flows/error.flow.json'))
      .length
  }

  private async getIntentsCount(): Promise<number> {
    return (await this.ghostService.bots().directoryListing('/', '*/intents/*')).length
  }

  private async getEntitiesCount(): Promise<number> {
    return (await this.ghostService.bots().directoryListing('/', '*/entities/*')).length
  }

  private async getQnaCount(): Promise<number> {
    return (await this.ghostService.bots().directoryListing('/', '*/qna/*')).length
  }

  private async getLicenseStatus(): Promise<string> {
    return (await this.licenseService.getLicenseStatus()).status
  }

  private async getGlobalHooksCount(): Promise<number> {
    return (await this.ghostService.global().directoryListing('hooks', '*.js')).length
  }

  private async getGlobalActionsCount(): Promise<number> {
    return (await this.ghostService.global().directoryListing('actions', '*.js')).length
  }

  private async getBotActionsCount(): Promise<number> {
    return (await this.ghostService.bots().directoryListing('/', '*/actions/*')).length
  }

  private async getCollaboratorsCount(): Promise<number> {
    return (await this.authService.getAllUsers()).length
  }
}