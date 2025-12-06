import express from 'express';
import { body } from 'express-validator';
import * as subjectController from '../controllers/subject.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/role.middleware.js';

const router = express.Router();

const subjectValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('exam').isMongoId().withMessage('Valid exam ID is required'),
  body('board').isMongoId().withMessage('Valid board ID is required'),
];

router.get('/', subjectController.getSubjects);
router.get('/:id', subjectController.getSubject);
router.post('/', authenticate, requireAdmin, subjectValidation, subjectController.createSubject);
router.patch('/:id', authenticate, requireAdmin, subjectController.updateSubject);
router.delete('/:id', authenticate, requireAdmin, subjectController.deleteSubject);

export default router;

