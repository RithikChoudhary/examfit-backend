import mongoose from 'mongoose';

const examSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  name: {
    type: String,
    trim: true,
  },
  slug: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  board: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board',
    required: true,
  },
  parentExam: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    default: null,
  },
  subjects: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
  }],
  duration: {
    type: Number,
    required: false,
    min: 1,
    default: 60,
  },
  totalQuestions: {
    type: Number,
    default: 0,
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

examSchema.index({ slug: 1 });
examSchema.index({ board: 1 });
examSchema.index({ parentExam: 1 });
examSchema.index({ subjects: 1 }); // Index for populate operations

export default mongoose.model('Exam', examSchema);

