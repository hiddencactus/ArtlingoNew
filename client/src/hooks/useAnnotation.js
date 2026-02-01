/**
 * CUSTOM HOOK: useAnnotation
 * 
 * Submits annotation to backend.
 * Handles loading, error states, and response data.
 */

import { useState } from "react";
import { API_ENDPOINTS, GRID_CONFIG } from "../utils/constants";

export function useAnnotation() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const submitAnnotation = async (imageId, artistId, selectedCells, options = {}) => {
    setLoading(true);
    setError(null);

    try {
      const { noIssues = false, issueScope = [] } = options;

      // Convert grid cells to pixel coordinates
      const clicks = noIssues
        ? []
        : Array.from(selectedCells).map((cellKey) => {
            const [row, col] = cellKey.split(",").map(Number);
            const { CELL_SIZE } = GRID_CONFIG;
            return [
              col * CELL_SIZE + CELL_SIZE / 2,
              row * CELL_SIZE + CELL_SIZE / 2,
            ];
          });

      console.log(`📤 Submitting annotation:`, {
        image: imageId,
        artist: artistId,
        clicks: clicks.length,
      });

      console.log("🔗 URL:", API_ENDPOINTS.SAVE_ANNOTATION);
      console.log("📦 Body:", {
        image_id: imageId,
        artist_id: artistId,
        clicks,
        no_issues: noIssues,
        issue_scope: issueScope,
      });

      const res = await fetch(API_ENDPOINTS.SAVE_ANNOTATION, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_id: imageId,
          artist_id: artistId,
          clicks,
          no_issues: noIssues,
          issue_scope: issueScope,
        }),
      });

      console.log("📡 Response status:", res.status, res.statusText);
      console.log("📡 Response headers:", res.headers);

      if (!res.ok) {
        throw new Error(`Backend error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      console.log("📥 Parsed response data:", data);
      return data;
    } catch (err) {
      console.error("❌ Error submitting annotation:", err);
      setError(err.message);
      setResult({
        error: true,
        message: `Failed to save annotation: ${err.message}`,
      });
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteAnnotation = async (imageId, artistId) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(API_ENDPOINTS.DELETE_ANNOTATION, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_id: imageId,
          artist_id: artistId,
        }),
      });

      if (!res.ok) {
        throw new Error(`Backend error: ${res.status} ${res.statusText}`);
      }

      return await res.json();
    } catch (err) {
      console.error("❌ Error deleting annotation:", err);
      setError(err.message);
      setResult({
        error: true,
        message: `Failed to delete annotation: ${err.message}`,
      });
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { loading, result, error, submitAnnotation, deleteAnnotation };
}
