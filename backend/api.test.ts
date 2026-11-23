import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createDatabase } from './database/db.ts';
import { createBackendApp } from './app.ts';

function createTempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lead-manager-test-'));
  return path.join(dir, 'leads.db');
}

test('Lead Manager REST API full CRUD, search/filter, validation, and SQLite persistence across restarts', async () => {
  const dbPath = createTempDbPath();
  let repo = createDatabase(dbPath, { seedSampleData: false });
  let app = createBackendApp(repo);
  let server = app.listen(0);

  const getBaseUrl = () => {
    const addr = server.address() as AddressInfo;
    return `http://127.0.0.1:${addr.port}`;
  };

  try {
    // 1. Initial empty dashboard counts
    const initialDashRes = await fetch(`${getBaseUrl()}/api/dashboard`);
    assert.equal(initialDashRes.status, 200);
    const initialDash = await initialDashRes.json();
    assert.equal(initialDash.success, true);
    assert.equal(initialDash.data.total, 0);
    assert.deepEqual(initialDash.data.counts, {
      New: 0,
      Contacted: 0,
      Qualified: 0,
      Lost: 0,
    });

    // 2. Server-side validation rejects invalid lead payload with 400
    const badRes = await fetch(`${getBaseUrl()}/api/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '',
        email: 'bad-email',
        phone: '12',
        company: '',
        source: 'Invalid',
        status: 'Invalid',
      }),
    });
    assert.equal(badRes.status, 400);
    const badJson = await badRes.json();
    assert.equal(badJson.success, false);
    assert.ok(badJson.errors.name);
    assert.ok(badJson.errors.email);

    // 3. Create two leads via POST /api/leads
    const createRes1 = await fetch(`${getBaseUrl()}/api/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Elena Vance',
        email: 'elena@vancelabs.io',
        phone: '+1 (415) 555-0194',
        company: 'Vance Labs',
        source: 'Referral',
        status: 'Qualified',
      }),
    });
    assert.equal(createRes1.status, 201);
    const created1 = await createRes1.json();
    assert.equal(created1.data.name, 'Elena Vance');
    assert.equal(typeof created1.data.id, 'number');

    const createRes2 = await fetch(`${getBaseUrl()}/api/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Samir Patel',
        email: 'samir@apexworks.com',
        phone: '+1 (212) 555-0140',
        company: 'Apex Works',
        source: 'Website',
        status: 'New',
      }),
    });
    assert.equal(createRes2.status, 201);
    const created2 = await createRes2.json();

    // 4. Verify combined search + status filter on GET /api/leads
    const filteredRes = await fetch(
      `${getBaseUrl()}/api/leads?search=elena&status=Qualified`
    );
    assert.equal(filteredRes.status, 200);
    const filtered = await filteredRes.json();
    assert.equal(filtered.count, 1);
    assert.equal(filtered.data[0].id, created1.data.id);

    const noMatchRes = await fetch(
      `${getBaseUrl()}/api/leads?search=elena&status=Lost`
    );
    const noMatch = await noMatchRes.json();
    assert.equal(noMatch.count, 0);

    // 5. Verify GET /api/leads/:id and 404/400 handling
    const singleRes = await fetch(`${getBaseUrl()}/api/leads/${created1.data.id}`);
    assert.equal(singleRes.status, 200);
    const single = await singleRes.json();
    assert.equal(single.data.company, 'Vance Labs');

    const invalidIdRes = await fetch(`${getBaseUrl()}/api/leads/not-a-number`);
    assert.equal(invalidIdRes.status, 400);

    const missingRes = await fetch(`${getBaseUrl()}/api/leads/999999`);
    assert.equal(missingRes.status, 404);

    // 6. Update lead via PUT /api/leads/:id
    const updateRes = await fetch(`${getBaseUrl()}/api/leads/${created1.data.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Elena Vance',
        email: 'elena@vancerobotics.io',
        phone: '+1 (415) 555-0194',
        company: 'Vance Robotics',
        source: 'Referral',
        status: 'Contacted',
      }),
    });
    assert.equal(updateRes.status, 200);
    const updated = await updateRes.json();
    assert.equal(updated.data.company, 'Vance Robotics');
    assert.equal(updated.data.status, 'Contacted');

    // 7. Close server & SQLite connection, then reopen to prove disk persistence
    await new Promise<void>((resolve) => server.close(() => resolve()));
    repo.close();

    repo = createDatabase(dbPath, { seedSampleData: false });
    app = createBackendApp(repo);
    server = app.listen(0);

    const afterRestartDashRes = await fetch(`${getBaseUrl()}/api/dashboard`);
    const afterRestartDash = await afterRestartDashRes.json();
    assert.equal(afterRestartDash.data.total, 2);
    assert.equal(afterRestartDash.data.counts.Contacted, 1);
    assert.equal(afterRestartDash.data.counts.New, 1);

    // 8. Delete lead via DELETE /api/leads/:id
    const deleteRes = await fetch(`${getBaseUrl()}/api/leads/${created2.data.id}`, {
      method: 'DELETE',
    });
    assert.equal(deleteRes.status, 200);

    const finalListRes = await fetch(`${getBaseUrl()}/api/leads`);
    const finalList = await finalListRes.json();
    assert.equal(finalList.count, 1);
    assert.equal(finalList.data[0].company, 'Vance Robotics');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    repo.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});

