import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import { config } from './config/index.js';
import scheduleCurrentAffairs from './schedulers/currentAffairsScheduler.js';

import authRoutes from './routes/auth.routes.js';
import boardsRoutes from './routes/boards.routes.js';
import examsRoutes from './routes/exams.routes.js';
import subjectRoutes from './routes/subject.routes.js';
import questionPaperRoutes from './routes/questionPaper.routes.js';
import subjectsRoutes from './routes/subjects.routes.js'; // Legacy - to be removed
import questionsRoutes from './routes/questions.routes.js';
import studentsRoutes from './routes/students.routes.js';
import currentAffairsRoutes from './routes/currentAffairs.routes.js';

const app = express();

// CORS configuration - allows both local development and production domains
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (config.corsOrigins.indexOf(origin) !== -1 || config.nodeEnv === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

mongoose.connect(config.mongodbUri)
  .then(() => {
    console.log('Connected to MongoDB Atlas');
    // Initialize scheduled tasks
    scheduleCurrentAffairs();
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  });

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/boards', boardsRoutes);
app.use('/api/exams', examsRoutes);
app.use('/api/subject', subjectRoutes);
app.use('/api/question-papers', questionPaperRoutes);
app.use('/api/subjects', subjectsRoutes); // Legacy - to be removed
app.use('/api/questions', questionsRoutes);
app.use('/api/student', studentsRoutes);
app.use('/api/current-affairs', currentAffairsRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = config.port;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

