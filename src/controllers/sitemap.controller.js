import Board from '../models/Board.js';
import Exam from '../models/Exam.js';
import Subject from '../models/Subject.js';
import QuestionPaper from '../models/QuestionPaper.js';

/**
 * Generate dynamic XML sitemap with all boards, exams, subjects, and question papers
 */
export const generateSitemap = async (req, res) => {
  try {
    const baseUrl = 'https://examfit.in';
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Start building XML
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
  
  <!-- Homepage - Highest Priority -->
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  
  <!-- Main Content Pages - High Priority -->
  <url>
    <loc>${baseUrl}/exams</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  
  <url>
    <loc>${baseUrl}/subjects</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  
  <url>
    <loc>${baseUrl}/question-papers</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  
  <!-- Current Affairs - High Priority (Daily Updates) -->
  <url>
    <loc>${baseUrl}/current-affairs</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  
  <!-- Study Resources - High Priority -->
  <url>
    <loc>${baseUrl}/study-material</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  
  <url>
    <loc>${baseUrl}/syllabus</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  
  <!-- Blog - High Priority (Content Marketing) -->
  <url>
    <loc>${baseUrl}/blog</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  
  <!-- Information Pages - Medium Priority -->
  <url>
    <loc>${baseUrl}/about</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  
  <url>
    <loc>${baseUrl}/contact</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  
  <!-- Authentication Pages - Lower Priority -->
  <url>
    <loc>${baseUrl}/register</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  
  <url>
    <loc>${baseUrl}/login</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  
`;

    // Fetch all boards with minimal data
    const boards = await Board.find()
      .select('_id name slug')
      .sort({ priority: 1, createdAt: -1 })
      .lean()
      .limit(100); // Limit to prevent huge sitemaps

    // Add board exam pages
    for (const board of boards) {
      xml += `  <!-- Board: ${board.name} -->
  <url>
    <loc>${baseUrl}/exams?board=${board._id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  
`;
    }

    // Fetch all exams with minimal data
    const exams = await Exam.find()
      .select('_id title slug board')
      .populate('board', '_id name')
      .sort({ priority: 1, createdAt: -1 })
      .lean()
      .limit(500); // Limit to prevent huge sitemaps

    // Add exam-specific pages
    for (const exam of exams) {
      if (exam.board && exam.board._id) {
        xml += `  <!-- Exam: ${exam.title} -->
  <url>
    <loc>${baseUrl}/subjects?exam=${exam._id}&amp;board=${exam.board._id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  
`;
      }
    }

    // Fetch all subjects with minimal data
    const subjects = await Subject.find()
      .select('_id name slug exam board')
      .populate('exam', '_id title')
      .populate('board', '_id name')
      .sort({ createdAt: -1 })
      .lean()
      .limit(1000); // Limit to prevent huge sitemaps

    // Add subject-specific question paper pages
    for (const subject of subjects) {
      if (subject.exam && subject.exam._id && subject.board && subject.board._id) {
        xml += `  <!-- Subject: ${subject.name} -->
  <url>
    <loc>${baseUrl}/question-papers?subject=${subject._id}&amp;exam=${subject.exam._id}&amp;board=${subject.board._id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  
`;
      }
    }

    // Close XML
    xml += `</urlset>`;

    // Set proper headers for XML
    res.set('Content-Type', 'application/xml');
    res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.send(xml);
  } catch (error) {
    console.error('Error generating sitemap:', error);
    res.status(500).json({ error: 'Failed to generate sitemap' });
  }
};

