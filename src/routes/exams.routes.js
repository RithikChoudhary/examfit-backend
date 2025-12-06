import express from 'express';
import { body } from 'express-validator';
import * as examController from '../controllers/exam.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/role.middleware.js';

const router = express.Router();

const examValidation = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('board').isMongoId().withMessage('Valid board ID is required'),
  body('parentExam').optional().isMongoId().withMessage('Valid parent exam ID is required'),
  body('duration').optional().isInt({ min: 1 }).withMessage('Duration must be a positive integer'),
];

router.get('/', examController.getExams);
router.get('/:id', examController.getExam);
router.post('/', authenticate, requireAdmin, examValidation, examController.createExam);
router.patch('/:id', authenticate, requireAdmin, examController.updateExam);
router.delete('/:id', authenticate, requireAdmin, examController.deleteExam);

export default router;

