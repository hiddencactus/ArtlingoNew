/**
 * ==============================================================================
 * LABEL PAGE - MAIN ANNOTATION INTERFACE
 * ==============================================================================
 * 
 * Orchestrates the annotation workflow:
 *   1. Load image list from backend
 *   2. Artist selects identity → Shows ArtistModal
 *   3. Displays current image with 16x16 grid
 *   4. Artist clicks up to 3 cells
 *   5. Submit → sends to /api/label
 *   6. Backend returns metrics + heatmap
 *   7. Display results
 * 
 * COMPONENT BREAKDOWN:
 *   - ArtistModal: Initial artist selection
 *   - ImageCanvas: Image + grid overlay + clickable cells
 *   - ControlPanel: Navigation + submit buttons
 *   - ResultsPanel: Metrics + heatmap + raw data
 * ==============================================================================
 */

import { useState, useEffect } from "react";
import { STORAGE_KEYS, API_ENDPOINTS, GRID_CONFIG } from "../utils/constants";
import ArtistModal from "../components/ArtistModal";
import ImageCanvas from "../components/ImageCanvas";
import ControlPanel from "../components/ControlPanel";
import ResultsPanel from "../components/ResultsPanel";
import { useImageLoader } from "../hooks/useImageLoader";
import { useAnnotation } from "../hooks/useAnnotation";

