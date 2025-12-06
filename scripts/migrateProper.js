/**
 * Proper Migration Script - Old to New 4-Level Hierarchy
 * 
 * Old Structure:
 * - examId: "upsc" or "union-public-service-commission-(cms)-2020-pyq"
 * - examName: "Union Public Service Commission(CSE)" or yearly CMS
 * - subjectId: "history", "geography", etc.
 * - paperId: "qp-1738000223309"
 * - paperName: "PYQ-2024", "1. Ancient History", etc.
 * - section: "Previous Year", "Section I", etc.
 * - question: "Question text..."
 * 
 * New Structure:
 * Board (UPSC) → Exam (CSE, CMS) → Subject (History) → Question Paper (PYQ-2024) → Questions
 */

import mongoose from 'mongoose';

const OLD_URI = 'mongodb+srv://admin:admin@examfit.hzuwfkl.mongodb.net/examfit?retryWrites=true&w=majority';
const NEW_URI = 'mongodb+srv://admin:admin@examfit.oshk5.mongodb.net/Examfit?appName=ExamFit';

// Maps old examId to new Board + Exam structure
const EXAM_MAPPING = {
  'upsc': {
    boardName: 'UPSC',
    boardSlug: 'upsc',
    examName: 'Civil Services Examination (CSE)',
    examSlug: 'cse'
  }
};

// CMS exams pattern - they start with "union-public-service-commission-(cms)"
const CMS_PATTERN = /union-public-service-commission-\(cms\)-(\d{4})-pyq/i;
// Alternative pattern
const CMS_ALT_PATTERN = /cms.*(\d{4})/i;

// Subject icons
const SUBJECT_ICONS = {
  'history': '📜',
  'geography': '🌍',
  'polity': '⚖️',
  'economy': '💰',
  'environment-and-ecology': '🌿',
  'science-technology': '🔬',
  'csat---math': '🔢',
  'gs-pyq': '📚',
  'general-studies': '📖'
};

// Section normalization
const normalizeSection = (section) => {
  if (!section) return 'General';
  if (section.toLowerCase().includes('previous year')) return 'Previous Year Questions';
  if (section.toLowerCase().includes('section i')) return 'Section I';
  if (section.toLowerCase().includes('section ii')) return 'Section II';
  return section;
};

// Convert subject slug to name
const slugToName = (slug) => {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .replace('Csat Math', 'CSAT - Mathematics')
    .replace('Gs Pyq', 'GS Previous Year Questions')
    .replace('Science Technology', 'Science & Technology')
    .replace('Environment And Ecology', 'Environment & Ecology');
};

