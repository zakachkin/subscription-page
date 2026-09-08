import { Request, Response } from 'express';

import {
    BadGatewayException,
    BadRequestException,
    Body,
    Controller,
    Get,
    Logger,
    Param,
    Post,
    Req,
    Res,
} from '@nestjs/common';

import { TRequestTemplateTypeKeys } from '@remnawave/backend-contract';

import { AxiosService } from '@common/axios/axios.service';
import { ClientIp } from '@common/decorators/get-ip';
import { ResolvedShortUuid } from '@common/decorators/get-resolved-short-uuid';
import { IsBrowser } from '@common/decorators/is-browser';

import { WebpageService } from '@modules/webpage/webpage.service';

import { SubscriptionService } from './subscription.service';

const HAPP_CRYPT5_API_URL = 'https://crypto.happ.su/api-v2.php';
const HAPP_CRYPT5_TIMEOUT_MS = 10_000;

@Controller()
export class SubscriptionController {
    private readonly logger = new Logger(SubscriptionController.name);

    constructor(
        private readonly subscriptionService: SubscriptionService,
        private readonly webpageService: WebpageService,
        private readonly axiosService: AxiosService,
    ) {}

    @Post(':shortUuid/happ-crypt5')
    async createHappCrypt5Link(
        @ClientIp() clientIp: string,
        @Param('shortUuid') shortUuid: string,
        @Req() request: Request,
        @Body('url') url: unknown,
    ) {
        if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
            throw new BadRequestException('Invalid subscription URL');
        }

        let subscriptionUrl: URL;

        try {
            subscriptionUrl = new URL(url);
        } catch {
            throw new BadRequestException('Invalid subscription URL');
        }

        const lastPathSegment = subscriptionUrl.pathname.split('/').filter(Boolean).at(-1);

        if (lastPathSegment !== shortUuid) {
            throw new BadRequestException('Subscription URL short UUID mismatch');
        }

        // headerFilterMiddleware removes Host/X-Forwarded-* before this controller runs.
        // Use the browser Origin header when it is available, but do not require it.
        const requestOrigin = request.get('origin');

        if (requestOrigin && subscriptionUrl.origin !== requestOrigin) {
            throw new BadRequestException('Subscription URL origin mismatch');
        }

        const subscriptionInfo = await this.axiosService.getSubscriptionInfo(clientIp, shortUuid);

        if (!subscriptionInfo.isOk || !subscriptionInfo.response) {
            throw new BadRequestException('Subscription not found');
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), HAPP_CRYPT5_TIMEOUT_MS);

        let response: globalThis.Response;

        try {
            response = await fetch(HAPP_CRYPT5_API_URL, {
                method: 'POST',
                headers: {
                    Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
                    'Content-Type': 'application/json',
                    'User-Agent': 'remnawave-subscription-page/1.0',
                },
                body: JSON.stringify({ url }),
                signal: controller.signal,
            });
        } catch (error) {
            this.logger.warn(
                error instanceof Error
                    ? `Happ crypt5 API request failed: ${error.message}`
                    : 'Happ crypt5 API request failed',
            );
            throw new BadGatewayException('Happ crypt5 API request failed');
        } finally {
            clearTimeout(timeout);
        }

        const rawResponse = await response.text();

        if (!response.ok) {
            this.logger.warn(
                `Happ crypt5 API responded with ${response.status}: ${rawResponse.slice(0, 300)}`,
            );
            throw new BadGatewayException('Happ crypt5 API request failed');
        }

        let link: unknown = rawResponse.trim();
        const contentType = response.headers.get('content-type');

        if (contentType?.includes('application/json')) {
            try {
                const data: unknown = JSON.parse(rawResponse);

                if (typeof data === 'string') {
                    link = data;
                } else if (data && typeof data === 'object') {
                    const payload = data as Record<string, unknown>;
                    link = payload.encrypted_link ?? payload.url ?? payload.link ?? payload.result;
                }
            } catch {
                link = rawResponse.trim();
            }
        }

        if (typeof link !== 'string' || !link.startsWith('happ://crypt5/')) {
            this.logger.warn(`Happ crypt5 API returned an invalid link: ${rawResponse.slice(0, 300)}`);
            throw new BadGatewayException('Happ crypt5 API returned an invalid link');
        }

        return { link };
    }

    @Get([':shortUuid', ':shortUuid/:clientType'])
    async root(
        @ClientIp() clientIp: string,
        @ResolvedShortUuid() resolvedShortUuid: string | undefined | null,
        @Req() request: Request,
        @Res() response: Response,
        @Param('shortUuid') shortUuid: string,
        @Param('clientType') clientType: string,
        @IsBrowser() isBrowser: boolean,
    ) {
        if (isBrowser) {
            return this.webpageService.serveWebpage(
                clientIp,
                request,
                response,
                resolvedShortUuid ?? shortUuid,
            );
        }

        return this.subscriptionService.serveSubscriptionPage(
            clientIp,
            request,
            response,
            resolvedShortUuid ?? shortUuid,
            clientType ? (clientType as TRequestTemplateTypeKeys) : undefined,
        );
    }
}
