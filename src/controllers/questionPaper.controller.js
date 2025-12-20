import QuestionPaper from '../models/QuestionPaper.js';
import Question from '../models/Question.js';
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

    // Select needed fields including subject/exam/board IDs for filtering
    const questionPapers = await QuestionPaper.find(query)
      .select('_id name section year duration totalMarks priority createdAt subject exam board')
      .sort({ section: 1, year: -1, priority: -1, name: 1 })
      .limit(200) // Limit to 200 question papers to avoid huge responses
      .lean();

    res.json(questionPapers);
  } catch (error) {
    console.error('Error fetching question papers:', error);
    res.status(500).json({ message: 'Failed to fetch question papers', error: error.message });
  }
};

// Get single question paper
export const getQuestionPaper = async (req, res) => {
  try {
    const { id } = req.params;
    
    const questionPaper = await QuestionPaper.findById(id)
      .populate('subject', 'name slug icon')
      .populate('exam', 'title slug')
      .populate('board', 'name slug')
      .lean();
    
    if (!questionPaper) {
      return res.status(404).json({ message: 'Question paper not found' });
    }
    
    if (questionPaper?.exam) questionPaper.exam.name = questionPaper.exam.title;

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

    // Get all questions associated with this question paper
    const questions = await Question.find({ questionPaper: questionPaper._id });
    const questionIds = questions.map(q => q._id);
    const examIds = [...new Set(questions.map(q => q.exam.toString()))];

    // Delete all questions associated with this question paper
    const deleteResult = await Question.deleteMany({ questionPaper: questionPaper._id });
    console.log(`Deleted ${deleteResult.deletedCount} questions for question paper ${questionPaper.name}`);

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

    // Delete the question paper itself
    await questionPaper.deleteOne();
    console.log(`Deleted question paper ${questionPaper.name}`);

    res.json({ 
      message: 'Question paper and all associated questions deleted successfully',
      deleted: {
        questions: deleteResult.deletedCount,
        questionPaper: questionPaper.name
      }
    });
  } catch (error) {
    console.error('Error deleting question paper:', error);
    res.status(500).json({ message: 'Failed to delete question paper', error: error.message });
  }
};

