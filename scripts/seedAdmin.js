import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import User from '../src/models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from backend directory
dotenv.config({ path: join(__dirname, '..', '.env') });

const { MONGODB_URI, SEED_ADMIN_EMAIL, SEED_ADMIN_PASS } = process.env;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is required');
  process.exit(1);
}

const seedAdmin = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      console.log('Admin user already exists:', existingAdmin.email);
      await mongoose.disconnect();
      return;
    }

    const email = SEED_ADMIN_EMAIL || 'admin@examfit.test';
    const password = SEED_ADMIN_PASS || 'AdminPassword123';

    const passwordHash = await bcrypt.hash(password, 12);
    const admin = new User({
      name: 'Admin User',
      email,
      passwordHash,
      role: 'admin',
      verified: true,
    });

    await admin.save();
    console.log('Admin user created successfully:');
    console.log('Email:', email);
    console.log('Password:', password);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
};

seedAdmin();

