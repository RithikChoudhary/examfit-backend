import mongoose from 'mongoose';

const boardSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  priority: {
    type: Number,
    default: 0,
  },
  exams: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
  }],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

boardSchema.index({ name: 1 });
boardSchema.index({ exams: 1 }); // Index for populate operations
boardSchema.index({ priority: 1, name: 1 }); // Compound index for sorting

export default mongoose.model('Board', boardSchema);

