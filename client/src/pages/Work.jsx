import React, { useState, useRef } from "react";
import Topbar from "../components/TopBar";
import Toolbar from "../components/ToolBar";
import CanvasBoard from "../components/CanvasBoard";
import LayerRail from "../components/LayerRail";

export default function Work({ activeTab = "Train", onTabChange = () => {} }) {
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [hasSuggestion] = useState(true);
  const [showSuggestion, setShowSuggestion] = useState(false);

  const [layers, setLayers] = useState([
    { id: "layer-1", name: "Layer 1", visible: true },
  ]);

  const [tool, setTool] = useState("Brush");
  const [brushSize, setBrushSize] = useState(6);
  const [color, setColor] = useState("#E4572E");
  const [activeLayerId, setActiveLayerId] = useState("layer-1");

  const canvasBoardRef = useRef(null);

  const addLayer = () => {
    setLayers((prev) => {
      const nextIndex = prev.length + 1;
      const id = `layer-${nextIndex}`;
      setActiveLayerId(id);
      return [...prev, { id, name: `Layer ${nextIndex}`, visible: true }];
    });
  };

  const selectLayer = (id) => setActiveLayerId(id);

  const toggleVisibility = (id) =>
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));

  return (
    <div className="page">
      <Topbar active={activeTab} onChange={onTabChange} />

      <div className="page-body container flex-1 flex gap-6 items-stretch">
        <section className="panel flex-1 min-w-0 flex flex-col">
          <header className="panel-head">
            <h2>Training Canvas</h2>
          </header>

          <Toolbar
            autoAnalyze={autoAnalyze}
            setAutoAnalyze={setAutoAnalyze}
            hasSuggestion={hasSuggestion}
            showSuggestion={showSuggestion}
            setShowSuggestion={setShowSuggestion}
            tool={tool}
            setTool={setTool}
            brushSize={brushSize}
            setBrushSize={setBrushSize}
            color={color}
            setColor={setColor}
          />

          <div className="flex-1 min-h-0 relative mt-4 flex">
            <CanvasBoard
              ref={canvasBoardRef}
              layers={layers}
              activeLayerId={activeLayerId}
              tool={tool}
              brushSize={brushSize}
              color={color}
              showSuggestion={showSuggestion}
            />
          </div>
        </section>

        <LayerRail
          layers={layers}
          activeLayerId={activeLayerId}
          selectLayer={selectLayer}
          addLayer={addLayer}
          toggleVisibility={toggleVisibility}
        />
      </div>
    </div>
  );
}