export default function LabelPage() {
  // ===== STATE =====
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedCells, setSelectedCells] = useState(new Set());
  const [hoveredCell, setHoveredCell] = useState(null);
  const [artistId, setArtistId] = useState(localStorage.getItem(STORAGE_KEYS.ARTIST_ID) || "");
  const [showArtistModal, setShowArtistModal] = useState(!artistId);
  const [resultJson, setResultJson] = useState(null);
  const [isAlreadyAnnotated, setIsAlreadyAnnotated] = useState(false);
  const [annotationsByArtist, setAnnotationsByArtist] = useState([]);

  // ===== CUSTOM HOOKS =====
  const { imageList, loading } = useImageLoader();
  const { submitAnnotation } = useAnnotation();

  // ===== EFFECT: Check if current image already annotated =====
  useEffect(() => {
    if (!imageList || imageList.length === 0 || !artistId) return;

    const checkAnnotationStatus = async () => {
      try {
        const response = await fetch(
          API_ENDPOINTS.GET_ANNOTATIONS(imageList[currentIndex])
        );
        
        if (response.ok) {
          // Image has annotations - check if current artist annotated it
          const data = await response.json();
          setAnnotationsByArtist(data.artists || []);
          
          const alreadyAnnotated = data.artists.some(
            (artist) => artist.toLowerCase() === artistId.toLowerCase()
          );
          setIsAlreadyAnnotated(alreadyAnnotated);
          
          if (alreadyAnnotated) {
            console.log(`✅ Image already annotated by ${artistId}`);
            
            // Load the actual annotation to show the previously selected cells
            const userAnnotation = data.annotations.find(
              (ann) => ann.artist_id.toLowerCase() === artistId.toLowerCase()
            );
            
            if (userAnnotation && userAnnotation.clicks) {
              // Convert pixel coordinates back to grid cells
              const cellKeys = userAnnotation.clicks.map((click) => {
                const [x, y] = click;
                const col = Math.floor(x / GRID_CONFIG.CELL_SIZE);
                const row = Math.floor(y / GRID_CONFIG.CELL_SIZE);
                return `${row},${col}`;
              });
              
              setSelectedCells(new Set(cellKeys));
              console.log(`📍 Loaded ${cellKeys.length} previously selected cells`);
            }
            setResultJson(userAnnotation);
          } else {
            // Other artists have annotated, but NOT this artist
            console.log(`⭕ This artist hasn't annotated this image yet`);
            setSelectedCells(new Set()); // CLEAR cells
          }
        } else if (response.status === 404) {
          // Image has NO annotations yet
          console.log(`⭕ Image not yet annotated by anyone`);
          setAnnotationsByArtist([]);
          setIsAlreadyAnnotated(false);
          setSelectedCells(new Set()); // Clear selected cells
        }
      } catch (error) {
        console.error("Error checking annotation status:", error);
      }
    };

    checkAnnotationStatus();
  }, [currentIndex, imageList, artistId]);

  // ===== HANDLER: Set artist and close modal =====
  const handleSetArtist = (name) => {
    localStorage.setItem(STORAGE_KEYS.ARTIST_ID, name);
    setArtistId(name);
    setShowArtistModal(false);
    console.log(`✅ Artist selected: ${name}`);
  };

  // ===== HANDLER: Toggle cell selection =====
  const handleCellClick = (row, col) => {
    const cellKey = `${row},${col}`;
    const newSelected = new Set(selectedCells);

    if (newSelected.has(cellKey)) {
      newSelected.delete(cellKey);
    } else if (newSelected.size < GRID_CONFIG.MAX_CLICKS) {
      newSelected.add(cellKey);
    }

    setSelectedCells(newSelected);
  };

  // ===== HANDLER: Submit annotation =====
  const handleSubmit = async () => {
    if (!imageList || imageList.length === 0) return;

    console.log("🚀 Starting submission...");
    try {
      const data = await submitAnnotation(
        imageList[currentIndex],
        artistId,
        selectedCells
      );
      console.log("📥 Received response:", data);
      setResultJson(data);
      console.log("✅ Results panel updated with:", data);
      
      // Mark as already annotated (disable further submissions for this image)
      setIsAlreadyAnnotated(true);
      
    } catch (error) {
      console.error("❌ Submission failed:", error);
      setResultJson({
        error: true,
        message: `Submission failed: ${error.message}`
      });
    }
  };

  // ===== HANDLER: Reset current image =====
  const handleReset = () => {
    setSelectedCells(new Set());
    setResultJson(null);
  };

  // ===== HANDLER: Navigation =====
  const handlePrev = () => {
    handleReset();
    setCurrentIndex((c) => Math.max(0, c - 1));
  };

  const handleNext = () => {
    handleReset();
    setCurrentIndex((c) => Math.min(imageList.length - 1, c + 1));
  };

  // ===== RENDER: Loading =====
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white text-lg">
        🔄 Scanning folder for images...
      </div>
    );
  }

  // ===== RENDER: No images =====
  if (imageList.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white text-xl">
        No images found. Please add images to the{" "}
        <code className="text-yellow-400 ml-2">server/static/training_images/</code> folder.
      </div>
    );
  }

  // ===== RENDER: Artist modal =====
  if (showArtistModal) {
    return <ArtistModal onSelectArtist={handleSetArtist} />;
  }

  // ===== RENDER: Main interface =====
  return (
    <div className="flex p-10 gap-10 bg-black min-h-screen text-white">
      {/* ========== LEFT PANEL: Image + Grid ========== */}
      <div className="flex-shrink-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">
            Image {currentIndex + 1} of {imageList.length}
          </h2>
          <div className="flex items-center gap-2">
            <div className="px-3 py-1 bg-green-600 rounded-full text-sm font-bold">
              👤 {artistId}
            </div>
            <button
              onClick={() => {
                localStorage.removeItem(STORAGE_KEYS.ARTIST_ID);
                setShowArtistModal(true);
              }}
              className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-xs rounded transition"
              title="Switch artist"
            >
              ⊕ Change
            </button>
          </div>
        </div>

        {/* Canvas with grid */}
        <ImageCanvas
          imageUrl={API_ENDPOINTS.GET_IMAGE(imageList[currentIndex])}
          selectedCells={selectedCells}
          hoveredCell={hoveredCell}
          onCellClick={handleCellClick}
          onCellHover={setHoveredCell}
          onCellLeave={() => setHoveredCell(null)}
          isDisabled={isAlreadyAnnotated}
        />

        {/* Show status if already annotated */}
        {isAlreadyAnnotated && (
          <div className="mt-4 p-4 bg-green-900 border border-green-700 rounded-lg">
            <p className="text-green-300 font-bold">✅ Already Annotated</p>
            <p className="text-green-200 text-sm">
              You have already labeled this image. Navigate to the next image to continue.
            </p>
          </div>
        )}

        {/* Controls */}
        <ControlPanel
          currentIndex={currentIndex}
          totalImages={imageList.length}
          selectedCount={selectedCells.size}
          onPrev={handlePrev}
          onNext={handleNext}
          onClear={handleReset}
          onSubmit={handleSubmit}
          isDisabled={isAlreadyAnnotated}
        />
      </div>

      {/* ========== RIGHT PANEL: Results ========== */}
      <div className="flex-1 bg-gray-900 p-6 rounded-xl overflow-auto border border-white/10 max-h-screen">
        <h3 className="text-blue-400 mb-4 text-lg font-bold">Art Analysis Results</h3>
        <ResultsPanel resultJson={resultJson} />
      </div>
    </div>
  );
}
