import Board from '../models/Board.js';
import Exam from '../models/Exam.js';
import Subject from '../models/Subject.js';
import QuestionPaper from '../models/QuestionPaper.js';
import Question from '../models/Question.js';

const TestAttempt = {
  tests: new Map(),
};

export const getBoards = async (req, res) => {
  try {
    const boards = await Board.find()
      .populate({
        path: 'exams',
        populate: {
          path: 'subjects',
          model: 'Subject',
        },
      })
      .sort({ name: 1 });

    const organizedBoards = boards.map(board => ({
      _id: board._id,
      name: board.name,
      slug: board.slug,
      description: board.description,
      exams: organizeExams(board.exams),
    }));

    res.json({ boards: organizedBoards });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// SIMPLIFIED: No sub-exam organization needed
const organizeExams = (exams) => {
  // Just return exams without parentExam (root exams only)
  return exams.filter(exam => !exam.parentExam);
};

export const createTest = async (req, res) => {
  try {
    const { examId, subjectId, questionPaperId, questions } = req.body;

    // Get question paper details if provided
    let questionPaper = null;
    let subject = null;
    let exam = null;

    if (questionPaperId) {
      questionPaper = await QuestionPaper.findById(questionPaperId)
        .populate('subject')
        .populate('exam');
      
      if (!questionPaper) {
        return res.status(404).json({ error: 'Question paper not found' });
      }

      subject = questionPaper.subject;
      exam = questionPaper.exam;
    } else if (examId) {
      exam = await Exam.findById(examId).populate('board', 'name');
      if (!exam) {
        return res.status(404).json({ error: 'Exam not found' });
      }

      if (subjectId) {
        subject = await Subject.findById(subjectId);
      }
    } else {
      return res.status(400).json({ error: 'Either questionPaperId or examId must be provided' });
    }

    // Build query for questions
    const questionQuery = {
      status: 'published',
    };
    
    if (questionPaperId) {
      questionQuery.questionPaper = questionPaperId;
    } else if (subjectId) {
      questionQuery.subject = subjectId;
    } else if (examId) {
      questionQuery.exam = examId;
    }

    let questionIds = questions;
    if (!questionIds || questionIds.length === 0) {
      const publishedQuestions = await Question.find(questionQuery).select('_id');
      questionIds = publishedQuestions.map(q => q._id.toString());
    }

    if (questionIds.length === 0) {
      return res.status(400).json({ 
        error: 'No questions available for this test',
        hint: 'No published questions found for this selection'
      });
    }

    const testQuestions = await Question.find({
      _id: { $in: questionIds },
      status: 'published',
    })
    .select('-createdBy')
    .populate('subject')
    .populate('questionPaper')
    .sort({ createdAt: 1 }); // Sort by creation date ascending for consistent numbering

    if (testQuestions.length === 0) {
      return res.status(400).json({ error: 'No questions available for this test' });
    }

    // Calculate question numbers based on position in question paper (if available)
    let questionNumberMap = new Map();
    if (questionPaperId) {
      // Get all questions for this question paper, sorted the same way
      const allPaperQuestions = await Question.find({
        questionPaper: questionPaperId,
        status: 'published',
      })
      .select('_id')
      .sort({ createdAt: 1 }); // Same sort order as admin dashboard
      
      // Create a map of question ID to question number
      allPaperQuestions.forEach((q, index) => {
        questionNumberMap.set(q._id.toString(), index + 1);
      });
    }

    // Add question numbers to test questions
    const testQuestionsWithNumbers = testQuestions.map((q, idx) => {
      const qObj = q.toObject();
      // Use the question number from the paper, or fall back to array index + 1
      qObj.questionNumber = questionNumberMap.get(q._id.toString()) || (idx + 1);
      return qObj;
    });

    const testId = `test_${Date.now()}_${req.user._id}`;

    const testData = {
      testId,
      userId: req.user._id.toString(),
      examId: exam?._id.toString(),
      subjectId: subject?._id || null,
      questionPaperId: questionPaperId || null,
      exam: {
        _id: exam?._id,
        name: exam?.name,
        title: exam?.title,
        board: exam?.board,
      },
      subject: subject ? {
        _id: subject._id,
        name: subject.name,
        icon: subject.icon,
      } : null,
      questionPaper: questionPaper ? {
        _id: questionPaper._id,
        name: questionPaper.name,
      } : null,
      questions: testQuestionsWithNumbers.map((q, idx) => ({
        questionId: q._id.toString(),
        question: q,
        answer: null,
        flagged: false,
      })),
      startedAt: new Date(),
      submitted: false,
      answers: {},
    };

    TestAttempt.tests.set(testId, testData);

    res.status(201).json({
      testId,
      exam: testData.exam,
      subject: testData.subject,
      questionPaper: testData.questionPaper,
      questions: testQuestionsWithNumbers,
    });
  } catch (error) {
    console.error('Error creating test:', error);
    res.status(500).json({ error: error.message });
  }
};

export const saveAnswer = async (req, res) => {
  try {
    const { testId } = req.params;
    const { questionId, answer, flagged } = req.body;

    const test = TestAttempt.tests.get(testId);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    if (test.userId !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (test.submitted) {
      return res.status(400).json({ error: 'Test already submitted' });
    }

    const question = test.questions.find(q => q.questionId === questionId);
    if (question) {
      // Ensure answer is stored as a number
      if (answer !== undefined) {
        const numAnswer = Number(answer);
        question.answer = numAnswer;
        test.answers[questionId] = numAnswer;
      }
      if (flagged !== undefined) question.flagged = flagged;
    }

    TestAttempt.tests.set(testId, test);

    res.json({ message: 'Answer saved', testId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const submitTest = async (req, res) => {
  try {
    const { testId } = req.params;

    const test = TestAttempt.tests.get(testId);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    if (test.userId !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (test.submitted) {
      return res.status(400).json({ error: 'Test already submitted' });
    }

    const questionIds = test.questions.map(q => q.questionId);
    const questions = await Question.find({
      _id: { $in: questionIds },
    });

    const questionMap = new Map();
    questions.forEach(q => {
      questionMap.set(q._id.toString(), q);
    });

    let correct = 0;
    const results = test.questions.map(q => {
      const question = questionMap.get(q.questionId);
      // Ensure both values are numbers for comparison
      const userAnswer = q.answer !== null && q.answer !== undefined ? Number(q.answer) : null;
      const correctAnswer = question ? Number(question.correctIndex) : null;
      const isCorrect = userAnswer !== null && correctAnswer !== null && userAnswer === correctAnswer;
      
      console.log(`Question ${q.questionId}: userAnswer=${userAnswer} (${typeof q.answer}), correctAnswer=${correctAnswer}, isCorrect=${isCorrect}`);
      
      if (isCorrect) correct++;

      return {
        questionId: q.questionId,
        question: q.question,
        userAnswer: userAnswer,
        correctAnswer: correctAnswer,
        isCorrect,
        explanation: question ? question.explanation : '',
        flagged: q.flagged,
      };
    });
    
    console.log(`Total correct: ${correct}/${test.questions.length}`);

    const score = (correct / test.questions.length) * 100;
    test.submitted = true;
    test.submittedAt = new Date();
    test.score = score;
    test.correct = correct;
    test.total = test.questions.length;
    test.results = results;

    TestAttempt.tests.set(testId, test);

    res.json({
      testId,
      score: Math.round(score * 100) / 100,
      correct,
      total: test.questions.length,
      results,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getTestResult = async (req, res) => {
  try {
    const { testId } = req.params;

    const test = TestAttempt.tests.get(testId);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    if (test.userId !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (!test.submitted) {
      // Return test data for in-progress tests
      const exam = await Exam.findById(test.examId);
      let subject = null;
      if (test.subjectId) {
        const Subject = (await import('../models/Subject.js')).default;
        subject = await Subject.findById(test.subjectId);
      }
      return res.json({
        testId,
        examId: test.examId,
        subjectId: test.subjectId || null,
        questionPaperId: test.questionPaperId || null, // Include questionPaperId for reset functionality
        exam: exam ? {
          _id: exam._id,
          title: exam.title,
        } : null,
        subject: subject ? {
          _id: subject._id,
          name: subject.name,
        } : null,
        submitted: false,
        questions: test.questions.map(q => q.question),
      });
    }

    res.json({
      testId,
      examId: test.examId,
      subjectId: test.subjectId || null, // Include subjectId for retake functionality
      questionPaperId: test.questionPaperId || null, // Include questionPaperId for retake functionality
      subjectName: test.subjectName || null,
      exam: test.exam || null, // Include full exam info with board
      boardId: test.exam?.board?._id || test.exam?.board || null, // Include boardId for navigation
      score: test.score,
      correct: test.correct,
      total: test.total,
      startedAt: test.startedAt,
      submittedAt: test.submittedAt,
      results: test.results,
      submitted: true,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteTest = async (req, res) => {
  try {
    const { testId } = req.params;

    const test = TestAttempt.tests.get(testId);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    if (test.userId !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    TestAttempt.tests.delete(testId);
    console.log(`Test ${testId} deleted`);

    res.json({ message: 'Test deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

