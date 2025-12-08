import { validationResult } from 'express-validator';
import Board from '../models/Board.js';
import Exam from '../models/Exam.js';
import Subject from '../models/Subject.js';
import Question from '../models/Question.js';
import { getPaginationParams, getPaginationResponse } from '../utils/pagination.js';
// Use Redis cache if available, fallback to in-memory cache
import cacheService from '../services/redisCacheService.js';

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
    
    // Create cache key based on pagination (only cache first page)
    const cacheKey = `boards:admin:${page || 1}:${limit || 10}`;
    
    // Check cache first (only for first page to keep cache simple)
    if ((!page || page === 1) && (!limit || limit <= 20)) {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        console.log('⚡ Cache HIT: Returning boards from cache');
        res.set('Cache-Control', 'public, max-age=86400'); // 1 day
        res.set('X-Cache-Status', 'HIT');
        return res.json(cached);
      }
    }

    // Cache miss - fetch from database
    console.log('💾 Cache MISS: Fetching boards from database');
    const boards = await Board.find()
      .populate('exams', 'title slug')
      .skip(skip)
      .limit(limit)
      .sort({ priority: 1, createdAt: -1 });

    const total = await Board.countDocuments();

    const response = {
      boards,
      pagination: getPaginationResponse(page, limit, total),
    };

    // Cache only first page results for 1 day (boards rarely change)
    if ((!page || page === 1) && (!limit || limit <= 20)) {
      await cacheService.set(cacheKey, response, 24 * 60 * 60 * 1000); // 1 day
    }

    res.set('Cache-Control', 'public, max-age=86400'); // 1 day in seconds
    res.set('X-Cache-Status', (!page || page === 1) && (!limit || limit <= 20) ? 'MISS' : 'SKIP');
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getBoard = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Create cache key for single board
    const cacheKey = `board:${id}`;
    
    // Check cache first
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      console.log('⚡ Cache HIT: Returning board from cache');
      res.set('Cache-Control', 'public, max-age=300');
      res.set('X-Cache-Status', 'HIT');
      return res.json(cached);
    }

    // Cache miss - fetch from database
    console.log('💾 Cache MISS: Fetching board from database');
    const board = await Board.findById(id)
      .populate('exams', 'title slug parentExam duration totalQuestions');

    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    const response = { board };

    // Store in cache for 1 day (boards rarely change)
    await cacheService.set(cacheKey, response, 24 * 60 * 60 * 1000); // 1 day

    res.set('Cache-Control', 'public, max-age=86400'); // 1 day in seconds
    res.set('X-Cache-Status', 'MISS');
    res.json(response);
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

