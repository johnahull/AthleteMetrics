/**
 * Mock Redis module for tests
 * Redis is an optional dependency that may not be installed in test environments
 */

export const createClient = () => {
  return null;
};

export default {
  createClient,
};
