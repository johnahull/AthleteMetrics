import express, { type Express, Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { ZodError } from "zod";
import { requireAuth, requireSiteAdmin } from "../middleware";
import { createBenchmarkDistributionSchema } from "@shared/benchmark-distribution-schemas";
import { createDistributionVersion, DistributionInputError, DuplicateVersionLabelError } from "../services/benchmark-distribution-service";

const loaderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { message: "Too many distribution uploads" },
  skip: () => process.env.NODE_ENV !== "production" && (process.env.NODE_ENV === "test" || process.env.BYPASS_GENERAL_RATE_LIMIT === "true"),
  keyGenerator: (req): string => req.session?.user?.id ?? ipKeyGenerator(req.ip || "unknown"),
});

/** Create-only: deliberately no PUT/PATCH/DELETE (distribution rows are immutable). */
export function registerBenchmarkDistributionRoutes(app: Express) {
  app.post("/api/benchmark-distributions", loaderLimiter, requireAuth, requireSiteAdmin, express.json({ limit: "5mb" }), async (req: Request, res: Response) => {
    try {
      const input = createBenchmarkDistributionSchema.parse(req.body);
      const result = await createDistributionVersion(input, req.session.user!.id);
      res.status(201).json(result);
    } catch (error: any) {
      if (error instanceof ZodError) return res.status(400).json({ message: "Invalid distribution data", errors: error.issues });
      if (error instanceof DistributionInputError) return res.status(400).json({ message: error.message });
      if (error instanceof DuplicateVersionLabelError) return res.status(409).json({ message: error.message });
      console.error("POST /api/benchmark-distributions error:", error);
      res.status(500).json({
        message: "Failed to create benchmark distribution",
        error: process.env.NODE_ENV !== "production" ? error.message : undefined,
      });
    }
  });
}
