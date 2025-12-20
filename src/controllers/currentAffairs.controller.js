import currentAffairsService from '../services/currentAffairsService.js';
import cacheService from '../services/cacheService.js';

// Cache TTL: 30 minutes for current affairs (data doesn't change frequently)
const CACHE_TTL = 30 * 60 * 1000;

export const getCurrentAffairs = async (req, res) => {
  try {
    const { date, autoFetch } = req.query;
    let targetDate = date || new Date().toISOString().split('T')[0];
    
    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (date && !dateRegex.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }
    
    // Try cache first
    const cacheKey = `current-affairs:${targetDate}`;
    const cached = cacheService.get(cacheKey);
    if (cached && cached.affairs.length > 0) {
      return res.json({
        ...cached,
        cached: true
      });
    }
    
    let affairs = await currentAffairsService.getCurrentAffairsByDate(targetDate);
    
    // Auto-fetch fallback: if no data and autoFetch=true, try to fetch
    if (affairs.length === 0 && autoFetch === 'true') {
      console.log(`🔄 Auto-fetch triggered for ${targetDate} (no data found)`);
      try {
        const result = await currentAffairsService.scrapeAffairsForDate(targetDate);
        if (result.success) {
          affairs = await currentAffairsService.getCurrentAffairsByDate(targetDate);
          console.log(`✅ Auto-fetch successful: ${affairs.length} affairs`);
        }
      } catch (fetchError) {
        console.error(`⚠️ Auto-fetch failed:`, fetchError.message);
        // Continue with empty affairs - don't fail the request
      }
    }
    
    const response = {
      success: true,
      date: targetDate,
      count: affairs.length,
      affairs,
      autoFetched: affairs.length > 0 && autoFetch === 'true'
    };
    
    // Cache only if we have data
    if (affairs.length > 0) {
      cacheService.set(cacheKey, response, CACHE_TTL);
    }
    
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAvailableDates = async (req, res) => {
  try {
    // Try cache first (shorter TTL for dates)
    const cacheKey = 'current-affairs:dates';
    const cached = cacheService.get(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }
    
    const dates = await currentAffairsService.getAvailableDates();
    
    const response = {
      success: true,
      dates
    };
    
    // Cache for 10 minutes
    cacheService.set(cacheKey, response, 10 * 60 * 1000);
    
    res.json(response);
  } catch (error) {
    console.error('Error getting available dates:', error);
    res.status(500).json({ error: error.message });
  }
};

export const scrapeToday = async (req, res) => {
  try {
    const result = await currentAffairsService.scrapeTodaysAffairs();
    
    // Verify data was actually saved
    const today = new Date().toISOString().split('T')[0];
    const verification = await currentAffairsService.verifyDatabaseContents(today);
    result.verification = verification;
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const scrapeForDate = async (req, res) => {
  try {
    const { date } = req.params;
    const { force } = req.query; // Allow force re-scraping
    
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }
    
    const result = await currentAffairsService.scrapeAffairsForDate(date, force === 'true');
    
    // Verify data was actually saved
    const verification = await currentAffairsService.verifyDatabaseContents(date);
    result.verification = verification;
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const verifyDatabase = async (req, res) => {
  try {
    const { date } = req.query;
    const result = await currentAffairsService.verifyDatabaseContents(date);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

