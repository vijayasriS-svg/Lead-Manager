import type { NextFunction, Request, Response } from 'express';
import type { LeadRepository } from '../database/db.ts';
import type { LeadInput, LeadStatus } from '../../src/types/lead.ts';
import { isValidLeadStatus } from '../../src/utils/validation.ts';

export function createLeadsController(repo: LeadRepository) {
  return {
    listLeads(req: Request, res: Response, next: NextFunction): void {
      try {
        const search =
          typeof req.query.search === 'string' ? req.query.search.trim() : '';
        const rawStatus =
          typeof req.query.status === 'string' ? req.query.status.trim() : '';

        let status: LeadStatus | '' = '';
        if (rawStatus && rawStatus.toLowerCase() !== 'all') {
          if (!isValidLeadStatus(rawStatus)) {
            res.status(400).json({
              success: false,
              message:
                'Invalid status filter. Allowed values: New, Contacted, Qualified, Lost.',
            });
            return;
          }
          status = rawStatus;
        }

        const leads = repo.getLeads({ search, status });
        res.status(200).json({
          success: true,
          count: leads.length,
          data: leads,
        });
      } catch (err) {
        next(err);
      }
    },

    getLead(_req: Request, res: Response, next: NextFunction): void {
      try {
        const leadId = res.locals.leadId as number;
        const lead = repo.getLeadById(leadId);

        if (!lead) {
          res.status(404).json({
            success: false,
            message: `Lead with ID ${leadId} was not found.`,
          });
          return;
        }

        res.status(200).json({
          success: true,
          data: lead,
        });
      } catch (err) {
        next(err);
      }
    },

    createLead(_req: Request, res: Response, next: NextFunction): void {
      try {
        const input = res.locals.validatedLead as LeadInput;
        const created = repo.createLead(input);

        res.status(201).json({
          success: true,
          message: 'Lead created successfully.',
          data: created,
        });
      } catch (err) {
        next(err);
      }
    },

    updateLead(_req: Request, res: Response, next: NextFunction): void {
      try {
        const leadId = res.locals.leadId as number;
        const input = res.locals.validatedLead as LeadInput;

        const updated = repo.updateLead(leadId, input);
        if (!updated) {
          res.status(404).json({
            success: false,
            message: `Lead with ID ${leadId} was not found.`,
          });
          return;
        }

        res.status(200).json({
          success: true,
          message: 'Lead updated successfully.',
          data: updated,
        });
      } catch (err) {
        next(err);
      }
    },

    deleteLead(_req: Request, res: Response, next: NextFunction): void {
      try {
        const leadId = res.locals.leadId as number;
        const deleted = repo.deleteLead(leadId);

        if (!deleted) {
          res.status(404).json({
            success: false,
            message: `Lead with ID ${leadId} was not found.`,
          });
          return;
        }

        res.status(200).json({
          success: true,
          message: 'Lead deleted successfully.',
          data: { id: leadId },
        });
      } catch (err) {
        next(err);
      }
    },

    getDashboard(_req: Request, res: Response, next: NextFunction): void {
      try {
        const summary = repo.getDashboardStats();
        res.status(200).json({
          success: true,
          data: summary,
        });
      } catch (err) {
        next(err);
      }
    },
  };
}
