import React, { useState, useCallback } from 'react';
import { MapData, FilterSettings, ProcessingState, MapMetadata } from '@/types/map';
import YAML from 'yaml';
import { MapCanvas } from '@/components/MapCanvas';
import { ControlPanel } from '@/components/ControlPanel';

export default function MapEnhancerApp() {
  const [mapData, setMapData] = useState<MapData>({
    originalImage: null,
    processedImage: null,
    metadata: null,
    fileName: ''
  });

  const [filters, setFilters] = useState<FilterSettings>({
    blur: 0,
    dilation: 0,
    erosion: 0,
    opening: 0,
    threshold: null
  });

  const [processingState, setProcessingState] = useState<ProcessingState>({
    isLoading: false,
    error: null,
    progress: 0
  });

  const [processedImage, setProcessedImage] = useState<ImageData | null>(null);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    setProcessingState({ isLoading: true, error: null, progress: 0 });

    try {
      let pgmFile: File | null = null;
      let yamlFile: File | null = null;

      // Find PGM and YAML files
      for (const file of Array.from(files)) {
        if (file.name.endsWith('.pgm')) {
          pgmFile = file;
        } else if (file.name.endsWith('.yaml') || file.name.endsWith('.yml')) {
          yamlFile = file;
        }
      }

      if (!pgmFile || !yamlFile) {
        throw new Error('Please select both PGM and YAML files');
      }

      // Parse YAML metadata (robust)
      const yamlText = await yamlFile.text();
      const metadata: MapMetadata = YAML.parse(yamlText);

      // Load PGM image with metadata awareness (negate, maxVal handling)
      const imageData = await loadPGMImage(pgmFile, metadata);

      setMapData({
        originalImage: imageData,
        processedImage: null,
        metadata,
        fileName: pgmFile.name.replace('.pgm', '')
      });

      setProcessingState({ isLoading: false, error: null, progress: 100 });
    } catch (error) {
      setProcessingState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load map',
        progress: 0
      });
    }
  }, []);

  const loadPGMImage = async (file: File, metadata?: MapMetadata): Promise<ImageData> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const uint8Array = new Uint8Array(arrayBuffer);
          const decoder = new TextDecoder();

          // Helper to read tokens skipping comments and whitespace
          const readHeaderTokens = (): { tokens: string[]; offset: number } => {
            let off = 0;
            const tokens: string[] = [];
            let lineStart = 0;
            while (tokens.length < 4 && off < uint8Array.length) {
              let lineEnd = off;
              while (lineEnd < uint8Array.length && uint8Array[lineEnd] !== 10 /*\n*/) {
                lineEnd++;
              }
              const line = decoder.decode(uint8Array.slice(off, lineEnd)).trim();
              if (!line.startsWith('#') && line.length > 0) {
                for (const t of line.split(/\s+/)) {
                  if (t.length) tokens.push(t);
                }
              }
              off = lineEnd + 1;
              lineStart = off;
            }
            return { tokens, offset: lineStart };
          };

          const { tokens, offset: afterHeaderOffsetStart } = readHeaderTokens();
          if (tokens.length < 4) throw new Error('Invalid PGM header');
          const magic = tokens[0];
          const width = Number(tokens[1]);
          const height = Number(tokens[2]);
          const maxVal = Number(tokens[3]);

          if (!['P2', 'P5'].includes(magic)) throw new Error('Unsupported PGM format');
          if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(maxVal)) {
            throw new Error('Invalid PGM metadata');
          }

          // For P5, data starts after a single whitespace following maxVal; our line-based
          // reader left us at the start of pixel data already (since each header item was on a line)
          let dataOffset = afterHeaderOffsetStart;
          const imageData = new ImageData(width, height);

          if (magic === 'P5') {
            const bytesPerSample = maxVal < 256 ? 1 : 2;
            const expectedLen = width * height * bytesPerSample;
            if (dataOffset + expectedLen > uint8Array.length) {
              // If our offset is slightly off due to header whitespace, try to find first non-whitespace
              while (dataOffset < uint8Array.length && (uint8Array[dataOffset] === 10 || uint8Array[dataOffset] === 13 || uint8Array[dataOffset] === 32 || uint8Array[dataOffset] === 9)) {
                dataOffset++;
              }
            }
            const pixels = uint8Array.subarray(dataOffset, dataOffset + expectedLen);
            let p = 0;
            for (let i = 0; i < width * height; i++) {
              let value: number;
              if (bytesPerSample === 1) {
                value = pixels[p];
                p += 1;
              } else {
                // Big endian per PGM spec
                value = (pixels[p] << 8) | pixels[p + 1];
                p += 2;
              }
              // Normalize to 0..255
              const norm = Math.round((value / maxVal) * 255);
              const v = metadata?.negate === 1 ? 255 - norm : norm;
              const idx = i * 4;
              imageData.data[idx] = v;
              imageData.data[idx + 1] = v;
              imageData.data[idx + 2] = v;
              imageData.data[idx + 3] = 255;
            }
          } else {
            // P2 ASCII: read remaining text, split by whitespace
            const text = decoder.decode(uint8Array.subarray(dataOffset));
            const values = text
              .split(/\s+/)
              .filter((t) => t.length && !t.startsWith('#'))
              .map((t) => Number(t));
            if (values.length < width * height) throw new Error('PGM pixel data too short');
            for (let i = 0; i < width * height; i++) {
              const norm = Math.round((values[i] / maxVal) * 255);
              const v = metadata?.negate === 1 ? 255 - norm : norm;
              const idx = i * 4;
              imageData.data[idx] = v;
              imageData.data[idx + 1] = v;
              imageData.data[idx + 2] = v;
              imageData.data[idx + 3] = 255;
            }
          }

          resolve(imageData);
        } catch (error) {
          reject(new Error('Failed to parse PGM file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  };

  const handleReset = () => {
    setFilters({
      blur: 0,
      dilation: 0,
      erosion: 0,
      opening: 0,
      threshold: null
    });
  };

  const handleSave = async () => {
    if (!processedImage || !mapData.metadata) {
      alert('No processed image to save');
      return;
    }

    try {
      // Create canvas and draw processed image
      const canvas = document.createElement('canvas');
      canvas.width = processedImage.width;
      canvas.height = processedImage.height;
      const ctx = canvas.getContext('2d')!;
      ctx.putImageData(processedImage, 0, 0);

      // Convert to blob and download
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${mapData.fileName}_enhanced.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
      }, 'image/png');

      // Also download updated YAML
      const updatedMetadata = {
        ...mapData.metadata,
        image: `${mapData.fileName}_enhanced.png`
      };

      const yamlContent = YAML.stringify(updatedMetadata);

      const yamlBlob = new Blob([yamlContent], { type: 'text/yaml' });
      const yamlUrl = URL.createObjectURL(yamlBlob);
      const yamlLink = document.createElement('a');
      yamlLink.href = yamlUrl;
      yamlLink.download = `${mapData.fileName}_enhanced.yaml`;
      document.body.appendChild(yamlLink);
      yamlLink.click();
      document.body.removeChild(yamlLink);
      URL.revokeObjectURL(yamlUrl);

    } catch (error) {
      alert('Failed to save files');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pgm,.yaml,.yml';
    
    // Create a new FileList-like object
    Object.defineProperty(input, 'files', {
      value: files,
      writable: false
    });
    
    handleFileUpload({ target: input } as any);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Map Enhancer Wizard
            </h1>
            <p className="text-sm text-gray-600">
              Modern web-based 2D occupancy grid map enhancement tool
            </p>
          </div>
          
          <div className="flex items-center space-x-4">
            <input
              type="file"
              multiple
              accept=".pgm,.yaml,.yml"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 cursor-pointer font-medium"
            >
              Select Map Files
            </label>
            
            {processingState.isLoading && (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span className="text-sm text-gray-600">Loading...</span>
              </div>
            )}
          </div>
        </div>
        
        {processingState.error && (
          <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
            {processingState.error}
          </div>
        )}
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <ControlPanel
          filters={filters}
          onFiltersChange={setFilters}
          onReset={handleReset}
          onSave={handleSave}
          isProcessing={processingState.isLoading}
        />
        
        <div
          className="flex-1 p-6"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <MapCanvas
            mapData={mapData}
            filters={filters}
            onProcessedImageChange={setProcessedImage}
          />
        </div>
      </div>

      {/* Status Bar */}
      <footer className="bg-white border-t border-gray-200 px-6 py-2">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div>
            {mapData.originalImage ? (
              <span>Map loaded: {mapData.fileName} ({mapData.originalImage.width}×{mapData.originalImage.height})</span>
            ) : (
              <span>Select a map folder to begin</span>
            )}
          </div>
          <div className="text-xs">
            Version 2.0 | Built with React & Next.js
          </div>
        </div>
      </footer>
    </div>
  );
}
