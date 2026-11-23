import Database from 'better-sqlite3';
import path from 'path';
import {
  LEAD_SOURCES,
  type DashboardSummary,
  type Lead,
  type LeadInput,
  type LeadSource,
  type LeadStatus,
  type StatusCounts,
} from '../../src/types/lead.ts';

export interface LeadFilterOptions {
  search?: string;
  status?: LeadStatus | '';
}

export interface LeadRepository {
  dbPath: string;
  getLeads(filters?: LeadFilterOptions): Lead[];
  getLeadById(id: number): Lead | undefined;
  createLead(input: LeadInput): Lead;
  updateLead(id: number, input: LeadInput): Lead | undefined;
  deleteLead(id: number): boolean;
  getDashboardStats(): DashboardSummary;
  close(): void;
}

const INITIAL_SEED_LEADS: LeadInput[] = [
  {
    name: 'Priya Sharma',
    email: 'priya.sharma@meridiancloud.io',
    phone: '+1 (415) 890-2314',
    company: 'Meridian Cloud Systems',
    source: 'Referral',
    status: 'Qualified',
  },
  {
    name: 'Marcus Chen',
    email: 'm.chen@northstarlogistics.com',
    phone: '+1 (312) 642-7780',
    company: 'Northstar Logistics',
    source: 'Website',
    status: 'New',
  },
  {
    name: 'Hannah Lindqvist',
    email: 'hannah@kestrelbio.se',
    phone: '+46 8 501 244 10',
    company: 'Kestrel BioLabs',
    source: 'Advertisement',
    status: 'Contacted',
  },
  {
    name: 'David Morales',
    email: 'dmorales@cobaltfreight.com',
    phone: '+1 (512) 704-9182',
    company: 'Cobalt Freight Group',
    source: 'Cold Call',
    status: 'Contacted',
  },
  {
    name: 'Claire Okafor',
    email: 'claire.okafor@harborfin.co.uk',
    phone: '+44 20 7946 0821',
    company: 'Harbor Financial Tech',
    source: 'Social Media',
    status: 'Qualified',
  },
  {
    name: 'Owen Takahashi',
    email: 'owen@solsticegrid.com',
    phone: '+1 (206) 441-6095',
    company: 'Solstice Energy Grid',
    source: 'Website',
    status: 'New',
  },
  {
    name: 'Rachel Becker',
    email: 'rbecker@vervehardware.com',
    phone: '+1 (617) 338-4519',
    company: 'Verve Industrial',
    source: 'Other',
    status: 'Lost',
  },
];

export function createDatabase(
  configuredPath?: string,
  options?: { seedSampleData?: boolean }
): LeadRepository {
  const dbPath = path.resolve(configuredPath || process.env.DATABASE_PATH || './leads.db');
  const shouldSeed =
    options?.seedSampleData ?? process.env.SEED_SAMPLE_DATA !== 'false';

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      company TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // One-time initial seed into SQLite so first run displays realistic CRM records
  // without ever re-seeding if the user intentionally deletes all leads.
  if (shouldSeed) {
    const seededRow = db
      .prepare('SELECT value FROM app_meta WHERE key = ?')
      .get('initial_seed_completed') as { value: string } | undefined;

    if (!seededRow) {
      const existingCountRow = db
        .prepare('SELECT COUNT(*) as count FROM leads')
        .get() as { count: number };

      const seedTx = db.transaction(() => {
        if (existingCountRow.count === 0) {
          const insertStmt = db.prepare(`
            INSERT INTO leads (name, email, phone, company, source, status)
            VALUES (?, ?, ?, ?, ?, ?)
          `);
          for (const lead of INITIAL_SEED_LEADS) {
            insertStmt.run(
              lead.name,
              lead.email,
              lead.phone,
              lead.company,
              lead.source,
              lead.status
            );
          }
        }
        db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(
          'initial_seed_completed',
          new Date().toISOString()
        );
      });
      seedTx();
    }
  }

  const getByIdStmt = db.prepare(`
    SELECT id, name, email, phone, company, source, status, created_at
    FROM leads
    WHERE id = ?
  `);

  const insertStmt = db.prepare(`
    INSERT INTO leads (name, email, phone, company, source, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const updateStmt = db.prepare(`
    UPDATE leads
    SET name = ?, email = ?, phone = ?, company = ?, source = ?, status = ?
    WHERE id = ?
  `);

  const deleteStmt = db.prepare('DELETE FROM leads WHERE id = ?');

  const countTotalStmt = db.prepare('SELECT COUNT(*) as total FROM leads');

  const countByStatusStmt = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM leads
    GROUP BY status
  `);

  const countBySourceStmt = db.prepare(`
    SELECT source, COUNT(*) as count
    FROM leads
    GROUP BY source
  `);

  const recentLeadsStmt = db.prepare(`
    SELECT id, name, email, phone, company, source, status, created_at
    FROM leads
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT 5
  `);

  return {
    dbPath,

    getLeads(filters: LeadFilterOptions = {}): Lead[] {
      const conditions: string[] = [];
      const params: Array<string> = [];

      const searchTerm = (filters.search || '').trim();
      if (searchTerm) {
        const escapedSearch = searchTerm.replace(/[\\%_]/g, '\\$&');
        conditions.push("LOWER(name) LIKE LOWER(?) ESCAPE '\\'");
        params.push(`%${escapedSearch}%`);
      }

      if (filters.status) {
        conditions.push('status = ?');
        params.push(filters.status);
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const query = `
        SELECT id, name, email, phone, company, source, status, created_at
        FROM leads
        ${whereClause}
        ORDER BY datetime(created_at) DESC, id DESC
      `;

      return db.prepare(query).all(...params) as Lead[];
    },

    getLeadById(id: number): Lead | undefined {
      return getByIdStmt.get(id) as Lead | undefined;
    },

    createLead(input: LeadInput): Lead {
      const info = insertStmt.run(
        input.name,
        input.email,
        input.phone,
        input.company,
        input.source,
        input.status
      );
      const insertedId = Number(info.lastInsertRowid);
      return getByIdStmt.get(insertedId) as Lead;
    },

    updateLead(id: number, input: LeadInput): Lead | undefined {
      const info = updateStmt.run(
        input.name,
        input.email,
        input.phone,
        input.company,
        input.source,
        input.status,
        id
      );
      if (info.changes === 0) {
        return undefined;
      }
      return getByIdStmt.get(id) as Lead;
    },

    deleteLead(id: number): boolean {
      const info = deleteStmt.run(id);
      return info.changes > 0;
    },

    getDashboardStats(): DashboardSummary {
      const totalRow = countTotalStmt.get() as { total: number };
      const statusRows = countByStatusStmt.all() as Array<{
        status: LeadStatus;
        count: number;
      }>;

      const counts: StatusCounts = {
        New: 0,
        Contacted: 0,
        Qualified: 0,
        Lost: 0,
      };

      for (const row of statusRows) {
        if (row.status in counts) {
          counts[row.status] = row.count;
        }
      }

      const total = totalRow.total;

      const sourceRows = countBySourceStmt.all() as Array<{
        source: LeadSource;
        count: number;
      }>;

      const bySource = Object.fromEntries(
        LEAD_SOURCES.map((source) => [source, 0])
      ) as Record<LeadSource, number>;

      for (const row of sourceRows) {
        if (row.source in bySource) {
          bySource[row.source] = row.count;
        }
      }

      const recentLeads = recentLeadsStmt.all() as Lead[];

      return {
        total,
        counts,
        bySource,
        recentLeads,
      };
    },

    close(): void {
      db.close();
    },
  };
}
