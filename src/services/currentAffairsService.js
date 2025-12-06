import axios from 'axios';
import CurrentAffair from '../models/CurrentAffair.js';

class DailyCurrentAffairsService {
  constructor() {
    this.sources = {
      newsapi: 'https://newsapi.org/v2/everything',
      pib: 'https://pib.gov.in/indexd.aspx',
      thehindu: 'https://www.thehindu.com/news/national/',
      indianexpress: 'https://indianexpress.com/section/india/',
      livemint: 'https://www.livemint.com/news'
    };
    // Primary API: NewsAPI
    this.newsApiKey = process.env.NEWS_API_KEY || 'e790c2966d0c4792ba555f4067251cbb';
    // Backup API: GNews (used when NewsAPI exhausts or fails)
    // Using provided GNews API key
    this.gnewsApiKey = process.env.GNEWS_API_KEY || 'bbdd4efe454156c482e5e9142e2d6ab2';
    // Target number of articles per day
    this.targetArticles = 100;
  }

  async scrapeTodaysAffairs() {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    console.log(`📰 Starting current affairs scraping for ${today}...`);
    
    try {
      // Check if today's affairs already exist
      const existingCount = await CurrentAffair.countDocuments({ date: today });
      
      if (existingCount > 0) {
        console.log(`⚠️ Current affairs for ${today} already exist (${existingCount} items). Skipping...`);
        return { success: true, message: 'Already exists', count: existingCount };
      }

      // Scrape from multiple sources
      const allAffairs = await this.scrapeFromMultipleSources();
      
      if (allAffairs.length === 0) {
        console.log('⚠️ No current affairs found from any source');
        return { success: false, message: 'No content found' };
      }

      // Save to database
      console.log(`💾 Saving ${allAffairs.length} affairs to database...`);
      let savedCount = 0;
      let duplicateCount = 0;
      let errorCount = 0;
      
      for (let i = 0; i < allAffairs.length; i++) {
        const result = await this.saveAffair({
          date: today,
          title: allAffairs[i].title,
          description: allAffairs[i].description,
          content: allAffairs[i].content,
          source: allAffairs[i].source,
          url: allAffairs[i].url,
          urlToImage: allAffairs[i].urlToImage,
          publishedAt: allAffairs[i].publishedAt,
          author: allAffairs[i].author,
          sourceUrl: allAffairs[i].sourceUrl,
          sourceId: allAffairs[i].sourceId,
          scrapedAt: new Date(),
          order: i + 1
        });
        
        if (result === null) {
          errorCount++;
        } else if (result.isDuplicate) {
          duplicateCount++;
        } else if (result.isNew) {
          savedCount++;
        }
      }

      // Verify what's actually in the database
      const actualCount = await CurrentAffair.countDocuments({ date: today });
      
      console.log(`📊 Save Summary for ${today}:`);
      console.log(`   ✅ Successfully saved: ${savedCount}`);
      console.log(`   ⚠️  Duplicates skipped: ${duplicateCount}`);
      console.log(`   ❌ Errors: ${errorCount}`);
      console.log(`   📦 Total in database for this date: ${actualCount}`);
      
      console.log(`✅ Successfully processed ${savedCount + duplicateCount} current affairs for ${today}`);
      return { 
        success: true, 
        count: savedCount, 
        duplicates: duplicateCount,
        errors: errorCount,
        totalInDb: actualCount,
        date: today 
      };
    } catch (error) {
      console.error('❌ Error in scrapeTodaysAffairs:', error);
      throw error;
    }
  }

