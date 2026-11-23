import type { NextFunction, Request, Response } from 'express';

export function apiNotFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
  });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (
    err instanceof SyntaxError &&
    typeof (err as { status?: number }).status === 'number' &&
    (err as { status?: number }).status === 400
  ) {
    res.status(400).json({
      success: false,
      message: 'Invalid JSON payload in request body.',
    });
    return;
  }

  console.error('[Lead Manager API Error]', err);
  res.status(500).json({
    success: false,
    message: 'An unexpected server error occurred. Please try again.',
  });
}
