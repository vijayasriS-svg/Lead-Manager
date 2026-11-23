import type { NextFunction, Request, Response } from 'express';
import { validateLeadInput } from '../../src/utils/validation.ts';

export function validateLeadId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const rawId = req.params.id;
  if (!rawId || !/^\d+$/.test(rawId)) {
    res.status(400).json({
      success: false,
      message: 'Invalid lead ID. ID must be a positive integer.',
    });
    return;
  }

  const parsedId = Number.parseInt(rawId, 10);
  if (!Number.isSafeInteger(parsedId) || parsedId <= 0) {
    res.status(400).json({
      success: false,
      message: 'Invalid lead ID. ID must be a positive integer.',
    });
    return;
  }

  res.locals.leadId = parsedId;
  next();
}

export function validateLeadBody(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { valid, errors, sanitized } = validateLeadInput(req.body);

  if (!valid) {
    res.status(400).json({
      success: false,
      message: 'Validation failed. Please check the submitted lead fields.',
      errors,
    });
    return;
  }

  res.locals.validatedLead = sanitized;
  next();
}
