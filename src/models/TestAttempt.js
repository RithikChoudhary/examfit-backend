import mongoose from 'mongoose';

const questionAnswerSchema = new mongoose.Schema({
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true,
  },
  answer: {
    type: mongoose.Schema.Types.Mixed, // Can be number, string, or null
    default: null,
  },
  flagged: {
    type: Boolean,
    default: false,
  },
}, { _id: false });

const testAttemptSchema = new mongoose.Schema({
  testId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Optional for anonymous users
    default: null,
    index: true,
  },
  sessionId: {
    type: String,
    default: null, // For anonymous users
    index: true,
  },
  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    default: null,
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    default: null,
  },
  questionPaperId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuestionPaper',
    default: null,
  },
  // Store exam details for quick access
  exam: {
    _id: mongoose.Schema.Types.ObjectId,
    name: String,
    title: String,
    board: mongoose.Schema.Types.Mixed, // Can be ObjectId or populated object
  },
  // Store subject details
  subject: {
    _id: mongoose.Schema.Types.ObjectId,
    name: String,
    icon: String,
  },
  subjectName: {
    type: String,
    default: null,
  },
  // Store question paper details
  questionPaper: {
    _id: mongoose.Schema.Types.ObjectId,
    name: String,
  },
  // Questions with answers
  questions: [{
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
    },
    question: {
      type: mongoose.Schema.Types.Mixed, // Store full question object
      required: true,
    },
    answer: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    flagged: {
      type: Boolean,
      default: false,
    },
  }],
  // Test status
  submitted: {
    type: Boolean,
    default: false,
    index: true,
  },
  startedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  submittedAt: {
    type: Date,
    default: null,
  },
  // Results (after submission)
  score: {
    type: Number,
    default: null,
  },
  correct: {
    type: Number,
    default: null,
  },
  total: {
    type: Number,
    default: null,
  },
  results: [{
    questionId: mongoose.Schema.Types.ObjectId,
    question: mongoose.Schema.Types.Mixed,
    userAnswer: mongoose.Schema.Types.Mixed,
    correctAnswer: mongoose.Schema.Types.Mixed,
    isCorrect: Boolean,
    explanation: String,
    flagged: Boolean,
  }],
}, {
  timestamps: true, // Adds createdAt and updatedAt
});

// Index for efficient queries
testAttemptSchema.index({ userId: 1, submitted: 1, createdAt: -1 });
testAttemptSchema.index({ sessionId: 1, submitted: 1, createdAt: -1 }); // For anonymous users
testAttemptSchema.index({ testId: 1 });
testAttemptSchema.index({ userId: 1, examId: 1 });

// Optional: Auto-delete old test attempts after 90 days
// Uncomment if you want automatic cleanup
// testAttemptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.model('TestAttempt', testAttemptSchema);