  async scrapeFromMultipleSources(targetDate = null) {
    try {
      console.log(`🔍 Fetching current affairs from multiple sources for date: ${targetDate || 'today'}...`);
      console.log(`🎯 Target: ${this.targetArticles} articles`);
      
      const affairs = [];
      const sourceResults = {};
      let newsApiExhausted = false;
      
      // Step 1: Try NewsAPI first (primary source)
      try {
        const newsAffairs = await this.scrapeNewsAPIs(targetDate);
        if (newsAffairs && newsAffairs.length > 0) {
          affairs.push(...newsAffairs);
          sourceResults.newsapi = newsAffairs.length;
          console.log(`✅ NewsAPI: Fetched ${newsAffairs.length} articles`);
        } else {
          console.log(`⚠️ NewsAPI returned no articles`);
          sourceResults.newsapi = 0;
        }
      } catch (error) {
        console.log(`⚠️ NewsAPI failed: ${error.message}`);
        sourceResults.newsapi = 'error';
        // Check if it's a rate limit error (exhausted)
        if (error.response?.status === 429 || error.message.includes('rate') || error.message.includes('limit')) {
          newsApiExhausted = true;
          console.log(`🔄 NewsAPI exhausted, will use GNews as backup`);
        }
      }
      
      // Step 2: Use GNews Top Headlines first (most relevant for exams)
      try {
        const topHeadlines = await this.scrapeGNewsTopHeadlines();
        if (topHeadlines && topHeadlines.length > 0) {
          affairs.push(...topHeadlines);
          sourceResults.gnews_top = topHeadlines.length;
          console.log(`✅ GNews Top Headlines: Fetched ${topHeadlines.length} articles`);
        }
      } catch (error) {
        console.log(`⚠️ GNews Top Headlines failed: ${error.message}`);
        sourceResults.gnews_top = 'error';
      }
      
      // Step 3: Use GNews Search as backup if NewsAPI failed/exhausted OR if we need more articles
      const needMoreArticles = affairs.length < this.targetArticles;
      if (needMoreArticles || newsApiExhausted) {
        try {
          console.log(`🔄 Using GNews Search as ${newsApiExhausted ? 'backup (NewsAPI exhausted)' : 'supplement (need more articles)'}...`);
          const gnewsAffairs = await this.scrapeGNews(targetDate);
          if (gnewsAffairs && gnewsAffairs.length > 0) {
            affairs.push(...gnewsAffairs);
            sourceResults.gnews_search = gnewsAffairs.length;
            console.log(`✅ GNews Search: Fetched ${gnewsAffairs.length} articles`);
          } else {
            console.log(`⚠️ GNews Search returned no articles`);
            sourceResults.gnews_search = 0;
          }
        } catch (error) {
          console.log(`⚠️ GNews Search failed: ${error.message}`);
          sourceResults.gnews_search = 'error';
        }
      }
      
      // Step 3: Always try PIB RSS for government news
      try {
        const pibAffairs = await this.scrapePIB();
        if (pibAffairs && pibAffairs.length > 0) {
          affairs.push(...pibAffairs);
          sourceResults.pib = pibAffairs.length;
          console.log(`✅ PIB: Fetched ${pibAffairs.length} articles`);
        } else {
          sourceResults.pib = 0;
        }
      } catch (error) {
        console.log(`⚠️ PIB RSS failed: ${error.message}`);
        sourceResults.pib = 'error';
      }
      
      // Step 4: Remove duplicates based on title similarity
      const uniqueAffairs = this.removeDuplicates(affairs);
      
      // Log summary
      console.log(`📊 Source results:`, sourceResults);
      console.log(`📰 Total collected: ${affairs.length} → After dedup: ${uniqueAffairs.length}`);
      
      if (uniqueAffairs.length === 0) {
        console.log(`⚠️ No current affairs found from any source for ${targetDate}`);
        return [];
      }
      
      // Limit to target articles
      const finalAffairs = uniqueAffairs.slice(0, this.targetArticles);
      console.log(`✅ Final: ${finalAffairs.length} articles ready to save`);
      
      return finalAffairs;
    } catch (error) {
      console.error('❌ Error fetching from sources:', error.message);
      return [];
    }
  }
  
  // Remove duplicate articles based on title similarity
  removeDuplicates(affairs) {
    const seen = new Set();
    return affairs.filter(affair => {
      // Normalize title for comparison
      const normalizedTitle = affair.title?.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
      if (!normalizedTitle || seen.has(normalizedTitle)) {
        return false;
      }
      seen.add(normalizedTitle);
      return true;
    });
  }
  
