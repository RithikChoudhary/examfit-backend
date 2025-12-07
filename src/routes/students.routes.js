import express from 'express';
import { body } from 'express-validator';
import * as studentController from '../controllers/student.controller.js';
import { optionalAuthenticate } from '../middlewares/optionalAuth.middleware.js';

const router = express.Router();

// Public routes - authentication optional
router.get('/boards', optionalAuthenticate, studentController.getBoards);
router.post('/tests', optionalAuthenticate, [
  body('examId').optional().isMongoId().withMessage('Valid exam ID is required'),
  body('questionPaperId').optional().isMongoId().withMessage('Valid question paper ID is required'),
  body('questions').optional().isArray(),
], studentController.createTest);
router.post('/tests/:testId/answer', optionalAuthenticate, [
  body('questionId').notEmpty().withMessage('Question ID is required'),
  body('answer').optional(),
  body('flagged').optional().isBoolean(),
], studentController.saveAnswer);
router.post('/tests/:testId/submit', optionalAuthenticate, studentController.submitTest);
router.get('/tests/:testId/result', optionalAuthenticate, studentController.getTestResult);
router.delete('/tests/:testId', optionalAuthenticate, studentController.deleteTest);

export default router;

