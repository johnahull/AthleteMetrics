import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { insertTeamSchema, insertPlayerSchema, insertMeasurementSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import csv from "csv-parser";
import { Readable } from "stream";

const upload = multer({ storage: multer.memoryStorage() });

// Auth middleware
function requireAuth(req: any, res: any, next: any) {
  if (!(req.session as any)?.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Session configuration
  app.use(session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: { 
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true,
      sameSite: 'lax'
    }
  }));

  // Auth routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
      }
      
      const adminUser = process.env.ADMIN_USER || "admin";
      const adminPass = process.env.ADMIN_PASS || "password";
      
      if (username === adminUser && password === adminPass) {
        (req.session as any).user = { username };
        res.json({ success: true, user: { username } });
      } else {
        res.status(401).json({ message: "Invalid credentials" });
      }
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if ((req.session as any)?.user) {
      res.json({ user: (req.session as any).user });
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  });

  // Teams routes
  app.get("/api/teams", requireAuth, async (req, res) => {
    try {
      const teams = await storage.getTeams();
      res.json(teams);
    } catch (error) {
      console.error("Failed to fetch teams:", error);
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  app.post("/api/teams", requireAuth, async (req, res) => {
    try {
      const teamData = insertTeamSchema.parse(req.body);
      const team = await storage.createTeam(teamData);
      res.json(team);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Failed to create team:", error);
        res.status(500).json({ message: "Failed to create team" });
      }
    }
  });

  app.patch("/api/teams/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const teamData = insertTeamSchema.partial().parse(req.body);
      const team = await storage.updateTeam(id, teamData);
      res.json(team);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Failed to update team:", error);
        res.status(500).json({ message: "Failed to update team" });
      }
    }
  });

  app.delete("/api/teams/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteTeam(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete team:", error);
      res.status(500).json({ message: "Failed to delete team" });
    }
  });

  // Players routes
  app.get("/api/players", requireAuth, async (req, res) => {
    try {
      const { teamId, birthYearFrom, birthYearTo, search } = req.query;
      const filters = {
        teamId: teamId as string,
        birthYearFrom: birthYearFrom ? parseInt(birthYearFrom as string) : undefined,
        birthYearTo: birthYearTo ? parseInt(birthYearTo as string) : undefined,
        search: search as string,
      };
      
      const players = await storage.getPlayers(filters);
      res.json(players);
    } catch (error) {
      console.error("Failed to fetch players:", error);
      res.status(500).json({ message: "Failed to fetch players" });
    }
  });

  app.get("/api/players/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const player = await storage.getPlayer(id);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      res.json(player);
    } catch (error) {
      console.error("Failed to fetch player:", error);
      res.status(500).json({ message: "Failed to fetch player" });
    }
  });

  app.post("/api/players", requireAuth, async (req, res) => {
    try {
      const playerData = insertPlayerSchema.parse(req.body);
      const player = await storage.createPlayer(playerData);
      res.json(player);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Failed to create player:", error);
        res.status(500).json({ message: "Failed to create player" });
      }
    }
  });

  app.patch("/api/players/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const playerData = insertPlayerSchema.partial().parse(req.body);
      const player = await storage.updatePlayer(id, playerData);
      res.json(player);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Failed to update player:", error);
        res.status(500).json({ message: "Failed to update player" });
      }
    }
  });

  app.delete("/api/players/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deletePlayer(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete player:", error);
      res.status(500).json({ message: "Failed to delete player" });
    }
  });

  // Measurements routes
  app.get("/api/measurements", requireAuth, async (req, res) => {
    try {
      const { playerId, teamIds, metric, dateFrom, dateTo, birthYearFrom, birthYearTo } = req.query;
      const filters = {
        playerId: playerId as string,
        teamIds: teamIds ? (teamIds as string).split(',') : undefined,
        metric: metric as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        birthYearFrom: birthYearFrom ? parseInt(birthYearFrom as string) : undefined,
        birthYearTo: birthYearTo ? parseInt(birthYearTo as string) : undefined,
      };
      
      const measurements = await storage.getMeasurements(filters);
      res.json(measurements);
    } catch (error) {
      console.error("Failed to fetch measurements:", error);
      res.status(500).json({ message: "Failed to fetch measurements" });
    }
  });

  app.post("/api/measurements", requireAuth, async (req, res) => {
    try {
      const measurementData = insertMeasurementSchema.parse(req.body);
      const measurement = await storage.createMeasurement(measurementData);
      res.json(measurement);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Failed to create measurement:", error);
        res.status(500).json({ message: "Failed to create measurement" });
      }
    }
  });

  app.patch("/api/measurements/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const measurementData = insertMeasurementSchema.partial().parse(req.body);
      const measurement = await storage.updateMeasurement(id, measurementData);
      res.json(measurement);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        console.error("Failed to update measurement:", error);
        res.status(500).json({ message: "Failed to update measurement" });
      }
    }
  });

  app.delete("/api/measurements/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteMeasurement(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete measurement:", error);
      res.status(500).json({ message: "Failed to delete measurement" });
    }
  });

  // Analytics routes
  app.get("/api/analytics/dashboard", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error("Failed to fetch dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  app.get("/api/analytics/teams", requireAuth, async (req, res) => {
    try {
      const teamStats = await storage.getTeamStats();
      res.json(teamStats);
    } catch (error) {
      console.error("Failed to fetch team stats:", error);
      res.status(500).json({ message: "Failed to fetch team stats" });
    }
  });

  app.get("/api/analytics/player/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const stats = await storage.getPlayerStats(id);
      res.json(stats);
    } catch (error) {
      console.error("Failed to fetch player stats:", error);
      res.status(500).json({ message: "Failed to fetch player stats" });
    }
  });

  // CSV Import routes
  app.post("/api/import/players", requireAuth, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const { createMissing, teamId } = req.body;
      const results: any[] = [];
      const errors: any[] = [];

      const csvText = req.file.buffer.toString('utf-8');
      const lines = csvText.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        return res.status(400).json({ message: "Empty CSV file" });
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const row: any = {};
        
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });

        try {
          // Find team by name if teamName is provided in CSV
          let resolvedTeamId = teamId; // From form selection
          
          if (!resolvedTeamId && row.teamName) {
            const allTeams = await storage.getTeams();
            const matchingTeam = allTeams.find(team => team.name.trim() === row.teamName.trim());
            
            if (!matchingTeam) {
              errors.push({ 
                row: i, 
                error: `Team "${row.teamName}" not found`, 
                valid: false 
              });
              continue;
            }
            resolvedTeamId = matchingTeam.id;
          }
          
          if (!resolvedTeamId) {
            errors.push({ 
              row: i, 
              error: "No team specified", 
              valid: false 
            });
            continue;
          }

          const playerData = {
            firstName: row.firstName,
            lastName: row.lastName,
            birthYear: parseInt(row.birthYear),
            teamId: resolvedTeamId,
            school: row.school || "",
          };

          // Validate the data
          insertPlayerSchema.parse(playerData);
          
          // Create the player in the database
          const createdPlayer = await storage.createPlayer(playerData);
          
          results.push({ 
            row: i, 
            data: playerData, 
            valid: true,
            playerName: `${playerData.firstName} ${playerData.lastName}`,
            playerId: createdPlayer.id
          });
        } catch (error) {
          errors.push({ 
            row: i, 
            error: error instanceof z.ZodError ? error.errors.map(e => e.message).join(', ') : String(error), 
            valid: false 
          });
        }
      }

      res.json({ results, errors, totalRows: results.length + errors.length });

    } catch (error) {
      console.error("CSV import error:", error);
      res.status(500).json({ message: "Failed to process CSV file" });
    }
  });

  app.post("/api/import/measurements", requireAuth, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const results: any[] = [];
      const errors: any[] = [];

      const csvText = req.file.buffer.toString('utf-8');
      const lines = csvText.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        return res.status(400).json({ message: "Empty CSV file" });
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const row: any = {};
        
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });

        try {
          // Validate required fields first with helpful error messages
          if (!row.firstName || !row.lastName) {
            errors.push({ 
              row: i, 
              error: `Missing required fields: firstName and lastName are required`, 
              valid: false 
            });
            continue;
          }

          if (!row.birthYear || isNaN(parseInt(row.birthYear))) {
            errors.push({ 
              row: i, 
              error: `Invalid birthYear: "${row.birthYear}" - must be a number (e.g., 2009)`, 
              valid: false 
            });
            continue;
          }

          if (!row.date) {
            errors.push({ 
              row: i, 
              error: `Missing required field: date is required (format: YYYY-MM-DD)`, 
              valid: false 
            });
            continue;
          }

          if (!row.metric || !["FLY10_TIME", "VERTICAL_JUMP"].includes(row.metric)) {
            errors.push({ 
              row: i, 
              error: `Invalid metric: "${row.metric}" - must be either "FLY10_TIME" or "VERTICAL_JUMP"`, 
              valid: false 
            });
            continue;
          }

          if (!row.value || isNaN(parseFloat(row.value))) {
            errors.push({ 
              row: i, 
              error: `Invalid value: "${row.value}" - must be a positive number (e.g., 1.26 for fly time or 21.5 for vertical jump)`, 
              valid: false 
            });
            continue;
          }

          const parsedValue = parseFloat(row.value);
          if (parsedValue <= 0) {
            errors.push({ 
              row: i, 
              error: `Invalid value: "${row.value}" - must be a positive number greater than 0`, 
              valid: false 
            });
            continue;
          }

          // Validate flyInDistance if provided
          if (row.flyInDistance && row.flyInDistance.trim() && isNaN(parseFloat(row.flyInDistance))) {
            errors.push({ 
              row: i, 
              error: `Invalid flyInDistance: "${row.flyInDistance}" - must be a number or left empty`, 
              valid: false 
            });
            continue;
          }

          // Find player by firstName, lastName and birthYear
          const player = await storage.getPlayerByNameAndBirthYear(
            row.firstName,
            row.lastName, 
            parseInt(row.birthYear)
          );

          if (!player) {
            errors.push({ 
              row: i, 
              error: `Player "${row.firstName} ${row.lastName}" with birth year ${row.birthYear} not found. Make sure the player exists or use "create" mode.`, 
              valid: false 
            });
            continue;
          }

          const measurementData = {
            playerId: player.id,
            date: row.date,
            metric: row.metric,
            value: parsedValue,
            flyInDistance: row.flyInDistance && row.flyInDistance.trim() ? parseFloat(row.flyInDistance) : undefined,
            notes: row.notes || "",
          };

          // Final validation with schema
          insertMeasurementSchema.parse(measurementData);
          
          // Create the measurement in the database
          const createdMeasurement = await storage.createMeasurement(measurementData);
          
          results.push({ 
            row: i, 
            data: measurementData, 
            valid: true,
            playerName: `${row.firstName} ${row.lastName}`,
            metricDisplay: row.metric === "FLY10_TIME" ? "Fly-10" : "Vertical Jump",
            measurementId: createdMeasurement.id
          });
        } catch (error) {
          let errorMessage = String(error);
          if (error instanceof z.ZodError) {
            // More detailed error messages for Zod validation
            errorMessage = error.errors.map(e => {
              const field = e.path.join('.');
              return `${field}: ${e.message}`;
            }).join(', ');
          }
          errors.push({ 
            row: i, 
            error: errorMessage, 
            valid: false 
          });
        }
      }

      res.json({ results, errors, totalRows: results.length + errors.length });

    } catch (error) {
      console.error("CSV import error:", error);
      res.status(500).json({ message: "Failed to process CSV file" });
    }
  });

  // CSV Export routes
  app.get("/api/export/players", requireAuth, async (req, res) => {
    try {
      const players = await storage.getPlayers();
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="players.csv"');
      
      const csvHeader = "firstName,lastName,birthYear,teamNames,school\n";
      const csvBody = players.map(player => 
        `"${player.firstName}","${player.lastName}",${player.birthYear},"${player.teams.map(t => t.name).join('; ')}","${player.school || ""}"`
      ).join('\n');
      
      res.send(csvHeader + csvBody);
    } catch (error) {
      console.error("Failed to export players:", error);
      res.status(500).json({ message: "Failed to export players" });
    }
  });

  app.get("/api/export/measurements", requireAuth, async (req, res) => {
    try {
      const { teamIds, metric, dateFrom, dateTo, birthYearFrom, birthYearTo } = req.query;
      const filters = {
        teamIds: teamIds ? (teamIds as string).split(',') : undefined,
        metric: metric as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        birthYearFrom: birthYearFrom ? parseInt(birthYearFrom as string) : undefined,
        birthYearTo: birthYearTo ? parseInt(birthYearTo as string) : undefined,
      };
      
      const measurements = await storage.getMeasurements(filters);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="measurements.csv"');
      
      const csvHeader = "firstName,lastName,birthYear,date,metric,value,units,flyInDistance,notes\n";
      const csvBody = measurements.map(measurement => 
        `"${measurement.player.firstName}","${measurement.player.lastName}",${measurement.player.birthYear},${measurement.date},${measurement.metric},${measurement.value},${measurement.units},${measurement.flyInDistance || ""},"${measurement.notes || ""}"`
      ).join('\n');
      
      res.send(csvHeader + csvBody);
    } catch (error) {
      console.error("Failed to export measurements:", error);
      res.status(500).json({ message: "Failed to export measurements" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
