import { validationResult } from 'express-validator';
import Board from '../models/Board.js';
import Exam from '../models/Exam.js';
import Subject from '../models/Subject.js';
import Question from '../models/Question.js';
import { getPaginationParams, getPaginationResponse } from '../utils/pagination.js';

export const createBoard = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, priority } = req.body;
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    const board = new Board({
      name,
      slug,
      description: description || '',
      priority: priority || 0,
      exams: [],
    });

    await board.save();
    res.status(201).json({ board });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Board with this name already exists' });
    }
    res.status(500).json({ error: error.message });
  }
};

export const getBoards = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req);
    
    // Optimize: Use lean() and select only needed fields, limit populate
    const boards = await Board.find()
      .select('_id name slug description priority exams createdAt')
      .populate({
        path: 'exams',
        select: 'title slug',
        options: { limit: 10 } // Limit exams per board to avoid huge responses
      })
      .skip(skip)
      .limit(limit)
      .sort({ priority: 1, createdAt: -1 })
      .lean(); // Use lean() for better performance

    const total = await Board.countDocuments();

    const response = {
      boards,
      pagination: getPaginationResponse(page, limit, total),
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getBoard = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Optimize: Use lean() and select only needed fields, avoid nested populate
    const board = await Board.findById(id)
      .select('_id name slug description priority exams createdAt')
      .populate({
        path: 'exams',
        select: 'title slug duration totalQuestions', // Removed parentExam to avoid nested populate
        options: { limit: 50 } // Limit exams to avoid huge responses
      })
      .lean(); // Use lean() for better performance

    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    res.json({ board });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateBoard = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, priority } = req.body;
    const updateData = {};

    if (name) {
      updateData.name = name;
      updateData.slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    }
    if (description !== undefined) {
      updateData.description = description;
    }
    if (priority !== undefined) {
      updateData.priority = priority;
    }

    const board = await Board.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    res.json({ board });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteBoard = async (req, res) => {
  try {
    const boardId = req.params.id;
    
    const board = await Board.findById(boardId);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    // Get all exams for this board
    const exams = await Exam.find({ board: boardId });
    const examIds = exams.map(e => e._id);

    // Delete all questions for exams under this board
    await Question.deleteMany({ exam: { $in: examIds } });
    console.log(`Deleted questions for board ${board.name}`);

    // Delete all subjects for this board
    await Subject.deleteMany({ board: boardId });
    console.log(`Deleted subjects for board ${board.name}`);

    // Delete all exams for this board
    await Exam.deleteMany({ board: boardId });
    console.log(`Deleted exams for board ${board.name}`);

    // Finally delete the board
    await Board.findByIdAndDelete(boardId);
    console.log(`Deleted board ${board.name}`);

    res.json({ 
      message: 'Board and all related content deleted successfully',
      deleted: {
        exams: examIds.length,
        subjects: 'all related',
        questions: 'all related'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

