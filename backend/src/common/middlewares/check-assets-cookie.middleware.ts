import { NextFunction, Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';

import { Logger } from '@nestjs/common';

const logger = new Logger('CheckAssetsCookieMiddleware');

type RequestWithUser = Request & {
    user?: unknown;
};

export function checkAssetsCookieMiddleware(req: RequestWithUser, res: Response, next: NextFunction) {
    if (req.path !== '/assets/.app-config-v2.json') {
        return next();
    }

    const secret = process.env.INTERNAL_JWT_SECRET;

    if (!secret) {
        logger.error('INTERNAL_JWT_SECRET is not set');
        return res.status(500).json({ message: 'Internal server error' });
    }

    const session = req.cookies?.session;

    if (!session) {
        logger.debug('No session cookie found');
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        req.user = jwt.verify(session, secret);
        return next();
    } catch (error) {
        logger.debug(error);
        return res.status(401).json({ message: 'Unauthorized' });
    }
}
