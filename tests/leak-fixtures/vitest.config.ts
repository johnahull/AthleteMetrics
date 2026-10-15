import integrationConfig from '../../vitest.integration.config';

// The integration config (setup files, globalSetup leak check, aliases) with only the leaky fixture included
export default {
  ...integrationConfig,
  test: { ...integrationConfig.test, include: ['tests/leak-fixtures/*.leakcase.ts'] },
};
