import { validationResult } from 'express-validator';
import Board from '../models/Board.js';
import Exam from '../models/Exam.js';
import Subject from '../models/Subject.js';
import QuestionPaper from '../models/QuestionPaper.js';
import Question from '../models/Question.js';
import TestAttempt from '../models/TestAttempt.js';
// Use Redis cache if available, fallback to in-memory cache
import cacheService from '../services/redisCacheService.js';

export const getBoards = async (req, res) => {
  try {
    const cacheKey = 'boards:all';
    
    // Check cache first (Redis or in-memory fallback)
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      console.log('⚡ Cache HIT: Returning boards from cache');
      res.set('Cache-Control', 'public, max-age=86400'); // 1 day
      res.set('X-Cache-Status', 'HIT');
      return res.json({ boards: cached });
    }

    // Cache miss - fetch from database
    console.log('💾 Cache MISS: Fetching boards from database');
    const boards = await Board.find()
      .select('_id name slug description priority')
      .sort({ priority: 1, name: 1 })
      .limit(50) // Limit results for performance
      .lean(); // Use lean() for better performance - returns plain JS objects

    // Return minimal data
    const organizedBoards = boards.map(board => ({
      _id: board._id,
      name: board.name,
      slug: board.slug,
      description: board.description || '',
    }));

    // Store in cache for 1 day (boards rarely change)
    await cacheService.set(cacheKey, organizedBoards, 24 * 60 * 60 * 1000); // 1 day

    // Set cache headers for better performance
    res.set('Cache-Control', 'public, max-age=86400'); // Cache for 1 day (86400 seconds)
    res.set('X-Cache-Status', 'MISS');
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
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('[createTest] Validation errors:', errors.array());
      return res.status(400).json({ 
        error: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { examId, subjectId, questionPaperId, questions } = req.body;
    console.log(`[createTest] Request body:`, { examId, subjectId, questionPaperId, questionsCount: questions?.length, hasUser: !!req.user });

    // Get question paper details if provided
    let questionPaper = null;
    let subject = null;
    let exam = null;

    // Optimize: Fetch metadata efficiently, use lean(), minimize populates
    if (questionPaperId) {
      // First fetch question paper to get subject and exam IDs
      questionPaper = await QuestionPaper.findById(questionPaperId)
        .select('_id name section subject exam')
        .lean();
      
      if (!questionPaper) {
        return res.status(404).json({ error: 'Question paper not found' });
      }

      // Fetch subject and exam in parallel (faster than populates)
      const [fetchedSubject, fetchedExam] = await Promise.all([
        Subject.findById(questionPaper.subject)
          .select('_id name icon')
          .lean(),
        Exam.findById(questionPaper.exam)
          .select('_id title name board')
          .populate('board', 'name')
          .lean(),
      ]);
      
      subject = fetchedSubject;
      exam = fetchedExam;
    } else if (examId) {
      exam = await Exam.findById(examId)
        .select('_id title name board')
        .populate('board', 'name')
        .lean();
      if (!exam) {
        return res.status(404).json({ error: 'Exam not found' });
      }

      if (subjectId) {
        subject = await Subject.findById(subjectId)
          .select('_id name icon')
          .lean();
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
      // Optimize: Use lean() and only select _id for faster query
      const publishedQuestions = await Question.find(questionQuery)
        .select('_id')
        .lean();
      questionIds = publishedQuestions.map(q => q._id.toString());
    }

    if (questionIds.length === 0) {
      return res.status(400).json({ 
        error: 'No questions available for this test',
        hint: 'No published questions found for this selection'
      });
    }

    // Optimize: Use lean(), limit fields, remove unnecessary populates (we already have subject/exam data)
    const testQuestions = await Question.find({
      _id: { $in: questionIds },
      status: 'published',
    })
    .select('_id text options correctIndex explanation difficulty tags media')
    .sort({ createdAt: 1 })
    .lean(); // Use lean() for better performance - returns plain JS objects

    if (testQuestions.length === 0) {
      return res.status(400).json({ error: 'No questions available for this test' });
    }

    // Add question numbers and metadata (no need for separate query - use array index)
    const testQuestionsWithNumbers = testQuestions.map((q, idx) => {
      q.questionNumber = idx + 1;
      // Add subject and exam data we already have
      if (subject) {
        q.subject = { _id: subject._id, name: subject.name, icon: subject.icon };
      }
      if (exam) {
        q.exam = { _id: exam._id, title: exam.title || exam.name };
      }
      if (questionPaper) {
        q.questionPaper = { _id: questionPaper._id, name: questionPaper.name, section: questionPaper.section };
      }
      return q;
    });

    // Generate test ID - use userId if logged in, otherwise use session ID
    const userId = req.user?._id || null;
    const sessionId = userId ? null : `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const testId = userId ? `test_${Date.now()}_${userId}` : `test_${Date.now()}_${sessionId}`;

    // Create test attempt in database
    // Handle ObjectId conversion for lean() objects - ObjectIds from lean() are still ObjectIds
    const examIdValue = exam?._id || null;
    const subjectIdValue = subject?._id || null;
    const questionPaperIdValue = questionPaperId || null;
    
    const testAttempt = await TestAttempt.create({
      testId,
      userId: userId,
      sessionId: sessionId,
      examId: examIdValue,
      subjectId: subjectIdValue,
      questionPaperId: questionPaperIdValue,
      exam: exam ? {
        _id: examIdValue,
        name: exam.title || exam.name || null, // Use title (from Exam model) or name (if exists)
        title: exam.title || null,
        board: exam.board ? (exam.board._id || exam.board) : null, // Handle populated or ObjectId
      } : null,
      subject: subject ? {
        _id: subjectIdValue,
        name: subject.name,
        icon: subject.icon,
      } : null,
      subjectName: subject?.name || null,
      questionPaper: questionPaper ? {
        _id: questionPaper._id || questionPaperIdValue,
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

    console.log(`[createTest] Creating test attempt: testId=${testId}, userId=${userId || 'anonymous'}, sessionId=${sessionId || 'none'}, examId=${examIdValue}, subjectId=${subjectIdValue}, questionPaperId=${questionPaperIdValue}, questionsCount=${testQuestionsWithNumbers.length}`);

    res.status(201).json({
      testId,
      exam: testAttempt.exam,
      subject: testAttempt.subject,
      questionPaper: testAttempt.questionPaper,
      questions: testQuestionsWithNumbers,
    });
  } catch (error) {
    console.error('Error creating test:', error);
    console.error('Error stack:', error.stack);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: 'Validation error', details: error.message, errors: error.errors });
    }
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
      // Optimize: Use lean() and select only needed fields
      const test = await TestAttempt.findOne({ testId })
        .select('testId userId sessionId submitted')
        .lean();
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
        // Optimize: Use lean() and select only needed fields
        test = await TestAttempt.findOne({ testId })
          .select('_id testId userId sessionId submitted questions score correct total results examId subjectId questionPaperId __v')
          .lean(); // Use lean() for better performance
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

        // Check authorization - allow if userId matches OR if anonymous (no userId)
        // Handle ObjectId comparison for lean() objects
        if (req.user) {
          const testUserIdStr = test.userId ? String(test.userId) : null;
          const reqUserIdStr = req.user._id ? String(req.user._id) : null;
          if (!testUserIdStr || testUserIdStr !== reqUserIdStr) {
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

    // Optimize: Only fetch correctIndex and explanation - we already have question data in test
    const questionIds = test.questions.map(q => q.questionId);
    const questions = await Question.find({
      _id: { $in: questionIds },
    })
    .select('_id correctIndex explanation') // Only select needed fields
    .lean(); // Use lean() for better performance

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
        // Optimize: Use lean() in response and select only needed fields
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
            runValidators: true,
            lean: true, // Use lean() for faster response
            select: 'testId score correct total results submitted submittedAt' // Only return needed fields
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
            // Optimize: Use lean() and select only needed fields
            const updatedTest = await TestAttempt.findOne({ testId })
              .select('submitted score correct total results')
              .lean();
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

    // Fetch from database
    // Optimize: Use lean() and select only needed fields (include userId and sessionId for authorization)
    const test = await TestAttempt.findOne({ testId })
      .select('testId examId subjectId questionPaperId subjectName exam boardId score correct total startedAt submittedAt results submitted questions userId sessionId')
      .lean(); // Use lean() for better performance
    if (!test) {
      console.warn(`[getTestResult] Test not found: ${testId}`);
      return res.status(404).json({ 
        error: 'Test not found',
        message: 'The test may have expired or been deleted. Please start a new test.',
        testId 
      });
    }

        // Check authorization - allow if userId matches OR if anonymous (no userId) and sessionId matches
        // Handle ObjectId comparison for lean() objects
        if (req.user) {
          // Authenticated user - must match userId
          const testUserIdStr = test.userId ? String(test.userId) : null;
          const reqUserIdStr = req.user._id ? String(req.user._id) : null;
          if (!testUserIdStr || testUserIdStr !== reqUserIdStr) {
            return res.status(403).json({ error: 'Not authorized' });
          }
        } else {
          // Anonymous user - must have no userId and sessionId must match (if test has sessionId)
          if (test.userId) {
            return res.status(403).json({ error: 'Not authorized' });
          }
          // Note: sessionId matching is handled by testId format, but we could add explicit check if needed
    }

    if (!test.submitted) {
      // Return test data for in-progress tests (don't cache in-progress tests)
      // Optimize: Only fetch if not already in test document, use lean() and select minimal fields
      let exam = test.exam;
      let subject = test.subject;
      
      if (!exam && test.examId) {
        exam = await Exam.findById(test.examId)
          .select('_id title')
          .lean();
      }
      if (!subject && test.subjectId) {
        subject = await Subject.findById(test.subjectId)
          .select('_id name')
          .lean();
      }
      const response = {
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
      };
      return res.json(response);
    }

    // Submitted test - cache the result
    const response = {
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
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting test result:', error);
    res.status(500).json({ error: error.message });
  }
};

export const deleteTest = async (req, res) => {
  try {
    const { testId } = req.params;

    // Optimize: Use lean() and select only needed fields
    const test = await TestAttempt.findOne({ testId })
      .select('testId userId sessionId')
      .lean();
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

        // Check authorization - allow if userId matches OR if anonymous (no userId)
        // Handle ObjectId comparison for lean() objects
        if (req.user) {
          const testUserIdStr = test.userId ? String(test.userId) : null;
          const reqUserIdStr = req.user._id ? String(req.user._id) : null;
          if (!testUserIdStr || testUserIdStr !== reqUserIdStr) {
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

