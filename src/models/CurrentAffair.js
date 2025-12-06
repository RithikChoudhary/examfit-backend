import mongoose from 'mongoose';

const currentAffairSchema = new mongoose.Schema({
  date: {
    type: String,
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  content: {
    type: String,
    default: '',
  },
  source: {
    type: String,
    required: true,
    trim: true,
  },
  url: {
    type: String,
    default: '',
  },
  urlToImage: {
    type: String,
    default: '',
  },
  publishedAt: {
    type: Date,
    default: Date.now,
  },
  author: {
    type: String,
    default: '',
  },
  sourceUrl: {
    type: String,
    default: '',
  },
  sourceId: {
    type: String,
    default: '',
  },
  scrapedAt: {
    type: Date,
    default: Date.now,
  },
  order: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index for date and order
currentAffairSchema.index({ date: 1, order: 1 });
currentAffairSchema.index({ date: -1 });

export default mongoose.model('CurrentAffair', currentAffairSchema);

