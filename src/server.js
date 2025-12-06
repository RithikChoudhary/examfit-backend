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

// Trust proxy - required when behind a reverse proxy (Render, etc.)
app.set('trust proxy', true);

// CORS configuration - allows both local development and production domains
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }
    
    // Normalize origin (remove trailing slash)
    const normalizedOrigin = origin.replace(/\/$/, '');
    
    // In development, allow all localhost origins
    if (config.nodeEnv === 'development') {
      return callback(null, true);
    }
    
    // Check if origin is in allowed list (exact match or normalized)
    const isAllowed = config.corsOrigins.some(allowedOrigin => {
      const normalizedAllowed = allowedOrigin.replace(/\/$/, '');
      return normalizedOrigin === normalizedAllowed || normalizedOrigin === allowedOrigin;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      // Log the rejected origin for debugging
      console.warn(`CORS: Rejected origin: ${origin}. Allowed origins:`, config.corsOrigins);
      callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200, // Some legacy browsers (IE11, various SmartTVs) choke on 204
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
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    corsOrigins: config.corsOrigins
  });
});

// Request logging middleware (for debugging)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
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

// Error handling middleware
app.use((err, req, res, next) => {
  // Handle CORS errors specifically
  if (err.message && err.message.includes('CORS')) {
    console.error('CORS Error:', err.message);
    return res.status(403).json({ 
      error: 'CORS policy violation',
      message: err.message 
    });
  }
  
  console.error('Error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler - must be last
app.use((req, res) => {
  console.warn(`[404] Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path,
    method: req.method
  });
});

const PORT = config.port;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

