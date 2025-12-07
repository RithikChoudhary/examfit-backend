import { verifyToken } from '../utils/jwt.js';
import User from '../models/User.js';

// Optional authentication - sets req.user if token is valid, but doesn't require it
export const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided - continue without user (anonymous access)
      req.user = null;
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
      // Invalid token - continue without user (anonymous access)
      req.user = null;
      return next();
    }

    const user = await User.findById(decoded.userId).select('-passwordHash');
    
    if (!user) {
      // User not found - continue without user (anonymous access)
      req.user = null;
      return next();
    }

    req.user = user;
    next();
  } catch (error) {
    // On error, continue without user (anonymous access)
    req.user = null;
    next();
  }
};

