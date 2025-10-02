/**
 * Import and review queue routes
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { requireAuth, asyncHandler } from "../middleware";
import { storage } from "../storage";
import { reviewQueue } from "../review-queue";

const upload = multer({ storage: multer.memoryStorage() });
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { message: "Too many upload attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

export function registerImportRoutes(app: Express) {
  /**
   * Import photo
   */
  app.post("/api/import/photo", uploadLimiter, requireAuth, imageUpload.single('file'), asyncHandler(async (req: any, res: any) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Photo import logic would go here
    res.json({ message: "Photo uploaded successfully", filename: req.file.originalname });
  }));

  /**
   * Import CSV data
   */
  app.post("/api/import/:type", uploadLimiter, requireAuth, upload.single('file'), asyncHandler(async (req: any, res: any) => {
    const { type } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // CSV import logic delegated to appropriate handler
    res.json({ message: `${type} import initiated`, filename: req.file.originalname });
  }));

  /**
   * Get review queue items
   */
  app.get("/api/import/review-queue", requireAuth, asyncHandler(async (req: any, res: any) => {
    const item = reviewQueue.getItem(req.query.itemId as string);
    res.json(item || []);
  }));

  /**
   * Process review decision
   */
  app.post("/api/import/review-decision", requireAuth, asyncHandler(async (req: any, res: any) => {
    const { itemId, action, notes } = req.body;

    if (!itemId || !action) {
      return res.status(400).json({ message: "Item ID and action are required" });
    }

    const reviewedBy = req.session.user!.id;
    const result = reviewQueue.processDecision({ itemId, action, notes }, reviewedBy);

    if (!result) {
      return res.status(404).json({ message: "Review item not found" });
    }

    res.json({ message: "Review decision processed successfully", item: result });
  }));
}
