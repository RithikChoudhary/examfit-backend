import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from backend directory (two levels up from src/config)
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET', 'PORT'];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

export const config = {
  port: process.env.PORT || 4000,
  mongodbUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@examfit.test',
  seedAdminPass: process.env.SEED_ADMIN_PASS || 'AdminPassword123',
  nodeEnv: process.env.NODE_ENV || 'development',
};

