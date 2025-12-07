import Board from '../models/Board.js';
import Exam from '../models/Exam.js';
import Subject from '../models/Subject.js';
import QuestionPaper from '../models/QuestionPaper.js';
import Question from '../models/Question.js';
import TestAttempt from '../models/TestAttempt.js';

export const getBoards = async (req, res) => {
  try {
    // Optimize: Use lean() for faster queries and select only needed fields
    const boards = await Board.find()
      .select('_id name slug description exams')
      .populate({
        path: 'exams',
        select: '_id title slug parentExam',
        match: { parentExam: null }, // Only get root exams (no parent)
        populate: {
          path: 'subjects',
          model: 'Subject',
          select: '_id name icon exam', // Only select needed fields
        },
      })
      .sort({ name: 1 })
      .lean(); // Use lean() for better performance

    // Filter out boards with no exams after populate
    const organizedBoards = boards
      .filter(board => board.exams && board.exams.length > 0)
      .map(board => ({
      _id: board._id,
      name: board.name,
      slug: board.slug,
      description: board.description,
      exams: organizeExams(board.exams),
    }));

    res.json({ boards: organizedBoards });
  } catch (error) {
    console.error('Error fetching boards:', error);
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

    // Generate test ID - use userId if logged in, otherwise use session ID
    const userId = req.user?._id || null;
    const sessionId = userId ? null : `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const testId = userId ? `test_${Date.now()}_${userId}` : `test_${Date.now()}_${sessionId}`;

    // Create test attempt in database
    const testAttempt = await TestAttempt.create({
      testId,
      userId: userId,
      sessionId: sessionId,
      examId: exam?._id || null,
      subjectId: subject?._id || null,
      questionPaperId: questionPaperId || null,
      exam: exam ? {
        _id: exam._id,
        name: exam.name,
        title: exam.title,
        board: exam.board,
      } : null,
      subject: subject ? {
        _id: subject._id,
        name: subject.name,
        icon: subject.icon,
      } : null,
      subjectName: subject?.name || null,
      questionPaper: questionPaper ? {
        _id: questionPaper._id,
        name: questionPaper.name,
      } : null,
      questions: testQuestionsWithNumbers.map((q) => ({
        questionId: q._id,
        question: q,
        answer: null,
        flagged: false,
      })),
      startedAt: new Date(),
      submitted: false,
    });

    res.status(201).json({
      testId,
      exam: testAttempt.exam,
      subject: testAttempt.subject,
      questionPaper: testAttempt.questionPaper,
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

    // Use atomic update to avoid version conflicts
    // Allow access if userId matches OR if test has no userId (anonymous) and session matches
    const updateQuery = req.user 
      ? { testId, userId: req.user._id, submitted: false }
      : { testId, userId: null, sessionId: { $exists: true }, submitted: false };
    const updateData = {};
    
    // Build the update query for the specific question in the array
    if (answer !== undefined) {
      const numAnswer = answer !== null ? Number(answer) : null;
      updateData['questions.$[elem].answer'] = numAnswer;
    }
    if (flagged !== undefined) {
      updateData['questions.$[elem].flagged'] = flagged;
    }

    // Use findOneAndUpdate with arrayFilters for atomic update
    const result = await TestAttempt.findOneAndUpdate(
      updateQuery,
      { $set: updateData },
      {
        arrayFilters: [{ 'elem.questionId': questionId }],
        new: true,
        runValidators: true,
      }
    );

    if (!result) {
      // Check if test exists but is submitted or belongs to different user
      const test = await TestAttempt.findOne({ testId });
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }
        // Check authorization - allow if userId matches OR if anonymous (no userId)
        if (req.user) {
          if (!test.userId || test.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Not authorized' });
          }
        } else {
          // Anonymous user - can only access tests with no userId (anonymous tests)
          if (test.userId) {
            return res.status(403).json({ error: 'Not authorized' });
          }
        }
    if (test.submitted) {
      return res.status(400).json({ error: 'Test already submitted' });
    }
      // If we get here, it's a version conflict - retry once
      return res.status(409).json({ error: 'Update conflict. Please try again.' });
    }

    res.json({ message: 'Answer saved', testId });
  } catch (error) {
    console.error('Error saving answer:', error);
    // Handle version conflict specifically
    if (error.name === 'VersionError' || error.message.includes('No matching document')) {
      return res.status(409).json({ 
        error: 'Update conflict. Your answer will be saved on the next autosave.',
        retry: true 
      });
    }
    res.status(500).json({ error: error.message });
  }
};

export const submitTest = async (req, res) => {
  try {
    const { testId } = req.params;

    // Retry logic for version conflicts
    let retries = 3;
    let test = null;
    
    while (retries > 0) {
      try {
        test = await TestAttempt.findOne({ testId });
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

        // Check authorization - allow if userId matches OR if anonymous (no userId)
        if (req.user) {
          if (!test.userId || test.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Not authorized' });
          }
        } else {
          // Anonymous user - can only access tests with no userId (anonymous tests)
          if (test.userId) {
            return res.status(403).json({ error: 'Not authorized' });
          }
        }

    if (test.submitted) {
          // Test already submitted, return existing results
          return res.json({
            testId,
            score: test.score,
            correct: test.correct,
            total: test.total,
            results: test.results,
            alreadySubmitted: true,
          });
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
          const question = questionMap.get(q.questionId.toString());
      // Ensure both values are numbers for comparison
      const userAnswer = q.answer !== null && q.answer !== undefined ? Number(q.answer) : null;
      const correctAnswer = question ? Number(question.correctIndex) : null;
      const isCorrect = userAnswer !== null && correctAnswer !== null && userAnswer === correctAnswer;
      
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

    const score = (correct / test.questions.length) * 100;
        
        // Use atomic update to avoid version conflicts
        const updateResult = await TestAttempt.findOneAndUpdate(
          { 
            _id: test._id, 
            submitted: false, // Only update if not already submitted
            __v: test.__v // Match the version we read
          },
          {
            $set: {
              submitted: true,
              submittedAt: new Date(),
      score: Math.round(score * 100) / 100,
              correct: correct,
      total: test.questions.length,
              results: results,
            }
          },
          { 
            new: true, 
            runValidators: true 
          }
        );

        if (!updateResult) {
          // Version conflict or already submitted - retry
          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 100 * (4 - retries))); // Exponential backoff
            continue;
          } else {
            // Check if it was submitted by another request
            const updatedTest = await TestAttempt.findOne({ testId });
            if (updatedTest && updatedTest.submitted) {
              return res.json({
                testId,
                score: updatedTest.score,
                correct: updatedTest.correct,
                total: updatedTest.total,
                results: updatedTest.results,
                alreadySubmitted: true,
              });
            }
            throw new Error('Failed to submit test after retries. Please try again.');
          }
        }

        // Success!
        return res.json({
          testId,
          score: updateResult.score,
          correct: updateResult.correct,
          total: updateResult.total,
          results: updateResult.results,
        });
      } catch (retryError) {
        if (retryError.name === 'VersionError' || retryError.message.includes('No matching document')) {
          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 100 * (4 - retries)));
            continue;
          }
        }
        throw retryError;
      }
    }
  } catch (error) {
    console.error('Error submitting test:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getTestResult = async (req, res) => {
  try {
    const { testId } = req.params;

    const test = await TestAttempt.findOne({ testId });
    if (!test) {
      console.warn(`[getTestResult] Test not found: ${testId}`);
      return res.status(404).json({ 
        error: 'Test not found',
        message: 'The test may have expired or been deleted. Please start a new test.',
        testId 
      });
    }

        // Check authorization - allow if userId matches OR if anonymous (no userId)
        if (req.user) {
          if (!test.userId || test.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Not authorized' });
          }
        } else {
          // Anonymous user - can only access tests with no userId (anonymous tests)
          if (test.userId) {
            return res.status(403).json({ error: 'Not authorized' });
          }
        }

    if (!test.submitted) {
      // Return test data for in-progress tests
      const exam = await Exam.findById(test.examId);
      let subject = null;
      if (test.subjectId) {
        subject = await Subject.findById(test.subjectId);
      }
      return res.json({
        testId,
        examId: test.examId,
        subjectId: test.subjectId || null,
        questionPaperId: test.questionPaperId || null,
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
      subjectId: test.subjectId || null,
      questionPaperId: test.questionPaperId || null,
      subjectName: test.subjectName || null,
      exam: test.exam || null,
      boardId: test.exam?.board?._id || test.exam?.board || null,
      score: test.score,
      correct: test.correct,
      total: test.total,
      startedAt: test.startedAt,
      submittedAt: test.submittedAt,
      results: test.results,
      submitted: true,
    });
  } catch (error) {
    console.error('Error getting test result:', error);
    res.status(500).json({ error: error.message });
  }
};

export const deleteTest = async (req, res) => {
  try {
    const { testId } = req.params;

    const test = await TestAttempt.findOne({ testId });
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

        // Check authorization - allow if userId matches OR if anonymous (no userId)
        if (req.user) {
          if (!test.userId || test.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Not authorized' });
          }
        } else {
          // Anonymous user - can only access tests with no userId (anonymous tests)
          if (test.userId) {
            return res.status(403).json({ error: 'Not authorized' });
          }
        }

    await TestAttempt.deleteOne({ testId });
    console.log(`Test ${testId} deleted from database`);

    res.json({ message: 'Test deleted successfully' });
  } catch (error) {
    console.error('Error deleting test:', error);
    res.status(500).json({ error: error.message });
  }
};

