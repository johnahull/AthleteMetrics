/**
 * AM-FEAT-019 P2: a template that vanishes between the auth check and the write must surface as
 * TemplateNotFoundError (the route answers 404), never as an undefined row (an empty 200).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../db', () => {
  // update().set().where().returning() resolving to no rows = the row is gone
  const chain: any = {};
  chain.update = () => chain;
  chain.set = () => chain;
  chain.where = () => chain;
  chain.returning = () => Promise.resolve([]);
  // the archived-or-gone check after an empty update: the row is gone
  chain.select = () => chain;
  chain.from = () => chain;
  chain.then = (res: any, rej: any) => Promise.resolve([]).then(res, rej);
  return { db: chain };
});
vi.mock('../../storage', () => ({ storage: {} }));

import { updateTemplate, archiveTemplate, TemplateNotFoundError } from '../eval-template-service';

describe('eval template service: vanished row', () => {
  it('updateTemplate throws TemplateNotFoundError', async () => {
    await expect(updateTemplate('gone', { name: 'x' })).rejects.toBeInstanceOf(TemplateNotFoundError);
  });

  it('archiveTemplate throws TemplateNotFoundError', async () => {
    await expect(archiveTemplate('gone')).rejects.toBeInstanceOf(TemplateNotFoundError);
  });

  it('carries the message the route returns', async () => {
    await expect(archiveTemplate('gone')).rejects.toThrow('Template not found');
  });
});
