import { NextFunction, Request, Response } from 'express';

export function checkAssetsCookieMiddleware(_req: Request, _res: Response, next: NextFunction) {
    return next();
}
