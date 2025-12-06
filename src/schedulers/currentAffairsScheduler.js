import cron from 'node-cron';
import currentAffairsService from '../services/currentAffairsService.js';

// Get yesterday's date (NewsAPI has news available for yesterday, not today)
const getYesterdayDate = () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
};

// Run daily at 6 AM IST
// Format: minute hour day month dayOfWeek
const scheduleCurrentAffairs = () => {
  // Run at 6:00 AM every day - fetch YESTERDAY's news
  cron.schedule('0 6 * * *', async () => {
    const yesterday = getYesterdayDate();
    console.log(`🕐 Scheduled task: Fetching current affairs for ${yesterday}...`);
    try {
      const result = await currentAffairsService.scrapeAffairsForDate(yesterday);
      console.log('✅ Scheduled scraping completed:', result);
    } catch (error) {
      console.error('❌ Scheduled scraping failed:', error);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });

  console.log('📅 Current Affairs scheduler initialized - Will run daily at 6:00 AM IST');
  console.log('📰 News will be fetched for YESTERDAY (NewsAPI provides news with 1 day delay)');
  
  // FALLBACK: Check on startup if yesterday's data exists, if not, fetch it
  setTimeout(async () => {
    const yesterday = getYesterdayDate();
    console.log(`🔍 Startup check: Checking if current affairs exist for ${yesterday}...`);
    
    try {
      const verification = await currentAffairsService.verifyDatabaseContents(yesterday);
      
      if (verification.totalCount === 0) {
        console.log(`⚠️ No current affairs found for yesterday (${yesterday}). Fetching now...`);
        const result = await currentAffairsService.scrapeAffairsForDate(yesterday);
        console.log('✅ Startup fetch completed:', result);
      } else {
        console.log(`✅ Current affairs already exist for ${yesterday}: ${verification.totalCount} items`);
      }
    } catch (error) {
      console.error('❌ Startup check failed:', error.message);
    }
  }, 5000); // Wait 5 seconds after startup to let MongoDB connect fully
};

export default scheduleCurrentAffairs;

