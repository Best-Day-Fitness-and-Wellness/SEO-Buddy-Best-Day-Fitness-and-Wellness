'use strict';

function parseReviewCards(html) {
  const reviews = [];
  const cardPattern = /<div class="rev" data-plat="([a-z]+)">([\s\S]*?)<\/p><\/div>/g;
  let match;

  while ((match = cardPattern.exec(html))) {
    const [, platform, body] = match;
    const author = (body.match(/<b>([^<]*)<\/b>/) || [])[1] || '';
    const date = (body.match(/<div class="d">([^<]*)<\/div>/) || [])[1] || '';
    let rating = Number((body.match(/aria-label="(\d) out of 5 stars"/) || [])[1]);

    if (!rating) {
      const starRow = (body.match(/<div class="rs"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '';
      const disabledStars = ((starRow.match(/<span class="off">([★]*)<\/span>/) || [])[1] || '').length;
      rating = ((starRow.match(/★/g) || []).length) - disabledStars || null;
    }

    reviews.push({ platform, author, date, rating: rating || null });
  }

  return reviews;
}

function parseJsonLd(html) {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    return { __parseError: error.message };
  }
}

function metaContent(html, attribute, value) {
  const primary = new RegExp(`<meta[^>]*${attribute}=["']${value}["'][^>]*content=["']([^"']*)["']`, 'i');
  const reversed = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*${attribute}=["']${value}["']`, 'i');
  return (html.match(primary) || html.match(reversed) || [])[1] || null;
}

function monthlyGrowth(reviews) {
  const countsByMonth = {};
  for (const review of reviews) {
    if (/^\d{4}-\d{2}$/.test(review.date)) {
      countsByMonth[review.date] = (countsByMonth[review.date] || 0) + 1;
    }
  }

  const months = Object.keys(countsByMonth).sort();
  if (!months.length) return [];

  const series = [];
  let cursor = months[0];
  const last = months[months.length - 1];
  let total = 0;
  let guard = 0;

  while (cursor <= last && guard++ < 400) {
    total += countsByMonth[cursor] || 0;
    series.push({ month: cursor, added: countsByMonth[cursor] || 0, total });
    let [year, month] = cursor.split('-').map(Number);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
    cursor = `${year}-${String(month).padStart(2, '0')}`;
  }

  return series;
}

function extractPlatformTotals(html) {
  const totals = {};
  const google = html.match(/<b>Google<\/b><div class="s">[^<]*?([\d.]+)\s*·\s*(\d+)/);
  if (google) totals.google = { avgRating: Number(google[1]), reviewCount: Number(google[2]) };
  const facebook = html.match(/<b>Facebook<\/b><div class="s">[^<]*?(\d+)%\s*·\s*(\d+)/);
  if (facebook) totals.facebook = { recommendPercent: Number(facebook[1]), reviewCount: Number(facebook[2]) };
  const yelp = html.match(/<b>Yelp<\/b><div class="s">[^<]*?(\d+)\s*reviews/);
  if (yelp) totals.yelp = { reviewCount: Number(yelp[1]) };
  return totals;
}

module.exports = {
  extractPlatformTotals,
  metaContent,
  monthlyGrowth,
  parseJsonLd,
  parseReviewCards,
};
