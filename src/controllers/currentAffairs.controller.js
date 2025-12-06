import currentAffairsService from '../services/currentAffairsService.js';

export const getCurrentAffairs = async (req, res) => {
  try {
    const { date, autoFetch } = req.query;
    let targetDate = date || new Date().toISOString().split('T')[0];
    
    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (date && !dateRegex.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
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
    
    res.json({
      success: true,
      date: targetDate,
      count: affairs.length,
      affairs,
      autoFetched: affairs.length > 0 && autoFetch === 'true'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAvailableDates = async (req, res) => {
  try {
    const dates = await currentAffairsService.getAvailableDates();
    
    res.json({
      success: true,
      dates
    });
  } catch (error) {
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

