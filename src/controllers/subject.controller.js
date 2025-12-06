import Subject from '../models/Subject.js';
import Question from '../models/Question.js';
import QuestionPaper from '../models/QuestionPaper.js';
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

    // Get all questions associated with this subject
    const questions = await Question.find({ subject: subject._id });
    const questionIds = questions.map(q => q._id);
    const examIds = [...new Set(questions.map(q => q.exam.toString()))];

    // Get all question papers associated with this subject
    const questionPapers = await QuestionPaper.find({ subject: subject._id });
    const questionPaperIds = questionPapers.map(qp => qp._id);

    // Delete all questions associated with this subject
    const questionsDeleteResult = await Question.deleteMany({ subject: subject._id });
    console.log(`Deleted ${questionsDeleteResult.deletedCount} questions for subject ${subject.name}`);

    // Delete all question papers associated with this subject
    const questionPapersDeleteResult = await QuestionPaper.deleteMany({ subject: subject._id });
    console.log(`Deleted ${questionPapersDeleteResult.deletedCount} question papers for subject ${subject.name}`);

    // Update exam question counts for all affected exams
    const updateExamQuestionCounts = async (examId) => {
      if (!examId) return;
      
      const exam = await Exam.findById(examId);
      if (!exam) return;

      // Count published questions for this exam
      const directCount = await Question.countDocuments({ 
        exam: examId, 
        status: 'published' 
      });
      
      exam.totalQuestions = directCount;
      await exam.save();
      console.log(`Updated ${exam.title || exam.name} totalQuestions to ${directCount}`);

      // If this exam has a parent, update the parent's total too
      if (exam.parentExam) {
        await updateParentExamCounts(exam.parentExam);
      }
    };

    // Helper function to update parent exam counts (sum of all sub-exams + direct questions)
    const updateParentExamCounts = async (parentExamId) => {
      const parentExam = await Exam.findById(parentExamId);
      if (!parentExam) return;

      // Get all child exams
      const childExams = await Exam.find({ parentExam: parentExamId });
      
      // Count direct questions under parent
      let totalCount = await Question.countDocuments({ 
        exam: parentExamId, 
        status: 'published' 
      });

      // Add questions from all child exams
      for (const child of childExams) {
        const childCount = await Question.countDocuments({ 
          exam: child._id, 
          status: 'published' 
        });
        totalCount += childCount;
      }

      parentExam.totalQuestions = totalCount;
      await parentExam.save();
      console.log(`Updated parent ${parentExam.title || parentExam.name} totalQuestions to ${totalCount}`);

      // If parent has a grandparent, update that too (recursive)
      if (parentExam.parentExam) {
        await updateParentExamCounts(parentExam.parentExam);
      }
    };

    // Update counts for all affected exams
    for (const examId of examIds) {
      await updateExamQuestionCounts(examId);
    }

    // Delete the subject itself
    await subject.deleteOne();
    console.log(`Deleted subject ${subject.name}`);

    res.json({ 
      message: 'Subject and all associated content deleted successfully',
      deleted: {
        questions: questionsDeleteResult.deletedCount,
        questionPapers: questionPapersDeleteResult.deletedCount,
        subject: subject.name
      }
    });
  } catch (error) {
    console.error('Error deleting subject:', error);
    res.status(500).json({ message: 'Failed to delete subject', error: error.message });
  }
};
