import express from 'express';
import * as sitemapController from '../controllers/sitemap.controller.js';

const router = express.Router();

// Generate dynamic sitemap
router.get('/sitemap.xml', sitemapController.generateSitemap);

export default router;

