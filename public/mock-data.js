// Best Day Fitness Search Console Mock Data (Pre-loaded for easy offline testing)
const MOCK_GSC_DATA = [
  { 
    query: 'senior fitness st petersburg fl', 
    impressions: 1450, 
    clicks: 0, 
    ctr: 0, 
    position: 11.2, 
    leak: true,
    description: 'High-intent search for senior training programs in the local area. Highly authoritative target.'
  },
  { 
    query: 'mobility training st pete', 
    impressions: 980, 
    clicks: 0, 
    ctr: 0, 
    position: 14.5, 
    leak: true,
    description: 'Targeting our core mobility workouts. High impressions indicate active search interest.'
  },
  { 
    query: 'longevity fitness coach st petersburg', 
    impressions: 850, 
    clicks: 0, 
    ctr: 0, 
    position: 12.1, 
    leak: true,
    description: 'Direct matches for our core coaching services. GSC showing impressions without content.'
  },
  { 
    query: 'posture correction exercises senior', 
    impressions: 720, 
    clicks: 0, 
    ctr: 0, 
    position: 15.3, 
    leak: true,
    description: 'Educational leak. We can easily rank #1 here with an exercise guide and a consultation CTA.'
  },
  { 
    query: 'barefoot training older adults balance', 
    impressions: 540, 
    clicks: 0, 
    ctr: 0, 
    position: 18.0, 
    leak: true,
    description: 'Niche topic we have high authority in. Perfect for showing off our barefoot training studio.'
  },
  { 
    query: 'best day fitness', 
    impressions: 620, 
    clicks: 480, 
    ctr: 77.4, 
    position: 1.1, 
    leak: false,
    description: 'Direct branded searches. Doing great, no content action required.'
  },
  { 
    query: 'senior workout facility near me', 
    impressions: 480, 
    clicks: 0, 
    ctr: 0, 
    position: 19.4, 
    leak: true,
    description: 'Local directory intent. We should create a location-optimized landing page for GHL.'
  },
  { 
    query: 'injury recovery gym st petersburg fl', 
    impressions: 420, 
    clicks: 0, 
    ctr: 0, 
    position: 13.8, 
    leak: true,
    description: 'High-value search. People in pain looking for specialized fitness guidance.'
  },
  { 
    query: 'best day fitness st petersburg', 
    impressions: 350, 
    clicks: 270, 
    ctr: 77.1, 
    position: 1.2, 
    leak: false,
    description: 'Branded local search. Perfect performance.'
  },
  { 
    query: 'st petersburg senior personal trainer', 
    impressions: 310, 
    clicks: 0, 
    ctr: 0, 
    position: 11.9, 
    leak: true,
    description: 'Primary high-value keyword. Direct path to high-ticket personal training leads.'
  },
  { 
    query: 'co-op gym for wellness professionals st pete', 
    impressions: 290, 
    clicks: 0, 
    ctr: 0, 
    position: 16.5, 
    leak: true,
    description: 'Targets our professional co-op space. Great opportunity for recruitment.'
  }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MOCK_GSC_DATA;
}
