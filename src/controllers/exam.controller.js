import { validationResult } from 'express-validator';
import Exam from '../models/Exam.js';
import Board from '../models/Board.js';
import Subject from '../models/Subject.js';
import Question from '../models/Question.js';
import { getPaginationParams, getPaginationResponse } from '../utils/pagination.js';

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

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getExam = async (req, res) => {
  try {
    // Optimize: Use lean(), select only needed fields, limit subjects
    const exam = await Exam.findById(req.params.id)
      .select('_id title slug board parentExam subjects duration totalQuestions priority meta createdAt')
      .populate('board', 'name slug')
      .populate('parentExam', 'title slug')
      .populate({
        path: 'subjects',
        select: 'name slug icon',
        options: { limit: 100 } // Limit subjects to avoid huge responses
      })
      .lean(); // Use lean() for better performance

    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    // Add name field from title for compatibility
    exam.name = exam.title;

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

