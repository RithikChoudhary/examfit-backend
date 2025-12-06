import express from 'express';
import { body } from 'express-validator';
import * as studentController from '../controllers/student.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.get('/boards', authenticate, studentController.getBoards);
router.post('/tests', authenticate, [
  body('examId').optional().isMongoId().withMessage('Valid exam ID is required'),
  body('questionPaperId').optional().isMongoId().withMessage('Valid question paper ID is required'),
  body('questions').optional().isArray(),
], studentController.createTest);
router.post('/tests/:testId/answer', authenticate, [
  body('questionId').notEmpty().withMessage('Question ID is required'),
  body('answer').optional(),
  body('flagged').optional().isBoolean(),
], studentController.saveAnswer);
router.post('/tests/:testId/submit', authenticate, studentController.submitTest);
router.get('/tests/:testId/result', authenticate, studentController.getTestResult);
router.delete('/tests/:testId', authenticate, studentController.deleteTest);

export default router;

