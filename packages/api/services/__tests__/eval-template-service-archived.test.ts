/** AM-FEAT-019 P2: an archived template can be neither edited nor archived again (409 at the route). */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../db', () => {
  // update() matches no active row; the follow-up select finds the archived row
  const chain: any = {};
  chain.update = () => chain;
  chain.set = () => chain;
  chain.where = () => chain;
  chain.returning = () => Promise.resolve([]);
  chain.select = () => chain;
  chain.from = () => chain;
  chain.then = (res: any, rej: any) => Promise.resolve([{ id: 't', archivedAt: new Date() }]).then(res, rej);
  return { db: chain };
});
vi.mock('../../storage', () => ({ storage: {} }));

import { updateTemplate, archiveTemplate, TemplateArchivedError } from '../eval-template-service';

describe('eval template service: archived template', () => {
  it('updateTemplate throws TemplateArchivedError', async () => {
    await expect(updateTemplate('t', { name: 'x' })).rejects.toBeInstanceOf(TemplateArchivedError);
  });
  it('archiveTemplate throws TemplateArchivedError', async () => {
    await expect(archiveTemplate('t')).rejects.toBeInstanceOf(TemplateArchivedError);
  });
  it('carries the message the route returns', async () => {
    await expect(archiveTemplate('t')).rejects.toThrow('Template is archived');
  });
});
