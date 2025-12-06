import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
    trim: true,
  },
  options: [{
    text: {
      type: String,
      required: true,
    },
    media: {
      type: String,
      default: null,
    },
  }],
  correctIndex: {
    type: Number,
    required: true,
    min: 0,
  },
  explanation: {
    type: String,
    default: '',
  },
  questionPaper: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuestionPaper',
    required: true,
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
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium',
  },
  tags: [{
    type: String,
    trim: true,
  }],
  media: [{
    type: String,
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'draft',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

questionSchema.index({ questionPaper: 1, subject: 1, exam: 1 });
questionSchema.index({ text: 'text' });

export default mongoose.model('Question', questionSchema);

