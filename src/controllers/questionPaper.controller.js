import QuestionPaper from '../models/QuestionPaper.js';
import Subject from '../models/Subject.js';
import Exam from '../models/Exam.js';
import Board from '../models/Board.js';

// Get all question papers
export const getQuestionPapers = async (req, res) => {
  try {
    const { subjectId, examId, boardId } = req.query;
    
    const query = {};
    if (subjectId) query.subject = subjectId;
    if (examId) query.exam = examId;
    if (boardId) query.board = boardId;

    const questionPapers = await QuestionPaper.find(query)
      .populate('subject', 'name slug icon')
      .populate('exam', 'title slug')
      .populate('board', 'name slug')
      .sort({ section: 1, year: -1, priority: -1, name: 1 })
      .lean();
    
    // Add name field from title for compatibility
    questionPapers.forEach(paper => {
      if (paper.exam) paper.exam.name = paper.exam.title;
    });

    res.json(questionPapers);
  } catch (error) {
    console.error('Error fetching question papers:', error);
    res.status(500).json({ message: 'Failed to fetch question papers', error: error.message });
  }
};

// Get single question paper
export const getQuestionPaper = async (req, res) => {
  try {
    const questionPaper = await QuestionPaper.findById(req.params.id)
      .populate('subject', 'name slug icon')
      .populate('exam', 'title slug')
      .populate('board', 'name slug')
      .lean();
    
    if (questionPaper?.exam) questionPaper.exam.name = questionPaper.exam.title;

    if (!questionPaper) {
      return res.status(404).json({ message: 'Question paper not found' });
    }

    res.json(questionPaper);
  } catch (error) {
    console.error('Error fetching question paper:', error);
    res.status(500).json({ message: 'Failed to fetch question paper', error: error.message });
  }
};

// Create question paper
export const createQuestionPaper = async (req, res) => {
  try {
    const { name, subject, exam, board, section, year, duration, totalMarks, priority } = req.body;

    // Validate subject, exam and board exist
    const subjectExists = await Subject.findById(subject);
    if (!subjectExists) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    const examExists = await Exam.findById(exam);
    if (!examExists) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    const boardExists = await Board.findById(board);
    if (!boardExists) {
      return res.status(404).json({ message: 'Board not found' });
    }

    const questionPaper = await QuestionPaper.create({
      name,
      subject,
      exam,
      board,
      section: section || 'General',
      year,
      duration: duration || 60,
      totalMarks: totalMarks || 100,
      priority: priority || 0,
    });

    const populatedPaper = await QuestionPaper.findById(questionPaper._id)
      .populate('subject', 'name slug icon')
      .populate('exam', 'title slug')
      .populate('board', 'name slug')
      .lean();
    
    if (populatedPaper?.exam) populatedPaper.exam.name = populatedPaper.exam.title;

    res.status(201).json(populatedPaper);
  } catch (error) {
    console.error('Error creating question paper:', error);
    res.status(500).json({ message: 'Failed to create question paper', error: error.message });
  }
};

// Update question paper
export const updateQuestionPaper = async (req, res) => {
  try {
    const { name, subject, exam, board, section, year, duration, totalMarks, priority } = req.body;

    const questionPaper = await QuestionPaper.findById(req.params.id);
    if (!questionPaper) {
      return res.status(404).json({ message: 'Question paper not found' });
    }

    // Validate subject, exam and board if they're being changed
    if (subject && subject !== questionPaper.subject.toString()) {
      const subjectExists = await Subject.findById(subject);
      if (!subjectExists) {
        return res.status(404).json({ message: 'Subject not found' });
      }
    }

    if (exam && exam !== questionPaper.exam.toString()) {
      const examExists = await Exam.findById(exam);
      if (!examExists) {
        return res.status(404).json({ message: 'Exam not found' });
      }
    }

    if (board && board !== questionPaper.board.toString()) {
      const boardExists = await Board.findById(board);
      if (!boardExists) {
        return res.status(404).json({ message: 'Board not found' });
      }
    }

    // Update fields
    if (name) questionPaper.name = name;
    if (subject) questionPaper.subject = subject;
    if (exam) questionPaper.exam = exam;
    if (board) questionPaper.board = board;
    if (section !== undefined) questionPaper.section = section;
    if (year !== undefined) questionPaper.year = year;
    if (duration !== undefined) questionPaper.duration = duration;
    if (totalMarks !== undefined) questionPaper.totalMarks = totalMarks;
    if (priority !== undefined) questionPaper.priority = priority;

    await questionPaper.save();

    const populatedPaper = await QuestionPaper.findById(questionPaper._id)
      .populate('subject', 'name slug icon')
      .populate('exam', 'title slug')
      .populate('board', 'name slug')
      .lean();
    
    if (populatedPaper?.exam) populatedPaper.exam.name = populatedPaper.exam.title;

    res.json(populatedPaper);
  } catch (error) {
    console.error('Error updating question paper:', error);
    res.status(500).json({ message: 'Failed to update question paper', error: error.message });
  }
};

// Delete question paper
export const deleteQuestionPaper = async (req, res) => {
  try {
    const questionPaper = await QuestionPaper.findById(req.params.id);
    if (!questionPaper) {
      return res.status(404).json({ message: 'Question paper not found' });
    }

    await questionPaper.deleteOne();
    res.json({ message: 'Question paper deleted successfully' });
  } catch (error) {
    console.error('Error deleting question paper:', error);
    res.status(500).json({ message: 'Failed to delete question paper', error: error.message });
  }
};

