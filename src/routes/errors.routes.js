import express from 'express';

const router = express.Router();

// Log frontend errors (optional - for tracking)
router.post('/log', (req, res) => {
  try {
    const errorInfo = req.body;
    
    // Log to console with detailed information
    console.group('🚨 Frontend Error Logged');
    console.error('Timestamp:', errorInfo.timestamp);
    console.error('Message:', errorInfo.message);
    console.error('URL:', errorInfo.url);
    console.error('User ID:', errorInfo.userId);
    console.error('Context:', errorInfo.context);
    
    if (errorInfo.response) {
      console.error('API Error:', {
        status: errorInfo.response.status,
        statusText: errorInfo.response.statusText,
        url: errorInfo.response.url,
        method: errorInfo.response.method,
        data: errorInfo.response.data,
      });
    }
    
    if (errorInfo.stack) {
      console.error('Stack Trace:', errorInfo.stack);
    }
    
    console.groupEnd();
    
    // In production, you could save to database or send to error tracking service
    // For now, just log to console
    
    res.status(200).json({ message: 'Error logged successfully' });
  } catch (error) {
    console.error('Error logging frontend error:', error);
    res.status(500).json({ error: 'Failed to log error' });
  }
});

export default router;