async function migrate() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     🔄 Proper Migration Script                             ║');
  console.log('║     Board → Exam → Subject → Question Paper → Questions    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Connect to both databases
  const oldConn = await mongoose.createConnection(OLD_URI).asPromise();
  const newConn = await mongoose.createConnection(NEW_URI).asPromise();
  
  console.log('✅ Connected to OLD database');
  console.log('✅ Connected to NEW database\n');

  const oldDb = oldConn.db;
  const newDb = newConn.db;

  // Fetch all old data
  console.log('📊 Fetching old data...');
  const oldExams = await oldDb.collection('exams').find({}).toArray();
  const oldSubjects = await oldDb.collection('subjects').find({}).toArray();
  const oldPapers = await oldDb.collection('questionPapers').find({}).toArray();
  const oldQuestions = await oldDb.collection('questions').find({}).toArray();
  
  console.log(`   Found ${oldExams.length} exams`);
  console.log(`   Found ${oldSubjects.length} subjects`);
  console.log(`   Found ${oldPapers.length} question papers`);
  console.log(`   Found ${oldQuestions.length} questions\n`);

  // Maps for tracking created entities
  const boardMap = new Map(); // slug -> _id
  const examMap = new Map();  // boardSlug-examSlug -> _id
  const subjectMap = new Map(); // examId-subjectSlug -> _id
  const paperMap = new Map(); // paperId -> _id

  // Step 1: Create UPSC Board
  console.log('📦 Step 1/5: Creating Boards...');
  const upscBoard = {
    name: 'UPSC',
    slug: 'upsc',
    description: 'Union Public Service Commission',
    icon: '🏛️',
    createdAt: new Date()
  };
  const boardResult = await newDb.collection('boards').insertOne(upscBoard);
  boardMap.set('upsc', boardResult.insertedId);
  console.log('   ✅ Created board: UPSC');

  // Step 2: Create Exams (CSE and CMS)
  console.log('\n📦 Step 2/5: Creating Exams...');
  
  // Create CSE exam
  const cseExam = {
    title: 'Civil Services Examination (CSE)',
    slug: 'cse',
    board: boardResult.insertedId,
    description: 'UPSC Civil Services Examination',
    createdAt: new Date()
  };
  const cseResult = await newDb.collection('exams').insertOne(cseExam);
  examMap.set('upsc-cse', cseResult.insertedId);
  console.log('   ✅ Created exam: Civil Services Examination (CSE)');

  // Create CMS exam
  const cmsExam = {
    title: 'Combined Medical Services (CMS)',
    slug: 'cms',
    board: boardResult.insertedId,
    description: 'UPSC Combined Medical Services Examination',
    createdAt: new Date()
  };
  const cmsResult = await newDb.collection('exams').insertOne(cmsExam);
  examMap.set('upsc-cms', cmsResult.insertedId);
  console.log('   ✅ Created exam: Combined Medical Services (CMS)');

  // Step 3: Create Subjects
  console.log('\n📦 Step 3/5: Creating Subjects...');
  
  // Group subjects by their exam type
  const cseSubjects = new Set();
  const cmsSubjects = new Map(); // subjectId -> subjectName
  
  // Get CSE subjects from papers
  oldPapers.forEach(paper => {
    const examId = paper.examId.toLowerCase();
    if (examId === 'upsc') {
      cseSubjects.add(paper.subjectId);
    }
  });
  
  // Get CMS subjects from old subjects collection (year-based like "2020-pyq")
  oldSubjects.forEach(subj => {
    const examId = subj.examId?.toLowerCase() || '';
    if (examId.includes('cms')) {
      cmsSubjects.set(subj.subjectId, subj.subjectName);
    }
  });

  // Create CSE subjects
  for (const subjectSlug of cseSubjects) {
    const subjectName = slugToName(subjectSlug);
    const subject = {
      name: subjectName,
      slug: subjectSlug.toLowerCase().replace(/\s+/g, '-'),
      exam: cseResult.insertedId,
      board: boardResult.insertedId,
      icon: SUBJECT_ICONS[subjectSlug] || '📚',
      description: `${subjectName} for UPSC CSE`,
      priority: 0,
      createdAt: new Date()
    };
    const result = await newDb.collection('subjectnews').insertOne(subject);
    subjectMap.set(`upsc-${subjectSlug}`, result.insertedId);
    console.log(`   ✅ Created CSE subject: ${subjectName}`);
  }

  // Create CMS subjects (year-based like "2022 PYQ", "2021 PYQ")
  for (const [subjectId, subjectName] of cmsSubjects) {
    const subject = {
      name: subjectName,
      slug: subjectId.toLowerCase().replace(/\s+/g, '-'),
      exam: cmsResult.insertedId,
      board: boardResult.insertedId,
      icon: '📝',
      description: `CMS ${subjectName}`,
      priority: extractYear(subjectName) || 0,
      createdAt: new Date()
    };
    const result = await newDb.collection('subjectnews').insertOne(subject);
    subjectMap.set(`cms-${subjectId}`, result.insertedId);
    console.log(`   ✅ Created CMS subject: ${subjectName}`);
  }

  // Step 4: Create Question Papers
  console.log('\n📦 Step 4/5: Creating Question Papers...');
  
  for (const paper of oldPapers) {
    const examId = paper.examId.toLowerCase();
    let subjectId, examDbId;
    
    if (examId.includes('cms')) {
      // CMS paper - use subjectId (like "2020-pyq") to find subject
      subjectId = subjectMap.get(`cms-${paper.subjectId}`);
      examDbId = cmsResult.insertedId;
    } else if (examId === 'upsc') {
      // CSE paper
      subjectId = subjectMap.get(`upsc-${paper.subjectId}`);
      examDbId = cseResult.insertedId;
    }

    if (!subjectId) {
      console.log(`   ⚠️  Skipping paper: ${paper.paperName} (no subject mapping for ${paper.subjectId})`);
      continue;
    }

    const questionPaper = {
      name: paper.paperName || 'Unnamed Paper',
      subject: subjectId,
      exam: examDbId,
      board: boardResult.insertedId,
      section: normalizeSection(paper.section),
      year: extractYear(paper.paperName) || null,
      duration: 60,
      totalMarks: 100,
      priority: 0,
      meta: {
        oldPaperId: paper.paperId,
        oldExamId: paper.examId,
        oldSubjectId: paper.subjectId
      },
      createdAt: new Date()
    };

    const result = await newDb.collection('questionpapers').insertOne(questionPaper);
    paperMap.set(paper.paperId, result.insertedId);
    console.log(`   ✅ Created paper: ${paper.paperName} (${normalizeSection(paper.section)})`);
  }

  // Step 5: Create Questions
  console.log('\n📦 Step 5/5: Migrating Questions...');
  
  let migrated = 0;
  let errors = 0;
  let skipped = 0;
  
  // Get a default admin user ID (or create system user)
  let defaultUserId = new mongoose.Types.ObjectId();
  
  // Process in batches
  const BATCH_SIZE = 100;
  for (let i = 0; i < oldQuestions.length; i += BATCH_SIZE) {
    const batch = oldQuestions.slice(i, i + BATCH_SIZE);
    const questionsToInsert = [];
    
    for (const oldQ of batch) {
      const paperDbId = paperMap.get(oldQ.paperId);
      if (!paperDbId) {
        skipped++;
        continue;
      }

      // Get the paper's subject and exam
      const paper = oldPapers.find(p => p.paperId === oldQ.paperId);
      if (!paper) {
        skipped++;
        continue;
      }

      const examId = paper.examId.toLowerCase();
      let subjectDbId, examDbId;
      
      if (examId.includes('cms')) {
        subjectDbId = subjectMap.get(`cms-${paper.subjectId}`);
        examDbId = cmsResult.insertedId;
      } else {
        subjectDbId = subjectMap.get(`upsc-${paper.subjectId}`);
        examDbId = cseResult.insertedId;
      }

      if (!subjectDbId || !examDbId) {
        skipped++;
        continue;
      }

      // Map options - handle case where text might not be a string
      const options = (oldQ.options || []).map(opt => ({
        id: opt.optionId || 'a',
        text: String(opt.text || '').trim()
      }));

      const newQuestion = {
        text: oldQ.question || '',
        options: options,
        correctOption: oldQ.correctOption || 'a',
        explanation: oldQ.explanation || '',
        difficulty: oldQ.difficulty || 'medium',
        tags: oldQ.tags || [],
        questionPaper: paperDbId,
        subject: subjectDbId,
        exam: examDbId,
        createdBy: defaultUserId,
        createdAt: oldQ.createdAt ? new Date(oldQ.createdAt) : new Date(),
        meta: {
          oldQuestionId: oldQ.questionId,
          oldPaperId: oldQ.paperId,
          source: oldQ.source || ''
        }
      };

      questionsToInsert.push(newQuestion);
    }

    if (questionsToInsert.length > 0) {
      try {
        await newDb.collection('questions').insertMany(questionsToInsert);
        migrated += questionsToInsert.length;
      } catch (err) {
        errors += questionsToInsert.length;
        console.log(`   ❌ Batch error: ${err.message}`);
      }
    }

    const progress = Math.round(((i + batch.length) / oldQuestions.length) * 100);
    process.stdout.write(`   Progress: ${progress}% (${migrated} migrated, ${skipped} skipped, ${errors} errors)\r`);
  }

  console.log(`\n   📊 Questions: ${migrated} migrated, ${skipped} skipped, ${errors} errors`);

  // Print summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                  ✅ MIGRATION COMPLETE!                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('📊 Summary:');
  console.log(`   Boards: ${boardMap.size}`);
  console.log(`   Exams: ${examMap.size}`);
  console.log(`   Subjects: ${subjectMap.size}`);
  console.log(`   Question Papers: ${paperMap.size}`);
  console.log(`   Questions: ${migrated}`);

  console.log('\n🎉 Your data is ready for the new 4-level hierarchy!');
  console.log('   Board → Exam → Subject → Question Paper → Questions\n');

  await oldConn.close();
  await newConn.close();
}

function extractYear(name) {
  if (!name) return null;
  const match = name.match(/(\d{4})/);
  return match ? parseInt(match[1]) : null;
}

migrate().catch(console.error);

