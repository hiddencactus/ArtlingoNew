/**
 * IMAGE CANVAS WITH GRID & CLICKABLE CELLS
 * 
 * - Draws image to canvas
 * - Overlays 16x16 grid lines (SVG)
 * - Renders 256 clickable cells on top
 * - Shows selected cells in red
 * - Shows hovered cells in blue
 */

import React, { useRef, useEffect } from "react";
import { GRID_CONFIG } from "../utils/constants";

export default function ImageCanvas({
  imageUrl,
  selectedCells,
  hoveredCell,
  onCellClick,
  onCellHover,
  onCellLeave,
  isDisabled,
}) {
  const canvasRef = useRef(null);
  const { SIZE, CELL_SIZE, IMAGE_SIZE, MAX_CLICKS } = GRID_CONFIG;

  // Load image onto canvas
  useEffect(() => {
    if (!canvasRef.current || !imageUrl) return;

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.src = imageUrl;

    img.onload = () => {
      console.log(`✅ Loaded image`);
      ctx.drawImage(img, 0, 0, IMAGE_SIZE, IMAGE_SIZE);
    };

    img.onerror = () => {
      console.error(`❌ Failed to load image`);
    };
  }, [imageUrl]);

  return (
    <div className="relative inline-block border-2 border-blue-500 rounded-lg overflow-hidden shadow-lg">
      {/* Canvas: Draws the image */}
      <canvas ref={canvasRef} width={IMAGE_SIZE} height={IMAGE_SIZE} className="block" />

      {/* SVG Grid Overlay: 16x16 lines */}
      <svg
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
        width={IMAGE_SIZE}
        height={IMAGE_SIZE}
        style={{ mixBlendMode: "overlay" }}
      >
        {/* Horizontal lines */}
        {Array.from({ length: SIZE + 1 }).map((_, i) => (
          <line
            key={`h${i}`}
            x1={0}
            y1={i * CELL_SIZE}
            x2={IMAGE_SIZE}
            y2={i * CELL_SIZE}
            stroke="rgba(100, 200, 255, 0.2)"
            strokeWidth={1}
          />
        ))}

        {/* Vertical lines */}
        {Array.from({ length: SIZE + 1 }).map((_, i) => (
          <line
            key={`v${i}`}
            x1={i * CELL_SIZE}
            y1={0}
            x2={i * CELL_SIZE}
            y2={IMAGE_SIZE}
            stroke="rgba(100, 200, 255, 0.2)"
            strokeWidth={1}
          />
        ))}
      </svg>

      {/* Interactive Grid Cells: 256 buttons (16x16) */}
      <div
        className="absolute top-0 left-0 w-full h-full grid"
        style={{
          gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
          gridTemplateRows: `repeat(${SIZE}, 1fr)`,
        }}
      >
        {Array.from({ length: SIZE * SIZE }).map((_, idx) => {
          const row = Math.floor(idx / SIZE);
          const col = idx % SIZE;
          const cellKey = `${row},${col}`;
          const isSelected = selectedCells.has(cellKey);
          const isHovered = hoveredCell === cellKey;
          const isFull = selectedCells.size >= MAX_CLICKS;

          return (
            <button
              key={cellKey}
              onClick={() => !isDisabled && onCellClick(row, col)}
              onMouseEnter={() => !isDisabled && onCellHover(cellKey)}
              onMouseLeave={onCellLeave}
              disabled={isDisabled || (!isSelected && isFull)}
              className={`
                w-full h-full transition-all border border-transparent
                ${isDisabled ? "cursor-not-allowed opacity-30" : "cursor-pointer"}
                ${isSelected ? "bg-red-500 border-red-300 shadow-lg" : ""}
                ${isHovered && !isSelected ? "bg-blue-400 bg-opacity-40 border-blue-300" : ""}
                ${isHovered && isSelected ? "bg-red-600 border-red-200" : ""}
                ${!isSelected && isFull && !isDisabled ? "cursor-not-allowed opacity-50" : ""}
                hover:shadow-md
              `}
              title={isDisabled ? "Already annotated - view only" : `Grid [${row},${col}]`}
            />
          );
        })}
      </div>
    </div>
  );
}
