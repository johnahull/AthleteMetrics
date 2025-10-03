/**
 * Team management routes
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { TeamService } from "../services/team-service";
import { requireAuth } from "../middleware";
import { asyncHandler } from "../utils/errors";

const teamService = new TeamService();

// Rate limiting for team creation
const createLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20, // Limit each IP to 20 team creation requests per windowMs
  message: { message: "Too many team creation attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Rate limiting for team archiving operations
const archiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 50, // Limit each IP to 50 archive operations per windowMs
  message: { message: "Too many team archive operations, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// Rate limiting for team management operations (add/remove players)
const teamManagementLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit each IP to 100 management operations per windowMs
  message: { message: "Too many team management operations, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export function registerTeamRoutes(app: Express) {
  /**
   * Get teams with organization filtering
   * @route GET /api/teams
   * @query {string} [organizationId] - Filter by organization ID
   * @access All authenticated users (filtered by organization access)
   * @returns {Object[]} teams - Array of team objects
   */
  app.get("/api/teams", requireAuth, asyncHandler(async (req: any, res: any) => {
    const { organizationId } = req.query;
    const filters = { organizationId: organizationId as string | undefined };

    const teams = await teamService.getTeams(filters, req.session.user!.id);
    res.json(teams);
  }));

  /**
   * Create a new team
   * @route POST /api/teams
   * @body {Object} teamData - Team creation data
   * @access Coaches, Organization Admins, Site Admins
   * @returns {Object} team - Created team object
   */
  app.post("/api/teams", createLimiter, requireAuth, asyncHandler(async (req: any, res: any) => {
    const team = await teamService.createTeam(req.body, req.session.user!.id);
    res.status(201).json(team);
  }));

  /**
   * Update team
   * @route PATCH /api/teams/:id
   * @param {string} id - Team ID
   * @body {Object} teamData - Team update data
   * @access Coaches, Organization Admins, Site Admins
   * @returns {Object} team - Updated team object
   */
  app.patch("/api/teams/:id", requireAuth, asyncHandler(async (req: any, res: any) => {
    const team = await teamService.updateTeam(
      req.params.id,
      req.body,
      req.session.user!.id
    );
    res.json(team);
  }));

  /**
   * Delete team
   * @route DELETE /api/teams/:id
   * @param {string} id - Team ID
   * @access Coaches, Organization Admins, Site Admins
   * @returns {Object} message - Success message
   */
  app.delete("/api/teams/:id", requireAuth, asyncHandler(async (req: any, res: any) => {
    await teamService.deleteTeam(req.params.id, req.session.user!.id);
    res.json({ message: "Team deleted successfully" });
  }));

  /**
   * Archive team
   * @route POST /api/teams/:id/archive
   * @param {string} id - Team ID
   * @body {Object} archiveData - Archive data (archiveDate, season)
   * @access Coaches, Organization Admins, Site Admins
   * @returns {Object} message - Success message
   */
  app.post("/api/teams/:id/archive", requireAuth, archiveLimiter, asyncHandler(async (req: any, res: any) => {
    await teamService.archiveTeam(req.params.id, req.body, req.session.user!.id);
    res.json({ message: "Team archived successfully" });
  }));

  /**
   * Unarchive team
   * @route POST /api/teams/:id/unarchive
   * @param {string} id - Team ID
   * @access Coaches, Organization Admins, Site Admins
   * @returns {Object} message - Success message
   */
  app.post("/api/teams/:id/unarchive", requireAuth, archiveLimiter, asyncHandler(async (req: any, res: any) => {
    await teamService.unarchiveTeam(req.params.id, req.session.user!.id);
    res.json({ message: "Team unarchived successfully" });
  }));

  /**
   * Update team membership
   * @route PATCH /api/teams/:teamId/members/:userId
   * @param {string} teamId - Team ID
   * @param {string} userId - User ID
   * @body {Object} membershipData - Membership update data
   * @access Coaches, Organization Admins, Site Admins
   * @returns {Object} message - Success message
   */
  app.patch("/api/teams/:teamId/members/:userId", requireAuth, asyncHandler(async (req: any, res: any) => {
    await teamService.updateTeamMembership(
      req.params.teamId,
      req.params.userId,
      req.body,
      req.session.user!.id
    );
    res.json({ message: "Team membership updated successfully" });
  }));

  /**
   * Add players to team
   * @route POST /api/teams/:teamId/add-players
   * @param {string} teamId - Team ID
   * @body {Object} data - Players data
   * @access Coaches, Organization Admins, Site Admins
   * @returns {Object} message - Success message
   */
  app.post("/api/teams/:teamId/add-players", createLimiter, requireAuth, asyncHandler(async (req: any, res: any) => {
    const { teamId } = req.params;
    const { playerIds, startDate, endDate } = req.body;

    if (!Array.isArray(playerIds) || playerIds.length === 0) {
      return res.status(400).json({ message: "playerIds must be a non-empty array" });
    }

    // Use team membership update for each player
    for (const playerId of playerIds) {
      await teamService.updateTeamMembership(
        teamId,
        playerId,
        { startDate, endDate },
        req.session.user!.id
      );
    }

    res.json({ message: `${playerIds.length} player(s) added to team successfully` });
  }));

  /**
   * Remove single athlete from team
   * @route DELETE /api/teams/:teamId/athletes/:athleteId
   * @param {string} teamId - Team ID
   * @param {string} athleteId - Athlete ID
   * @access Coaches, Organization Admins, Site Admins
   * @returns {Object} message - Success message
   */
  app.delete("/api/teams/:teamId/athletes/:athleteId", teamManagementLimiter, requireAuth, asyncHandler(async (req: any, res: any) => {
    const { teamId, athleteId } = req.params;

    // Update membership with end date set to now (effectively removing)
    await teamService.updateTeamMembership(
      teamId,
      athleteId,
      { endDate: new Date().toISOString().split('T')[0] },
      req.session.user!.id
    );

    res.json({ message: "Athlete removed from team successfully" });
  }));

  /**
   * Remove multiple athletes from team
   * @route DELETE /api/teams/:teamId/remove-athletes
   * @param {string} teamId - Team ID
   * @body {string[]} athleteIds - Array of athlete IDs to remove
   * @access Coaches, Organization Admins, Site Admins
   * @returns {Object} message - Success message
   */
  app.delete("/api/teams/:teamId/remove-athletes", teamManagementLimiter, requireAuth, asyncHandler(async (req: any, res: any) => {
    const { teamId } = req.params;
    const { athleteIds } = req.body;

    if (!Array.isArray(athleteIds) || athleteIds.length === 0) {
      return res.status(400).json({ message: "athleteIds must be a non-empty array" });
    }

    const endDate = new Date().toISOString().split('T')[0];

    for (const athleteId of athleteIds) {
      await teamService.updateTeamMembership(
        teamId,
        athleteId,
        { endDate },
        req.session.user!.id
      );
    }

    res.json({ message: `${athleteIds.length} athlete(s) removed from team successfully` });
  }));
}
