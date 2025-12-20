import express from 'express';
import { body } from 'express-validator';
import * as questionController from '../controllers/question.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/role.middleware.js';
import { optionalAuthenticate } from '../middlewares/optionalAuth.middleware.js';

const router = express.Router();

const questionValidation = [
  body('text').trim().notEmpty().withMessage('Question text is required'),
  body('options').isArray({ min: 2 }).withMessage('At least 2 options required'),
  body('options.*.text').trim().notEmpty().withMessage('Option text is required'),
  body('options.*.media').optional().custom((value) => {
    // Allow null, empty string, or valid string
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'string') return true;
    return false;
  }).withMessage('Option media must be a string or null'),
  body('correctIndex').isInt({ min: 0 }).withMessage('Valid correctIndex is required'),
  body('subject').isMongoId().withMessage('Valid subject ID is required'),
  body('exam').isMongoId().withMessage('Valid exam ID is required'),
  body('explanation').optional().trim(),
  body('difficulty').optional().isIn(['easy', 'medium', 'hard']),
  body('tags').optional().isArray(),
  body('media').optional().isArray(),
  body('media.*').optional().isString().withMessage('Media items must be strings'),
  body('status').optional().isIn(['draft', 'published']),
];

const updateQuestionValidation = [
  body('text').optional().trim().notEmpty().withMessage('Question text cannot be empty'),
  body('options').optional().isArray({ min: 2 }).withMessage('At least 2 options required'),
  body('options.*.text').optional().trim().notEmpty().withMessage('Option text cannot be empty'),
  body('options.*.media').optional().custom((value) => {
    // Allow null, empty string, or valid string
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'string') return true;
    return false;
  }).withMessage('Option media must be a string or null'),
  body('correctIndex').optional().isInt({ min: 0 }).withMessage('Valid correctIndex is required'),
  body('subject').optional().isMongoId().withMessage('Valid subject ID is required'),
  body('exam').optional().isMongoId().withMessage('Valid exam ID is required'),
  body('questionPaper').optional().isMongoId().withMessage('Valid question paper ID is required'),
  body('explanation').optional().trim(),
  body('difficulty').optional().isIn(['easy', 'medium', 'hard']),
  body('tags').optional().isArray(),
  body('media').optional().isArray(),
  body('media.*').optional().isString().withMessage('Media items must be strings'),
  body('status').optional().isIn(['draft', 'published']),
];

// Use optionalAuthenticate to detect admin users (for including correctIndex)
router.get('/', optionalAuthenticate, questionController.getQuestions);
router.get('/:id', optionalAuthenticate, questionController.getQuestion);
router.post('/bulk', authenticate, requireAdmin, questionController.bulkUploadQuestions);
router.post('/', authenticate, questionValidation, questionController.createQuestion);
router.patch('/:id', authenticate, updateQuestionValidation, questionController.updateQuestion);
router.delete('/:id', authenticate, questionController.deleteQuestion);

export default router;