test('Lead Manager API enforces security headers, CORS allowlist, malformed JSON handling, and safe parameterized search', async () => {
  const dbPath = createTempDbPath();
  const repo = createDatabase(dbPath, { seedSampleData: false });
  const app = createBackendApp(repo, {
    corsOrigin: 'http://localhost:3000,http://localhost:5173',
  });
  const server = app.listen(0);

  const getBaseUrl = () => {
    const addr = server.address() as AddressInfo;
    return `http://127.0.0.1:${addr.port}`;
  };

  try {
    repo.createLead({
      name: 'Priya Sharma',
      email: 'priya@meridiancloud.io',
      phone: '+1 (415) 890-2314',
      company: 'Meridian Cloud',
      source: 'Referral',
      status: 'Qualified',
    });

    // 1. Security headers check (no X-Powered-By, nosniff set)
    const healthRes = await fetch(`${getBaseUrl()}/api/health`);
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get('x-powered-by'), null);
    assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');

    // 2. CORS allowlist check
    const allowedCorsRes = await fetch(`${getBaseUrl()}/api/leads`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    assert.equal(
      allowedCorsRes.headers.get('access-control-allow-origin'),
      'http://localhost:5173'
    );

    const blockedCorsRes = await fetch(`${getBaseUrl()}/api/leads`, {
      headers: { Origin: 'https://untrusted.example.com' },
    });
    assert.equal(blockedCorsRes.headers.get('access-control-allow-origin'), null);

    // 3. Malformed JSON returns 400
    const badJsonRes = await fetch(`${getBaseUrl()}/api/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name": "Broken JSON"',
    });
    assert.equal(badJsonRes.status, 400);

    // 4. Invalid status filter returns 400
    const badStatusRes = await fetch(`${getBaseUrl()}/api/leads?status=Invalid`);
    assert.equal(badStatusRes.status, 400);

    // 5. SQL injection attempt in search returns 0 rows and leaves table intact
    const sqliRes = await fetch(
      `${getBaseUrl()}/api/leads?search=${encodeURIComponent("' OR '1'='1")}`
    );
    assert.equal(sqliRes.status, 200);
    const sqliBody = await sqliRes.json();
    assert.equal(sqliBody.count, 0);

    // 6. LIKE wildcard character "%" is treated literally, not as match-all
    const wildcardRes = await fetch(
      `${getBaseUrl()}/api/leads?search=${encodeURIComponent('%')}`
    );
    assert.equal(wildcardRes.status, 200);
    const wildcardBody = await wildcardRes.json();
    assert.equal(wildcardBody.count, 0);

    // Confirm original lead still intact
    const verifyRes = await fetch(`${getBaseUrl()}/api/leads`);
    const verifyBody = await verifyRes.json();
    assert.equal(verifyBody.count, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    repo.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});
