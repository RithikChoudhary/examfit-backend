import express from 'express';
import {
  getSubjects,
  getSubject,
  createSubject,
  updateSubject,
  deleteSubject,
} from '../controllers/subject.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/role.middleware.js';

const router = express.Router();

// Public routes
router.get('/', getSubjects);
router.get('/:id', getSubject);

// Admin routes
router.post('/', authenticate, requireAdmin, createSubject);
router.put('/:id', authenticate, requireAdmin, updateSubject);
router.delete('/:id', authenticate, requireAdmin, deleteSubject);

export default router;

