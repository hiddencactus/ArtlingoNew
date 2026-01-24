/**
 * API CONSTANTS AND CONFIGURATION
 * 
 * Centralize all API endpoints and constants so they're easy to update.
 * If you need to change the API URL, do it here in one place.
 */

export const API_BASE = "http://localhost:5000";

export const API_ENDPOINTS = {
  // Image management
  LIST_IMAGES: `${API_BASE}/api/images`,
  GET_IMAGE: (filename) => `${API_BASE}/static/training_images/${filename}`,
  
  // Annotations (Phase 1)
  SAVE_ANNOTATION: `${API_BASE}/api/label`,
  GET_ANNOTATIONS: (imageId) => `${API_BASE}/api/labels/${imageId}`,
  
  // Training data & progress (Phase 2)
  GENERATE_TRAINING: (imageId) => `${API_BASE}/api/generate-training-data/${imageId}`,
  GET_PROGRESS_BOARD: `${API_BASE}/api/progress-board`,
  GET_ARTIST_PROGRESS: (artistId) => `${API_BASE}/api/artist-progress/${artistId}`,
  GET_DATA_SUMMARY: `${API_BASE}/api/data-summary`,
};

export const GRID_CONFIG = {
  SIZE: 16,              // 16x16 grid
  CELL_SIZE: 32,         // Each cell = 32x32 pixels
  IMAGE_SIZE: 512,       // 512x512 image
  MAX_CLICKS: 3,         // Max 3 selections per image
};

export const ARTISTS = ["Stephen", "Yash", "Artist 3", "Artist 4"];

export const STORAGE_KEYS = {
  ARTIST_ID: "artistId",
};
