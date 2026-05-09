import { Request, Response } from 'express';

import { Body, Get, Controller, Res, Req, Param, Logger, Post, BadRequestException, BadGatewayException } from '@nestjs/common';

import {
    REQUEST_TEMPLATE_TYPE_VALUES,
    TRequestTemplateTypeKeys,
} from '@remnawave/backend-contract';
import { APP_CONFIG_ROUTE_WO_LEADING_PATH } from '@remnawave/subscription-page-types';

import { GetJWTPayload } from '@common/decorators/get-jwt-payload';
import { ClientIp } from '@common/decorators/get-ip';
import { IJwtPayload } from '@common/constants';

import { SubpageConfigService } from './subpage-config.service';
import { RootService } from './root.service';

const HAPP_CRYPT5_API_URL = 'https://crypto.happ.su/api-v2.php';

@Controller()
export class RootController {
    private readonly logger = new Logger(RootController.name);

    constructor(
        private readonly rootService: RootService,
        private readonly subpageConfigService: SubpageConfigService,
    ) {}

    @Get(APP_CONFIG_ROUTE_WO_LEADING_PATH)
    async getSubscriptionPageConfig(@GetJWTPayload() user: IJwtPayload, @Req() request: Request) {
        return await this.subpageConfigService.getSubscriptionPageConfig(user.su, request);
    }

    @Post(':shortUuid/happ-crypt5')
    async createHappCrypt5Link(@Body('url') url: unknown) {
        if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
            throw new BadRequestException('Invalid subscription URL');
        }

        const response = await fetch(HAPP_CRYPT5_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url }),
        });

        if (!response.ok) {
            throw new BadGatewayException(`Happ crypt5 API responded with ${response.status}`);
        }

        const contentType = response.headers.get('content-type');
        let link: unknown;

        if (contentType?.includes('application/json')) {
            const data: unknown = await response.json();

            if (typeof data === 'string') {
                link = data;
            } else if (data && typeof data === 'object') {
                const payload = data as Record<string, unknown>;
                link = payload.url ?? payload.link ?? payload.result;
            }
        } else {
            link = await response.text();
        }

        if (typeof link !== 'string' || !link.startsWith('happ://crypt5/')) {
            throw new BadGatewayException('Happ crypt5 API returned an invalid link');
        }

        return { link };
    }

    @Get([':shortUuid', ':shortUuid/:clientType'])
    async root(
        @ClientIp() clientIp: string,
        @Req() request: Request,
        @Res() response: Response,
        @Param('shortUuid') shortUuid: string,
        @Param('clientType') clientType: string,
    ) {
        if (request.path.startsWith('/assets') || request.path.startsWith('/locales')) {
            response.socket?.destroy();
            return;
        }

        if (clientType === undefined) {
            return await this.rootService.serveSubscriptionPage(
                clientIp,
                request,
                response,
                shortUuid,
            );
        }

        if (!REQUEST_TEMPLATE_TYPE_VALUES.includes(clientType as TRequestTemplateTypeKeys)) {
            this.logger.error(`Invalid client type: ${clientType}`);

            response.socket?.destroy();
            return;
        } else {
            return await this.rootService.serveSubscriptionPage(
                clientIp,
                request,
                response,
                shortUuid,
                clientType as TRequestTemplateTypeKeys,
            );
        }
    }
}
