/**
 * Advanced athlete matching utilities for measurement imports
 * Implements multi-tiered matching with fuzzy string comparison
 */

export interface AthleteMatchCandidate {
  id: string;
  firstName: string;
  lastName: string;
  emails: string[];
  birthYear?: number;
  teams?: Array<{ name: string; id: string }>;
  username?: string;
  matchScore: number;
  matchReason: string;
}

export interface MatchingCriteria {
  firstName: string;
  lastName: string;
  teamName?: string;
}

export interface MatchResult {
  type: 'exact' | 'fuzzy' | 'partial' | 'none';
  candidate?: AthleteMatchCandidate;
  alternatives?: AthleteMatchCandidate[];
  confidence: number;
  requiresManualReview: boolean;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
  
  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Calculate string similarity as a percentage (0-100)
 */
function stringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  const cleanStr1 = str1.toLowerCase().trim();
  const cleanStr2 = str2.toLowerCase().trim();
  
  if (cleanStr1 === cleanStr2) return 100;
  
  const maxLength = Math.max(cleanStr1.length, cleanStr2.length);
  const distance = levenshteinDistance(cleanStr1, cleanStr2);
  
  return Math.round(((maxLength - distance) / maxLength) * 100);
}

/**
 * Normalize names for comparison (handle common variations)
 */
function normalizeName(name: string): string {
  if (!name || typeof name !== 'string') return '';
  
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/\b(jr|sr|iii|ii|iv)\b/g, '') // Remove suffixes
    .trim();
}


/**
 * Score an athlete match based on firstName + lastName + team criteria
 */
function calculateMatchScore(criteria: MatchingCriteria, athlete: any): AthleteMatchCandidate {
  let score = 0;
  let matchReasons: string[] = [];
  
  // First Name matching (30 points)
  const firstNameSimilarity = stringSimilarity(
    normalizeName(criteria.firstName), 
    normalizeName(athlete.firstName || '')
  );
  
  if (firstNameSimilarity >= 99) {
    score += 30;
    matchReasons.push('first name exact');
  } else if (firstNameSimilarity >= 90) {
    score += 25;
    matchReasons.push('first name fuzzy');
  } else if (firstNameSimilarity >= 80) {
    score += 20;
    matchReasons.push('first name partial');
  }
  
  // Last Name matching (40 points - higher weight since more unique)
  const lastNameSimilarity = stringSimilarity(
    normalizeName(criteria.lastName), 
    normalizeName(athlete.lastName || '')
  );
  
  if (lastNameSimilarity >= 99) {
    score += 40;
    matchReasons.push('last name exact');
  } else if (lastNameSimilarity >= 90) {
    score += 30;
    matchReasons.push('last name fuzzy');
  } else if (lastNameSimilarity >= 80) {
    score += 20;
    matchReasons.push('last name partial');
  }
  
  // Team matching (30 points)
  if (criteria.teamName && athlete.teams?.length > 0) {
    let bestTeamScore = 0;
    let teamMatchType = '';
    
    for (const team of athlete.teams) {
      const teamSimilarity = stringSimilarity(
        normalizeName(criteria.teamName), 
        normalizeName(team.name || '')
      );
      
      let teamScore = 0;
      let matchType = '';
      
      if (teamSimilarity >= 99) {
        teamScore = 30;
        matchType = 'team exact';
      } else if (teamSimilarity >= 85) {
        teamScore = 20;
        matchType = 'team fuzzy';
      } else if (teamSimilarity >= 70) {
        teamScore = 10;
        matchType = 'team partial';
      }
      
      if (teamScore > bestTeamScore) {
        bestTeamScore = teamScore;
        teamMatchType = matchType;
      }
    }
    
    score += bestTeamScore;
    if (teamMatchType) {
      matchReasons.push(teamMatchType);
    }
  }
  
  return {
    id: athlete.id,
    firstName: athlete.firstName,
    lastName: athlete.lastName,
    emails: athlete.emails || [],
    birthYear: athlete.birthYear,
    teams: athlete.teams,
    username: athlete.username,
    matchScore: score,
    matchReason: matchReasons.join(', ')
  };
}

/**
 * Find the best matching athlete using multi-tiered approach
 */
export function findBestAthleteMatch(
  criteria: MatchingCriteria, 
  athletes: any[]
): MatchResult {
  if (!athletes || athletes.length === 0) {
    return {
      type: 'none',
      confidence: 0,
      requiresManualReview: false
    };
  }
  
  // Score all athletes
  const candidates = athletes
    .map(athlete => calculateMatchScore(criteria, athlete))
    .sort((a, b) => b.matchScore - a.matchScore);
  
  const bestCandidate = candidates[0];
  const secondBest = candidates[1];
  
  // Handle case where all candidates have 0 score
  if (!bestCandidate || bestCandidate.matchScore === 0) {
    return {
      type: 'none',
      confidence: 0,
      requiresManualReview: false,
      alternatives: candidates.length > 1 ? candidates.slice(0, 3) : undefined
    };
  }
  
  // Determine match type and confidence based on new scoring system
  let matchType: 'exact' | 'fuzzy' | 'partial' | 'none';
  let confidence: number;
  let requiresManualReview = false;
  
  if (bestCandidate.matchScore >= 90) {
    matchType = 'exact';
    confidence = bestCandidate.matchScore;
  } else if (bestCandidate.matchScore >= 75) {
    matchType = 'fuzzy';
    confidence = bestCandidate.matchScore;
    
    // Require manual review if there are close alternatives
    if (secondBest && (bestCandidate.matchScore - secondBest.matchScore) < 10) {
      requiresManualReview = true;
    }
  } else if (bestCandidate.matchScore >= 60) {
    matchType = 'partial';
    confidence = bestCandidate.matchScore;
    requiresManualReview = true;
  } else {
    matchType = 'none';
    confidence = 0;
    requiresManualReview = false;
  }
  
  // Provide alternatives for manual review
  const alternatives = candidates
    .filter(c => c.matchScore >= 30 && c.id !== bestCandidate.id)
    .slice(0, 3); // Top 3 alternatives
  
  return {
    type: matchType,
    candidate: matchType !== 'none' ? bestCandidate : undefined,
    alternatives: alternatives.length > 0 ? alternatives : undefined,
    confidence,
    requiresManualReview
  };
}

