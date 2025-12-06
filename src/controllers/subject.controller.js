import Subject from '../models/Subject.js';
import Exam from '../models/Exam.js';
import Board from '../models/Board.js';

// Get all subjects
export const getSubjects = async (req, res) => {
  try {
    const { examId, boardId } = req.query;
    
    const query = {};
    if (examId) query.exam = examId;
    if (boardId) query.board = boardId;

    const subjects = await Subject.find(query)
      .populate('exam', 'title slug')
      .populate('board', 'name slug')
      .sort({ priority: -1, name: 1 })
      .lean();
    
    // Add name field from title for compatibility
    subjects.forEach(subject => {
      if (subject.exam) subject.exam.name = subject.exam.title;
    });

    res.json(subjects);
  } catch (error) {
    console.error('Error fetching subjects:', error);
    res.status(500).json({ message: 'Failed to fetch subjects', error: error.message });
  }
};

// Get single subject
export const getSubject = async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id)
      .populate('exam', 'title slug')
      .populate('board', 'name slug')
      .lean();

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }
    
    if (subject.exam) subject.exam.name = subject.exam.title;

    res.json(subject);
  } catch (error) {
    console.error('Error fetching subject:', error);
    res.status(500).json({ message: 'Failed to fetch subject', error: error.message });
  }
};

// Create subject
export const createSubject = async (req, res) => {
  try {
    const { name, slug, exam, board, description, icon, priority } = req.body;

    // Validate exam and board exist
    const examExists = await Exam.findById(exam);
    if (!examExists) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    const boardExists = await Board.findById(board);
    if (!boardExists) {
      return res.status(404).json({ message: 'Board not found' });
    }

    // Check if subject with same slug exists for this exam
    const existing = await Subject.findOne({ slug, exam });
    if (existing) {
      return res.status(400).json({ message: 'Subject with this slug already exists for this exam' });
    }

    const subject = await Subject.create({
      name,
      slug,
      exam,
      board,
      description,
      icon,
      priority: priority || 0,
    });

    const populatedSubject = await Subject.findById(subject._id)
      .populate('exam', 'title slug')
      .populate('board', 'name slug')
      .lean();
    
    if (populatedSubject.exam) populatedSubject.exam.name = populatedSubject.exam.title;

    res.status(201).json(populatedSubject);
  } catch (error) {
    console.error('Error creating subject:', error);
    res.status(500).json({ message: 'Failed to create subject', error: error.message });
  }
};

// Update subject
export const updateSubject = async (req, res) => {
  try {
    const { name, slug, exam, board, description, icon, priority } = req.body;

    const subject = await Subject.findById(req.params.id);
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    // If slug is being changed, check for duplicates
    if (slug && slug !== subject.slug) {
      const existing = await Subject.findOne({ slug, exam: exam || subject.exam });
      if (existing) {
        return res.status(400).json({ message: 'Subject with this slug already exists for this exam' });
      }
    }

    // Validate exam and board if they're being changed
    if (exam && exam !== subject.exam.toString()) {
      const examExists = await Exam.findById(exam);
      if (!examExists) {
        return res.status(404).json({ message: 'Exam not found' });
      }
    }

    if (board && board !== subject.board.toString()) {
      const boardExists = await Board.findById(board);
      if (!boardExists) {
        return res.status(404).json({ message: 'Board not found' });
      }
    }

    // Update fields
    if (name) subject.name = name;
    if (slug) subject.slug = slug;
    if (exam) subject.exam = exam;
    if (board) subject.board = board;
    if (description !== undefined) subject.description = description;
    if (icon) subject.icon = icon;
    if (priority !== undefined) subject.priority = priority;

    await subject.save();

    const populatedSubject = await Subject.findById(subject._id)
      .populate('exam', 'title slug')
      .populate('board', 'name slug')
      .lean();
    
    if (populatedSubject.exam) populatedSubject.exam.name = populatedSubject.exam.title;

    res.json(populatedSubject);
  } catch (error) {
    console.error('Error updating subject:', error);
    res.status(500).json({ message: 'Failed to update subject', error: error.message });
  }
};

// Delete subject
export const deleteSubject = async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id);
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    await subject.deleteOne();
    res.json({ message: 'Subject deleted successfully' });
  } catch (error) {
    console.error('Error deleting subject:', error);
    res.status(500).json({ message: 'Failed to delete subject', error: error.message });
  }
};
