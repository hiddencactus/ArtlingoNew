/**
 * CUSTOM HOOK: useImageLoader
 * 
 * Fetches list of images from backend.
 * Handles loading and error states.
 */

import { useState, useEffect } from "react";
import { API_ENDPOINTS } from "../utils/constants";

export function useImageLoader() {
  const [imageList, setImageList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(API_ENDPOINTS.LIST_IMAGES)
      .then((res) => res.json())
      .then((data) => {
        setImageList(data.images);
        setLoading(false);
      })
      .catch((err) => {
        console.error("❌ Failed to fetch images:", err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return { imageList, loading, error };
}
