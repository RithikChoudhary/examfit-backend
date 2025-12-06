import express from 'express';
import {
  getCurrentAffairs,
  getAvailableDates,
  scrapeToday,
  scrapeForDate,
  verifyDatabase
} from '../controllers/currentAffairs.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/role.middleware.js';

const router = express.Router();

// Public routes
router.get('/dates', getAvailableDates);
router.get('/', getCurrentAffairs);

// Admin routes (for manual scraping and verification)
router.post('/scrape/today', authenticate, requireAdmin, scrapeToday);
router.post('/scrape/:date', authenticate, requireAdmin, scrapeForDate);
router.get('/verify', authenticate, requireAdmin, verifyDatabase);

export default router;

