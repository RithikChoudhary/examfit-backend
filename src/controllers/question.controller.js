import { validationResult } from 'express-validator';
import Question from '../models/Question.js';
import Exam from '../models/Exam.js';
import Subject from '../models/Subject.js';
import QuestionPaper from '../models/QuestionPaper.js';
import { getPaginationParams, getPaginationResponse } from '../utils/pagination.js';

// Helper function to update exam and parent exam question counts
const updateExamQuestionCounts = async (examId) => {
  const exam = await Exam.findById(examId);
  if (!exam) return;

  // Count published questions for this exam
  const directCount = await Question.countDocuments({ 
    exam: examId, 
    status: 'published' 
  });
  
  exam.totalQuestions = directCount;
  await exam.save();
  console.log(`Updated ${exam.title} totalQuestions to ${directCount}`);

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
  console.log(`Updated parent ${parentExam.title} totalQuestions to ${totalCount}`);

  // If parent has a grandparent, update that too (recursive)
  if (parentExam.parentExam) {
    await updateParentExamCounts(parentExam.parentExam);
  }
};

export const createQuestion = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      text,
      options,
      correctIndex,
      explanation,
      questionPaper,
      subject,
      exam,
      difficulty,
      tags,
      media,
      status,
    } = req.body;

    // Validate required fields
    if (!questionPaper) {
      return res.status(400).json({ error: 'Question Paper is required' });
    }

    if (!subject) {
      return res.status(400).json({ error: 'Subject is required' });
    }

    if (!exam) {
      return res.status(400).json({ error: 'Exam is required' });
    }

    if (!options || options.length < 2) {
      return res.status(400).json({ error: 'At least 2 options required' });
    }

    if (correctIndex < 0 || correctIndex >= options.length) {
      return res.status(400).json({ error: 'Invalid correctIndex' });
    }

    // Clean up options - ensure media is null if empty
    const cleanedOptions = options.map(opt => ({
      text: opt.text,
      media: (opt.media && opt.media.trim && opt.media.trim() !== '') ? opt.media : null,
    }));

    // Clean up media array
    const cleanedMedia = Array.isArray(media) 
      ? media.filter(img => img && typeof img === 'string' && img.trim() !== '')
      : [];

    const question = new Question({
      text,
      options: cleanedOptions,
      correctIndex,
      explanation: explanation || '',
      questionPaper,
      subject,
      exam,
      difficulty: difficulty || 'medium',
      tags: tags || [],
      media: cleanedMedia,
      createdBy: req.user._id,
      status: status || 'draft',
    });

    try {
    await question.save();
    } catch (saveError) {
      console.error('Error saving question:', saveError);
      console.error('Question data:', {
        text: text?.substring(0, 100),
        optionsCount: cleanedOptions.length,
        mediaCount: cleanedMedia.length,
        optionsWithMedia: cleanedOptions.filter(opt => opt.media).length,
      });
      throw saveError;
    }

    // Update exam counts (including parent exams)
    await updateExamQuestionCounts(exam);

    res.status(201).json({ question });
  } catch (error) {
    console.error('Error in createQuestion:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const getQuestions = async (req, res) => {
  try {
    const { page, limit, skip } = getPaginationParams(req);
    const { exam, subject, questionPaper, q, status, all } = req.query;

    const isAdmin = req.user?.role === 'admin';
    
    const query = {};
    if (exam) query.exam = exam;
    if (subject) query.subject = subject;
    if (questionPaper) query.questionPaper = questionPaper;
    if (q) {
      query.$text = { $search: q };
    }
    if (status) {
      query.status = status;
    } else if (!isAdmin) {
      query.status = 'published';
    }

    // If 'all' param is true, fetch all questions without pagination (for admin dashboard)
    const fetchAll = all === 'true';
    
    // Build the query - for admin users, explicitly select all fields including correctIndex
    // For non-admin, exclude correctIndex and createdBy
    let questionsQuery = Question.find(query);
    
    // For admin users, explicitly list all fields to ensure correctIndex is included
    // For non-admin, exclude correctIndex and createdBy
    if (isAdmin) {
      // Explicitly select all fields we need, including correctIndex
      questionsQuery = questionsQuery.select('text options correctIndex explanation questionPaper subject exam difficulty tags media createdBy status createdAt');
    } else {
      questionsQuery = questionsQuery.select('-correctIndex -createdBy');
    }
    
    questionsQuery = questionsQuery
      .populate('subject', 'name icon')
      .populate('exam', 'title slug')
      .populate({
        path: 'questionPaper',
        select: 'name section year subject board',
        populate: [
          { path: 'subject', select: 'name icon' },
          { path: 'board', select: 'name' }
        ]
      })
      .sort({ createdAt: 1 }); // Sort ascending (oldest first) for consistent numbering with test page

    if (!fetchAll) {
      questionsQuery = questionsQuery.skip(skip).limit(limit);
    }

    const questions = await questionsQuery;

    // Debug: Log first question to verify correctIndex is included for admin
    if (isAdmin && questions.length > 0) {
      const firstQ = questions[0];
      console.log('[getQuestions] Admin query - First question sample:', {
        _id: firstQ._id,
        hasCorrectIndex: 'correctIndex' in firstQ,
        correctIndex: firstQ.correctIndex,
        correctIndexType: typeof firstQ.correctIndex,
        allKeys: Object.keys(firstQ.toObject ? firstQ.toObject() : firstQ),
      });
    }

    // Add name field to exam for compatibility
    questions.forEach(q => {
      if (q.exam) q.exam.name = q.exam.title;
    });

    const total = await Question.countDocuments(query);

    const response = {
      questions,
      pagination: getPaginationResponse(page, limit, total),
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const isAdmin = req.user?.role === 'admin';
    
    // Build the query - for admin users, include all fields (including correctIndex)
    // For non-admin, exclude correctIndex and createdBy
    let questionQuery = Question.findById(id);
    
    // Only exclude fields for non-admin users
    if (!isAdmin) {
      questionQuery = questionQuery.select('-correctIndex -createdBy');
    }
    
    const question = await questionQuery
      .populate('subject', 'name')
      .populate('exam', 'title slug');

    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    res.json({ question });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateQuestion = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    if (req.user.role !== 'admin' && question.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const oldExamId = question.exam;
    const updateData = { ...req.body };
    delete updateData.createdBy;

    // Clean up options if provided
    if (updateData.options) {
      if (updateData.options.length < 2) {
        return res.status(400).json({ error: 'At least 2 options required' });
      }
      if (updateData.correctIndex !== undefined) {
        if (updateData.correctIndex < 0 || updateData.correctIndex >= updateData.options.length) {
          return res.status(400).json({ error: 'Invalid correctIndex' });
        }
      }
      // Clean up options media
      updateData.options = updateData.options.map(opt => ({
        text: opt.text,
        media: (opt.media && opt.media.trim && opt.media.trim() !== '') ? opt.media : null,
      }));
    }

    // Clean up media if provided
    if (updateData.media !== undefined) {
      updateData.media = Array.isArray(updateData.media)
        ? updateData.media.filter(img => img && typeof img === 'string' && img.trim() !== '')
        : [];
    }

    let updatedQuestion;
    try {
      updatedQuestion = await Question.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    } catch (updateError) {
      console.error('Error updating question:', updateError);
      console.error('Update data:', {
        optionsCount: updateData.options?.length,
        mediaCount: updateData.media?.length,
      });
      throw updateError;
    }

    // Update exam counts for old exam (if exam changed)
    if (oldExamId.toString() !== updatedQuestion.exam.toString()) {
      await updateExamQuestionCounts(oldExamId);
    }
    
    // Update exam counts for current exam
    await updateExamQuestionCounts(updatedQuestion.exam);

    res.json({ question: updatedQuestion });
  } catch (error) {
    console.error('Error in updateQuestion:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

export const deleteQuestion = async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    if (req.user.role !== 'admin' && question.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const examId = question.exam;
    await Question.findByIdAndDelete(req.params.id);

    // Update exam counts (including parent exams)
    await updateExamQuestionCounts(examId);

    res.json({ message: 'Question deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const bulkUploadQuestions = async (req, res) => {
  try {
    console.log('[bulkUploadQuestions] Request received:', {
      questionsCount: req.body.questions?.length,
      exam: req.body.exam,
      subject: req.body.subject,
      questionPaper: req.body.questionPaper,
    });
    const { questions, exam, subject, questionPaper } = req.body;

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'Questions array is required and must not be empty' });
    }

    if (!exam) {
      return res.status(400).json({ error: 'Exam ID is required' });
    }

    if (!subject) {
      return res.status(400).json({ error: 'Subject ID is required' });
    }

    if (!questionPaper) {
      return res.status(400).json({ error: 'Question Paper ID is required' });
    }

    // Verify exam, subject and question paper exist
    const examDoc = await Exam.findById(exam);
    if (!examDoc) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const subjectDoc = await Subject.findById(subject);
    if (!subjectDoc) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    const questionPaperDoc = await QuestionPaper.findById(questionPaper);
    if (!questionPaperDoc) {
      return res.status(404).json({ error: 'Question Paper not found' });
    }

    const savedQuestions = [];
    const errors = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      
      try {
        // Debug first 3 questions
        if (i < 3) {
          console.log(`\n[Backend] Processing question ${i + 1}:`, {
            text: q.text?.substring(0, 50),
            optionsCount: q.options?.length,
            receivedCorrectIndex: q.correctIndex,
            options: q.options?.map(opt => ({ text: opt.text?.substring(0, 20) })),
          });
        }
        
        // Validate question data
        if (!q.text || !q.text.trim()) {
          errors.push(`Question ${i + 1}: Question text is required`);
          continue;
        }

        if (!q.options || !Array.isArray(q.options) || q.options.length < 2) {
          errors.push(`Question ${i + 1}: At least 2 options are required (got ${q.options?.length || 0})`);
          continue;
        }

        const validOptions = q.options.filter(opt => opt && opt.text && opt.text.trim());
        if (validOptions.length < 2) {
          errors.push(`Question ${i + 1}: At least 2 valid options are required (got ${validOptions.length} valid out of ${q.options.length} total)`);
          continue;
        }

        // Ensure correctIndex is a valid number and within bounds
        const correctIndex = typeof q.correctIndex === 'number' && !isNaN(q.correctIndex) 
          ? Math.floor(q.correctIndex)  // Ensure it's an integer
          : parseInt(q.correctIndex, 10);

        // Debug after filtering
        if (i < 3) {
          console.log(`[Backend] Question ${i + 1} after filtering:`, {
            validOptionsCount: validOptions.length,
            receivedCorrectIndex: q.correctIndex,
            processedCorrectIndex: correctIndex,
            validRange: `0-${validOptions.length - 1}`,
            isValid: correctIndex >= 0 && correctIndex < validOptions.length,
          });
        }

        if (isNaN(correctIndex) || correctIndex < 0 || correctIndex >= validOptions.length) {
          errors.push(`Question ${i + 1}: Invalid correct answer index (got ${q.correctIndex}, processed as ${correctIndex}, valid range: 0-${validOptions.length - 1})`);
          continue;
        }

        const validDifficulty = ['easy', 'medium', 'hard'].includes(q.difficulty?.toLowerCase()) 
          ? q.difficulty.toLowerCase() 
          : 'medium';

        // Create question
        const question = new Question({
          text: q.text.trim(),
          options: validOptions.map(opt => ({
            text: opt.text.trim(),
            media: opt.media || null
          })),
          correctIndex: correctIndex, // Use the validated and processed correctIndex
          explanation: (q.explanation || '').trim(),
          questionPaper: questionPaper,
          subject: subject,
          exam: exam,
          difficulty: validDifficulty,
          status: q.status || 'published',
          createdBy: req.user._id,
        });

        const saved = await question.save();
        
        // Debug first 3 saved questions
        if (i < 3) {
          console.log(`[Backend] Question ${i + 1} saved:`, {
            _id: saved._id,
            correctIndex: saved.correctIndex,
            correctIndexType: typeof saved.correctIndex,
            correctOptionText: saved.options[saved.correctIndex]?.text?.substring(0, 30),
            optionsCount: saved.options.length,
            allOptions: saved.options.map((opt, idx) => `${idx}: "${opt.text?.substring(0, 20)}"`),
          });
        }
        
        savedQuestions.push(saved);
      } catch (error) {
        errors.push(`Question ${i + 1}: ${error.message}`);
      }
    }

    // Update exam counts
    if (savedQuestions.length > 0) {
      await updateExamQuestionCounts(exam);
    }

    console.log('[bulkUploadQuestions] Upload complete:', {
      total: questions.length,
      saved: savedQuestions.length,
      errors: errors.length,
    });
    
    res.json({
      success: true,
      total: questions.length,
      saved: savedQuestions.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully saved ${savedQuestions.length} out of ${questions.length} questions`
    });
  } catch (error) {
    console.error('Bulk upload error:', error);
    res.status(500).json({ error: error.message });
  }
};
