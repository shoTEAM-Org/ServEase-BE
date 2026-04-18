import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import {
  CORRELATION_ID_HEADER,
  normalizeCorrelationId,
  runWithCorrelationContext,
} from '@app/common';

type RequestWithCorrelationId = Request & { correlationId?: string };

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incomingCorrelationId = req.header(CORRELATION_ID_HEADER);
    const correlationId = normalizeCorrelationId(incomingCorrelationId);

    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    (req as RequestWithCorrelationId).correlationId = correlationId;

    runWithCorrelationContext(correlationId, 'gateway', () => {
      next();
    });
  }
}
