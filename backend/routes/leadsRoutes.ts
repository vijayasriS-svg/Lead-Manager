import { Router } from 'express';
import type { LeadRepository } from '../database/db.ts';
import { createLeadsController } from '../controllers/leadsController.ts';
import { validateLeadBody, validateLeadId } from '../middleware/validateLead.ts';

export function createApiRouter(repo: LeadRepository): Router {
  const router = Router();
  const controller = createLeadsController(repo);

  router.get('/dashboard', controller.getDashboard);

  router.get('/leads', controller.listLeads);
  router.get('/leads/:id', validateLeadId, controller.getLead);
  router.post('/leads', validateLeadBody, controller.createLead);
  router.put('/leads/:id', validateLeadId, validateLeadBody, controller.updateLead);
  router.delete('/leads/:id', validateLeadId, controller.deleteLead);

  return router;
}
