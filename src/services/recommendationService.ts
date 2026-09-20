import axios from 'axios';
import { MAIN_API } from '../config/runtime';

// --- Types ---

export interface RecommendationItem {
  id: number;
  title: string;
  name?: string;
  poster_path: string | null;
  posterPath?: string | null;
  backdrop_path: string | null;
  backdropPath?: string | null;
  media_type: string;
  mediaType?: string;
  overview: string;
  vote_average: number;
  voteAverage?: number;
  genre_ids: number[];
  genreIds?: number[];
  score?: number;
}

export interface BecauseYouWatched {
  title: string;
  sourceId: number;
  sourceType: string;
  poster_path?: string;
  items: RecommendationItem[];
}

export interface TopGenreGroup {
  genreId: number;
  genreName: string;
  items: RecommendationItem[];
}

export interface PersonalizedRecommendations {
  becauseYouWatched: BecauseYouWatched[];
  topGenres: TopGenreGroup[];
  trendingForYou: RecommendationItem[];
  usersAlsoWatched: RecommendationItem[];
  profileSummary: {
    topGenreIds: number[];
    preferredFormat: string;
    topDecade: string | null;
    contentAnalyzed: number;
  } | null;
}

// --- Helpers ---

const EMPTY_RESULT: PersonalizedRecommendations = {
  becauseYouWatched: [],
  topGenres: [],
  trendingForYou: [],
  usersAlsoWatched: [],
  profileSummary: null,
};

// --- Public API ---

/**
 * Fetches personalized recommendations from the backend for an authenticated user.
 */
export async function getPersonalizedRecommendations(
  profileId: string,
  language: string,
): Promise<PersonalizedRecommendations> {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) return EMPTY_RESULT;
    const response = await axios.get(
      `${MAIN_API}/api/recommendations/personalized`,
      {
        params: { profileId, language },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      },
    );
    const data = response.data;
    if (!data?.success) return EMPTY_RESULT;
    return {
      becauseYouWatched: data.becauseYouWatched || [],
      topGenres: data.topGenres || [],
      trendingForYou: data.trendingForYou || [],
      usersAlsoWatched: data.usersAlsoWatched || [],
      profileSummary: data.profileSummary || null,
    };
  } catch {
    return EMPTY_RESULT;
  }
}

/**
 * Checks whether recommendations are enabled based on user privacy and settings preferences.
 */
export function isRecommendationsEnabled(): boolean {
  if (localStorage.getItem('privacy_data_collection') === 'false') return false;
  if (localStorage.getItem('settings_disable_recommendations') === 'true') return false;
  return true;
}
