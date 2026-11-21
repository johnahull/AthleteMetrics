import express, { type Express, type Request } from "express";

// PDF export routes (POST /api/reports/:id/pdf and POST /api/public/reports/:token/pdf) and the benchmark
// distribution loader accept large JSON bodies and mount their own higher-limit parser. The default 100kb
// global parser skips them so it does not 413 before the route-level parser runs.
const defaultJsonParser = express.json();
// Match these routes explicitly rather than by suffix, so a future route cannot silently inherit a big limit.
const isLargePdfUpload = (req: Request) =>
  req.method === "POST" &&
  req.path.endsWith("/pdf") &&
  (req.path.startsWith("/api/reports/") || req.path.startsWith("/api/public/reports/"));
const isDistributionLoad = (req: Request) => req.method === "POST" && req.path === "/api/benchmark-distributions";

export function mountJsonParsers(app: Express) {
  app.use((req, res, next) =>
    isLargePdfUpload(req) || isDistributionLoad(req) ? next() : defaultJsonParser(req, res, next),
  );
  app.use(express.urlencoded({ extended: false }));
}
