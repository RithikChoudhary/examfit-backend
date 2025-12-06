import express from 'express';
import { body } from 'express-validator';
import * as boardController from '../controllers/board.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/role.middleware.js';

const router = express.Router();

const boardValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('description').optional().trim(),
];

router.get('/', boardController.getBoards);
router.get('/:id', boardController.getBoard);
router.post('/', authenticate, requireAdmin, boardValidation, boardController.createBoard);
router.patch('/:id', authenticate, requireAdmin, boardValidation, boardController.updateBoard);
router.delete('/:id', authenticate, requireAdmin, boardController.deleteBoard);

export default router;

