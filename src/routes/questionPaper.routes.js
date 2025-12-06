import express from 'express';
import {
  getQuestionPapers,
  getQuestionPaper,
  createQuestionPaper,
  updateQuestionPaper,
  deleteQuestionPaper,
} from '../controllers/questionPaper.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/role.middleware.js';

const router = express.Router();

// Public routes
router.get('/', getQuestionPapers);
router.get('/:id', getQuestionPaper);

// Admin routes
router.post('/', authenticate, requireAdmin, createQuestionPaper);
router.put('/:id', authenticate, requireAdmin, updateQuestionPaper);
router.delete('/:id', authenticate, requireAdmin, deleteQuestionPaper);

export default router;