  // GNews Top Headlines - Most relevant for government exams
  async scrapeGNewsTopHeadlines() {
    try {
      if (!this.gnewsApiKey) {
        return [];
      }
      
      console.log('🔍 Fetching top headlines from GNews API...');
      
      // Top headlines endpoint - returns most important/recent news
      const url = `https://gnews.io/api/v4/top-headlines?category=general&country=in&lang=en&max=10&apikey=${this.gnewsApiKey}`;
      
      const response = await axios.get(url, { 
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (response.data && response.data.articles) {
        const articles = response.data.articles
          .filter(article => {
            if (!article.title || !article.description || article.title.length < 10) {
              return false;
            }
            if (article.title.toLowerCase().includes('[removed]')) {
              return false;
            }
            return true;
          })
          .map(article => {
            const sourceName = typeof article.source === 'object' 
              ? article.source?.name || 'GNews'
              : article.source || 'GNews';
            
            return {
              title: article.title,
              description: article.description || '',
              content: article.content || article.description || '',
              source: sourceName,
              url: article.url || '',
              urlToImage: article.image || '',
              publishedAt: article.publishedAt || new Date().toISOString(),
              author: '',
              sourceUrl: typeof article.source === 'object' ? article.source?.url || '' : '',
              sourceId: 'gnews-top'
            };
          });
        
        console.log(`✅ GNews Top Headlines: ${articles.length} articles`);
        return articles;
      }
      
      return [];
    } catch (error) {
      console.log('⚠️ GNews Top Headlines failed:', error.message);
      if (error.response?.status === 403) {
        console.log('   ❌ GNews API key invalid');
      } else if (error.response?.status === 429) {
        console.log('   ❌ GNews API rate limit exceeded');
      }
      return [];
    }
  }
  
  // GNews API - Backup news source (100 requests/day free, max 10 articles per request)
  async scrapeGNews(targetDate = null) {
    try {
      // Check if GNews API key is available
      if (!this.gnewsApiKey) {
        console.log('⚠️ GNews API key not configured - skipping');
        return [];
      }
      
      console.log('🔍 Fetching news from GNews API (backup)...');
      
      // GNews API - Focused on government exam relevant topics (UPSC, SSC, etc.)
      // Note: Free tier returns max 10 articles per request, 100 requests/day limit
      // Using 10 focused queries to get ~100 articles (10 per query)
      const queries = [
        // Priority topics for government exams (most important first)
        'india government policy scheme',    // Government policies & schemes (UPSC Priority)
        'india economy RBI budget',          // Economic news, budget, RBI (UPSC Priority)
        'india international relations',     // Foreign policy, bilateral relations (UPSC Priority)
        'india environment climate change',  // Environment, climate change (UPSC Priority)
        'india science technology ISRO',     // Science & technology, ISRO (UPSC Priority)
        'india defence security',            // Defence & security (UPSC Priority)
        'india constitution supreme court',  // Constitutional, legal news (UPSC Priority)
        'india social welfare scheme',       // Social issues, welfare schemes
        'india agriculture rural',           // Agriculture, rural development
        'india infrastructure development'   // Infrastructure projects
      ];
      
      const allArticles = [];
      const seenTitles = new Set(); // Deduplicate across queries
      
      for (const query of queries) {
        try {
          const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&country=in&max=10&apikey=${this.gnewsApiKey}`;
          
          const response = await axios.get(url, { 
            timeout: 15000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          if (response.data && response.data.articles) {
            const articles = response.data.articles
              .filter(article => {
                // Basic validation
                if (!article.title || !article.description || article.title.length < 10) {
                  return false;
                }
                // Check for removed/blocked content
                if (article.title.toLowerCase().includes('[removed]')) {
                  return false;
                }
                // Deduplicate by title
                const normalizedTitle = article.title.toLowerCase().trim();
                if (seenTitles.has(normalizedTitle)) {
                  return false;
                }
                seenTitles.add(normalizedTitle);
                return true;
              })
              .map(article => {
                // GNews API format:
                // - source is an object with {name, url} or just a string
                const sourceName = typeof article.source === 'object' 
                  ? article.source?.name || 'GNews'
                  : article.source || 'GNews';
                
                return {
                  title: article.title,
                  description: article.description || '',
                  content: article.content || article.description || '',
                  source: sourceName,
                  url: article.url || '',
                  urlToImage: article.image || '',
                  publishedAt: article.publishedAt || new Date().toISOString(),
                  author: '',
                  sourceUrl: typeof article.source === 'object' ? article.source?.url || '' : '',
                  sourceId: 'gnews'
                };
              });
            
            allArticles.push(...articles);
            console.log(`   📰 GNews "${query}": ${articles.length} unique articles (${response.data.articles.length} total)`);
          }
          
          // Small delay between requests to avoid rate limiting (100 requests/day free)
          await new Promise(resolve => setTimeout(resolve, 600));
          
        } catch (queryError) {
          console.log(`   ⚠️ GNews query "${query}" failed: ${queryError.message}`);
          if (queryError.response?.status === 429) {
            console.log(`   ❌ Rate limit reached for GNews API`);
            break; // Stop if rate limited
          }
        }
      }
      
      console.log(`✅ GNews total: ${allArticles.length} unique articles from ${queries.length} queries`);
      return allArticles;
      
    } catch (error) {
      console.log('⚠️ GNews API failed:', error.message);
      if (error.response?.status === 403) {
        console.log('   ❌ GNews API key invalid or quota exceeded');
      } else if (error.response?.status === 429) {
        console.log('   ❌ GNews API rate limit exceeded (100 requests/day free)');
      }
      return [];
    }
  }

  async scrapePIB() {
    try {
      console.log('🔍 Fetching from PIB RSS feed...');
      const response = await axios.get('https://pib.gov.in/rss/leng.xml', {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const affairs = [];
      const items = response.data.match(/<item>[\s\S]*?<\/item>/g) || [];
      
      console.log(`📊 PIB RSS: Found ${items.length} items in feed`);
      
      if (items.length === 0) {
        console.log('⚠️ PIB RSS feed has no items - this is normal');
        return [];
      }
      
      for (let i = 0; i < Math.min(items.length, 10); i++) { // Increased to 10 items
        const item = items[i];
        const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
        const descMatch = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/);
        const linkMatch = item.match(/<link>(.*?)<\/link>/);
        
        if (titleMatch && descMatch) {
          affairs.push({
            title: this.cleanText(titleMatch[1]),
            content: this.cleanText(descMatch[1]),
            description: this.cleanText(descMatch[1]).substring(0, 200),
            source: 'PIB',
            url: linkMatch ? linkMatch[1] : this.sources.pib
          });
        }
      }
      
      console.log(`✅ PIB: Successfully parsed ${affairs.length} affairs from RSS feed`);
      return affairs;
    } catch (error) {
      console.log(`⚠️ PIB scraping failed: ${error.message} - continuing with other sources`);
      return [];
    }
  }

  async scrapeNewsAPIs(targetDate = null) {
    try {
      console.log('🔍 Fetching news from NewsAPI...');
      
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Normalize to start of day
      
      const dateLimit = new Date();
      dateLimit.setDate(today.getDate() - 30);
      dateLimit.setHours(0, 0, 0, 0);
      
      let fromDate;
      if (targetDate) {
        // Parse target date and normalize
        const targetDateObj = new Date(targetDate + 'T00:00:00');
        targetDateObj.setHours(0, 0, 0, 0);
        
        // Check if date is beyond 30 days limit
        if (targetDateObj < dateLimit) {
          console.log(`⚠️ Date ${targetDate} is beyond NewsAPI free plan limit (30 days). Using 30 days ago.`);
          fromDate = dateLimit.toISOString().split('T')[0];
        } 
        // Check if date is in the future
        else if (targetDateObj > today) {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          yesterday.setHours(0, 0, 0, 0);
          fromDate = yesterday.toISOString().split('T')[0];
          console.log(`📅 Target date ${targetDate} is in future, using yesterday: ${fromDate}`);
        } 
        // Use the target date (for past dates within 30 days)
        else {
          fromDate = targetDate;
          console.log(`📅 Fetching news for selected date: ${targetDate}`);
        }
      } else {
        // Default: fetch yesterday's news
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        fromDate = yesterday.toISOString().split('T')[0];
        console.log(`📅 Fetching news for yesterday: ${fromDate}`);
      }
      
      const query = 'india';
      // Use a date range to get more results, then filter by actual published date
      const toDateObj = new Date(fromDate + 'T00:00:00');
      toDateObj.setDate(toDateObj.getDate() + 1); // Add 1 day to get articles from target date
      const toDate = toDateObj.toISOString().split('T')[0];
      
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&from=${fromDate}&to=${toDate}&language=en&sortBy=publishedAt&apiKey=${this.newsApiKey}&pageSize=100`;
      
      console.log(`📡 Making API request for date range: ${fromDate} to ${toDate} (target: ${fromDate})`);
      
      try {
        const response = await axios.get(url, {
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (response.data) {
          const totalResults = response.data.totalResults || 0;
          const articles = response.data.articles || [];
          
          console.log(`📊 NewsAPI response: ${totalResults} total results, ${articles.length} articles in response`);
          
          if (articles.length === 0) {
            console.log(`⚠️ No articles returned from NewsAPI for date ${fromDate} - this is normal if no news was published`);
            return [];
          }
          
          // Filter articles by actual published date matching target date
          const targetDateStart = new Date(fromDate + 'T00:00:00');
          const targetDateEnd = new Date(fromDate + 'T23:59:59');
          
          const validArticles = articles
            .filter(article => {
              // Basic validation
              if (!article.title || 
                  !(article.description || article.content) || 
                  article.title.length <= 10 ||
                  article.title.toLowerCase().includes('[removed]') ||
                  article.description?.toLowerCase().includes('[removed]') ||
                  article.content?.toLowerCase().includes('[removed]')) {
                return false;
              }
              
              // Filter by published date to match target date
              if (article.publishedAt) {
                const publishedDate = new Date(article.publishedAt);
                return publishedDate >= targetDateStart && publishedDate <= targetDateEnd;
              }
              
              return true; // Include if no publishedAt (shouldn't happen but be safe)
            });
          
          console.log(`✅ Found ${validArticles.length} valid articles for date ${fromDate} (filtered from ${articles.length} total)`);
          
          if (validArticles.length === 0) {
            console.log(`⚠️ No articles match the target date ${fromDate} after filtering`);
            return [];
          }
          
          const currentAffairs = validArticles.map(article => {
            let fullContent = '';
            if (article.content) {
              fullContent = article.content.replace(/\[\+\d+\s+chars\]$/, '').trim();
            }
            
            return {
              title: article.title || '',
              description: article.description || '',
              content: fullContent || article.description || '',
              source: article.source?.name || 'NewsAPI',
              url: article.url || '',
              urlToImage: article.urlToImage || '',
              publishedAt: article.publishedAt || new Date().toISOString(),
              author: article.author || '',
              sourceUrl: article.source?.url || '',
              sourceId: article.source?.id || ''
            };
          });
          
          console.log(`📰 Successfully fetched ${currentAffairs.length} current affairs from NewsAPI for ${fromDate}`);
          return currentAffairs;
        }
        
        console.log(`⚠️ NewsAPI returned invalid response structure`);
        return [];
      } catch (error) {
        if (error.response?.status === 429) {
          console.log('❌ Rate limit exceeded. Please check your API key quota.');
        } else {
          console.log('❌ NewsAPI request failed:', error.message);
        }
        return [];
      }
    } catch (error) {
      console.log('❌ NewsAPI scraping failed:', error.message);
      return [];
    }
  }

  cleanText(text) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .trim()
      .substring(0, 2000);
  }

  async saveAffair(affairData) {
    try {
      // Validate required fields
      if (!affairData.date || !affairData.title) {
        console.error(`❌ Cannot save affair: missing date or title`);
        return null;
      }

      // Check for duplicates based on title and date
      const existing = await CurrentAffair.findOne({
        date: affairData.date,
        title: affairData.title
      });

      if (existing) {
        console.log(`⚠️ Duplicate affair found (skipping): ${affairData.title.substring(0, 50)}...`);
        return { document: existing, isDuplicate: true, isNew: false };
      }

      // Ensure all required fields have defaults
      const dataToSave = {
        date: affairData.date,
        title: affairData.title,
        description: affairData.description || '',
        content: affairData.content || affairData.description || '',
        source: affairData.source || 'Unknown',
        url: affairData.url || '',
        urlToImage: affairData.urlToImage || '',
        publishedAt: affairData.publishedAt ? new Date(affairData.publishedAt) : new Date(),
        author: affairData.author || '',
        sourceUrl: affairData.sourceUrl || '',
        sourceId: affairData.sourceId || '',
        scrapedAt: new Date(),
        order: affairData.order || 0
      };

      const result = await CurrentAffair.create(dataToSave);
      console.log(`✅ Saved affair #${dataToSave.order}: ${dataToSave.title.substring(0, 50)}...`);
      
      return { document: result, isDuplicate: false, isNew: true };
    } catch (error) {
      // Don't throw - log and return null so the process continues
      console.error(`❌ Error saving affair to database:`, error.message);
      console.error(`   Title: ${affairData.title?.substring(0, 50)}...`);
      console.error(`   Date: ${affairData.date}`);
      return null; // Return null instead of throwing
    }
  }

  async getCurrentAffairsByDate(date) {
    try {
      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        console.error(`❌ Invalid date format: ${date}`);
        return [];
      }
      
      console.log(`🔍 Fetching current affairs from database for date: ${date}`);
      const affairs = await CurrentAffair.find({ date })
        .sort({ order: 1 })
        .lean();
      
      console.log(`✅ Found ${affairs.length} affairs in database for ${date}`);
      return affairs;
    } catch (error) {
      console.error('❌ Error getting current affairs by date:', error);
      throw error;
    }
  }

  async getAvailableDates() {
    try {
      const dates = await CurrentAffair.distinct('date');
      return dates.sort().reverse(); // Latest first
    } catch (error) {
      console.error('❌ Error getting available dates:', error);
      throw error;
    }
  }

  async getTodaysAffairs() {
    const today = new Date().toISOString().split('T')[0];
    return this.getCurrentAffairsByDate(today);
  }

  // Verification function to check database contents
  async verifyDatabaseContents(date = null) {
    try {
      const targetDate = date || new Date().toISOString().split('T')[0];
      
      const count = await CurrentAffair.countDocuments({ date: targetDate });
      const sample = await CurrentAffair.find({ date: targetDate })
        .limit(5)
        .select('title source order')
        .lean();
      
      return {
        date: targetDate,
        totalCount: count,
        sample: sample,
        message: count > 0 
          ? `✅ Database has ${count} affairs for ${targetDate}`
          : `⚠️ No affairs found in database for ${targetDate}`
      };
    } catch (error) {
      console.error('❌ Error verifying database:', error);
      throw error;
    }
  }

  async scrapeAffairsForDate(targetDate, force = false) {
    console.log(`📰 Starting current affairs scraping for ${targetDate}...`);
    
    try {
      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(targetDate)) {
        throw new Error(`Invalid date format: ${targetDate}. Expected YYYY-MM-DD`);
      }

      const existingCount = await CurrentAffair.countDocuments({ date: targetDate });
      
      if (existingCount > 0 && !force) {
        console.log(`⚠️ Current affairs for ${targetDate} already exist (${existingCount} items). Skipping...`);
        return { success: true, message: 'Already exists', count: existingCount, date: targetDate };
      }

      // If force, delete existing data first
      if (force && existingCount > 0) {
        await CurrentAffair.deleteMany({ date: targetDate });
        console.log(`🗑️ Deleted ${existingCount} existing affairs for ${targetDate} (force mode)`);
      }

      console.log(`🔍 Fetching current affairs for date: ${targetDate}`);
      const allAffairs = await this.scrapeFromMultipleSources(targetDate);
      
      if (allAffairs.length === 0) {
        console.log(`⚠️ No current affairs found for ${targetDate}`);
        return { 
          success: false, 
          message: 'No content found from any source', 
          date: targetDate,
          hint: 'No news articles were found for this date. This could mean: 1) No news was published on this date, 2) All sources are unavailable, or 3) The date is outside the 30-day limit. Try a different date within the last 30 days.'
        };
      }

      console.log(`💾 Saving ${allAffairs.length} affairs to database...`);
      let savedCount = 0;
      let duplicateCount = 0;
      let errorCount = 0;
      
      for (let i = 0; i < allAffairs.length; i++) {
        const result = await this.saveAffair({
          date: targetDate,
          title: allAffairs[i].title,
          description: allAffairs[i].description,
          content: allAffairs[i].content,
          source: allAffairs[i].source,
          url: allAffairs[i].url,
          urlToImage: allAffairs[i].urlToImage,
          publishedAt: allAffairs[i].publishedAt,
          author: allAffairs[i].author,
          sourceUrl: allAffairs[i].sourceUrl,
          sourceId: allAffairs[i].sourceId,
          scrapedAt: new Date(),
          order: i + 1
        });
        
        if (result === null) {
          errorCount++;
        } else if (result.isDuplicate) {
          duplicateCount++;
        } else if (result.isNew) {
          savedCount++;
        }
      }

      // Verify what's actually in the database
      const actualCount = await CurrentAffair.countDocuments({ date: targetDate });
      
      console.log(`📊 Save Summary for ${targetDate}:`);
      console.log(`   ✅ Successfully saved: ${savedCount}`);
      console.log(`   ⚠️  Duplicates skipped: ${duplicateCount}`);
      console.log(`   ❌ Errors: ${errorCount}`);
      console.log(`   📦 Total in database for this date: ${actualCount}`);
      
      if (savedCount > 0 || duplicateCount > 0) {
        console.log(`✅ Successfully processed ${savedCount + duplicateCount} current affairs for ${targetDate}`);
        return { 
          success: true, 
          count: savedCount, 
          duplicates: duplicateCount,
          errors: errorCount,
          totalInDb: actualCount,
          date: targetDate 
        };
      } else {
        console.log(`⚠️ No affairs were saved for ${targetDate}`);
        return { 
          success: false, 
          message: 'No affairs could be saved', 
          errors: errorCount,
          date: targetDate 
        };
      }
    } catch (error) {
      console.error(`❌ Error in scrapeAffairsForDate for ${targetDate}:`, error);
      throw error;
    }
  }
}

export default new DailyCurrentAffairsService();

