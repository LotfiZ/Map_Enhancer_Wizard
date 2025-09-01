import React, { useRef, useEffect, useState } from 'react';
import { MapData, FilterSettings } from '@/types/map';
import { ImageProcessor } from '@/lib/imageProcessor';

interface MapCanvasProps {
  mapData: MapData;
  filters: FilterSettings;
  onProcessedImageChange: (imageData: ImageData) => void;
}

export function MapCanvas({ mapData, filters, onProcessedImageChange }: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [comparePos, setComparePos] = useState(0.5); // 0..1

  useEffect(() => {
    if (!mapData.originalImage || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Process the image with current filters
    const processedImage = ImageProcessor.processImage(mapData.originalImage, filters);
    onProcessedImageChange(processedImage);

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply zoom and pan transforms
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Prepare original and processed canvases
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = processedImage.width;
    tempCanvas.height = processedImage.height;
    const tempCtx = tempCanvas.getContext('2d');
    const origCanvas = document.createElement('canvas');
    origCanvas.width = mapData.originalImage.width;
    origCanvas.height = mapData.originalImage.height;
    const origCtx = origCanvas.getContext('2d');

    if (tempCtx && origCtx) {
      tempCtx.putImageData(processedImage, 0, 0);
      origCtx.putImageData(mapData.originalImage, 0, 0);

      // Center the image
      const x = (canvas.width / zoom - processedImage.width) / 2;
      const y = (canvas.height / zoom - processedImage.height) / 2;

      if (!compareEnabled) {
        ctx.drawImage(tempCanvas, x, y);
      } else {
        // Draw processed first
        ctx.drawImage(tempCanvas, x, y);
        // Clip to left region and overlay original
        const splitX = x + processedImage.width * comparePos;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, processedImage.width * comparePos, processedImage.height);
        ctx.clip();
        ctx.drawImage(origCanvas, x, y);
        ctx.restore();

        // Draw split line
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2 / zoom; // keep constant thickness under zoom
        ctx.beginPath();
        ctx.moveTo(splitX, y);
        ctx.lineTo(splitX, y + processedImage.height);
        ctx.stroke();
      }
    }

    ctx.restore();
  }, [mapData.originalImage, filters, zoom, pan, compareEnabled, comparePos, onProcessedImageChange]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      const deltaX = e.clientX - lastMousePos.x;
      const deltaY = e.clientY - lastMousePos.y;
      
      setPan(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }));
      
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.max(0.1, Math.min(5, prev * zoomFactor)));
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  if (!mapData.originalImage) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg">
        <div className="text-center text-gray-500">
          <div className="text-xl mb-2">📁</div>
          <p>Load a map to begin</p>
          <p className="text-sm">Upload PGM + YAML files</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-2 bg-gray-50 border-b">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium">Map: {mapData.fileName}</span>
          <span className="text-xs text-gray-500">
            {mapData.originalImage.width} × {mapData.originalImage.height}
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500">Zoom: {Math.round(zoom * 100)}%</span>
          <button
            onClick={resetView}
            className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Reset View
          </button>
          <div className="flex items-center space-x-1 ml-2">
            <label className="text-xs text-gray-600">Compare</label>
            <input
              type="checkbox"
              checked={compareEnabled}
              onChange={(e) => setCompareEnabled(e.target.checked)}
            />
          </div>
          {compareEnabled && (
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={comparePos}
              onChange={(e) => setComparePos(Number(e.target.value))}
              className="w-32"
            />
          )}
        </div>
      </div>
      
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        className="flex-1 cursor-move"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          setIsDragging(false);
        }}
      />
    </div>
  );
}
