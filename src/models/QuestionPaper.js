import mongoose from 'mongoose';

const questionPaperSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true,
  },
  exam: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true,
  },
  board: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board',
    required: true,
  },
  section: {
    type: String,
    default: 'General',
    trim: true,
  },
  year: {
    type: Number,
  },
  duration: {
    type: Number, // in minutes
    default: 60,
  },
  totalMarks: {
    type: Number,
    default: 100,
  },
  priority: {
    type: Number,
    default: 0,
  },
  meta: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

questionPaperSchema.index({ subject: 1, exam: 1 });
questionPaperSchema.index({ board: 1, exam: 1, subject: 1 });

export default mongoose.model('QuestionPaper', questionPaperSchema);

