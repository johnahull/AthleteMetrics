import "express-session";
import type { OrganizationType } from "@shared/organization-type-utils";

declare module "express-session" {
  interface SessionData {
    sessionToken?: string; // Added for enhanced auth
    user?: {
      id: string;
      username: string;
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      athleteId?: string;
      isSiteAdmin?: boolean;
      primaryOrganizationId?: string;
      emailVerified?: boolean;
    };
    // Keep old admin for transition
    admin?: boolean;
    // Impersonation fields
    originalUser?: {
      id: string;
      username: string;
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      athleteId?: string;
      isSiteAdmin?: boolean;
      primaryOrganizationId?: string;
      emailVerified?: boolean;
    };
    isImpersonating?: boolean;
    impersonationStartTime?: Date;
    /**
     * Tracks whether the session's userId column in the database has been synced.
     * Set to true after the first successful sync to prevent redundant database queries
     * on subsequent requests for the same session.
     *
     * This flag optimizes performance by avoiding unnecessary UPDATE queries to the
     * session table when the userId is already set.
     */
    userIdSynced?: boolean;
  }
}

declare global {
  namespace Express {
    interface Request {
      /**
       * Organization type validated and set by organization-type middleware
       */
      organizationType?: OrganizationType | null;
      /**
       * Organization type context metadata
       */
      organizationTypeContext?: {
        source: 'param' | 'query' | 'body';
        validated: boolean;
      };
    }
  }
}