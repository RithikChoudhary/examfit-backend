import { validationResult } from 'express-validator';
import Exam from '../models/Exam.js';
import Board from '../models/Board.js';
import Subject from '../models/Subject.js';
import Question from '../models/Question.js';
import { getPaginationParams, getPaginationResponse } from '../utils/pagination.js';
// Use Redis cache if available, fallback to in-memory cache
import cacheService from '../services/redisCacheService.js';

export const createExam = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, board, duration, priority, meta } = req.body;
    const slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    const boardDoc = await Board.findById(board);
    if (!boardDoc) {
      return res.status(404).json({ error: 'Board not found' });
    }

    // SIMPLIFIED: No sub-exams allowed - always create root exam
    const exam = new Exam({
      title,
      slug,
      board,
      parentExam: null, // Always null - no sub-exams
      subjects: [],
      duration,
      priority: priority || 0,
      totalQuestions: 0,
      meta: meta || {},
    });

    await exam.save();
    boardDoc.exams.push(exam._id);
    await boardDoc.save();

    res.status(201).json({ exam });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getExams = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req);
    const { board, parent } = req.query;

    // Create cache key based on query parameters (only cache first page)
    const cacheKey = `exams:${board || 'all'}:${parent || 'all'}:${page || 1}:${limit || 10}`;
    
    // Check cache first (only for first page to keep cache simple)
    if ((!page || page === 1) && (!limit || limit <= 20)) {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        console.log('⚡ Cache HIT: Returning exams from cache');
        // Set appropriate cache header based on whether board filter is used
        const maxAge = board ? 86400 : 300; // 1 day for board-filtered, 5 min for others
        res.set('Cache-Control', `public, max-age=${maxAge}`);
        res.set('X-Cache-Status', 'HIT');
        return res.json(cached);
      }
    }

    // Cache miss - fetch from database
    console.log('💾 Cache MISS: Fetching exams from database');
    const query = {};
    if (board) query.board = board;
    if (parent !== undefined) {
      query.parentExam = parent === 'null' || parent === '' ? null : parent;
    }

    let exams = await Exam.find(query)
      .populate('board', 'name slug')
      .populate('parentExam', 'title slug')
      .populate('subjects', 'name')
      .skip(skip)
      .limit(limit)
      .sort({ priority: 1, createdAt: -1 })
      .lean();

    // Add name field from title for compatibility
    exams = exams.map(exam => ({
      ...exam,
      name: exam.title,
    }));

    const total = await Exam.countDocuments(query);

    const response = {
      exams,
      pagination: getPaginationResponse(page, limit, total),
    };

    // Cache only first page results for 1 day when board filter is used (exams rarely change per board)
    const ttl = board ? 24 * 60 * 60 * 1000 : 5 * 60 * 1000; // 1 day for board-filtered, 5 min for others
    const maxAge = board ? 86400 : 300; // 1 day or 5 minutes in seconds
    
    if ((!page || page === 1) && (!limit || limit <= 20)) {
      await cacheService.set(cacheKey, response, ttl);
    }

    res.set('Cache-Control', `public, max-age=${maxAge}`);
    res.set('X-Cache-Status', 'MISS');
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('board', 'name slug')
      .populate('parentExam', 'title slug')
      .populate('subjects', 'name');

    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    res.json({ exam });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateExam = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, parentExam, duration, priority, meta } = req.body;
    const updateData = {};

    if (title) {
      updateData.title = title;
      updateData.slug = title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    }
    if (duration !== undefined) updateData.duration = duration;
    if (priority !== undefined) updateData.priority = priority;
    if (meta !== undefined) updateData.meta = meta;
    if (parentExam !== undefined) {
      updateData.parentExam = parentExam || null;
    }

    const exam = await Exam.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    res.json({ exam });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteExam = async (req, res) => {
  try {
    const examId = req.params.id;
    
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    // Get all sub-exams (recursive)
    const getAllSubExams = async (parentId) => {
      const subExams = await Exam.find({ parentExam: parentId });
      let allSubExams = [...subExams];
      for (const subExam of subExams) {
        const nestedSubExams = await getAllSubExams(subExam._id);
        allSubExams = [...allSubExams, ...nestedSubExams];
      }
      return allSubExams;
    };

    const subExams = await getAllSubExams(examId);
    const allExamIds = [examId, ...subExams.map(e => e._id)];

    // Delete all questions for this exam and its sub-exams
    await Question.deleteMany({ exam: { $in: allExamIds } });
    console.log(`Deleted questions for exam ${exam.title}`);

    // Delete all subjects for this exam and its sub-exams
    await Subject.deleteMany({ exam: { $in: allExamIds } });
    console.log(`Deleted subjects for exam ${exam.title}`);

    // Delete all sub-exams
    await Exam.deleteMany({ _id: { $in: subExams.map(e => e._id) } });
    console.log(`Deleted ${subExams.length} sub-exams for exam ${exam.title}`);

    // Remove exam from board's exams array
    await Board.findByIdAndUpdate(exam.board, {
      $pull: { exams: { $in: allExamIds } }
    });

    // Delete the exam itself
    await Exam.findByIdAndDelete(examId);
    console.log(`Deleted exam ${exam.title}`);

    res.json({ 
      message: 'Exam and all related content deleted successfully',
      deleted: {
        subExams: subExams.length,
        subjects: 'all related',
        questions: 'all related'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

