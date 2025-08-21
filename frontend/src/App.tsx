// src/App.tsx - Replace the default App.tsx with this
import React, { useState, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Upload, Palette, Eye, EyeOff, Download, RotateCcw, Brush, AlertCircle, CheckCircle } from 'lucide-react';
import './App.css';

interface ModelData {
  name: string;
  size: number;
  geometry?: THREE.BufferGeometry;
  vertexCount?: number;
}

interface PaintRegion {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  vertex_indices: number[];
  vertex_count: number;
  vertex_percentage?: number;
}

interface BackendResponse {
  success: boolean;
  regions: PaintRegion[];
  mesh_info?: {
    vertices: number;
    faces: number;
    volume: number;
  };
  error?: string;
}

const PAINT_COLORS = [
  '#8B4513', // Brown
  '#C0C0C0', // Silver
  '#FFD700', // Gold
  '#4682B4', // Steel blue
  '#8B0000', // Dark red
  '#228B22', // Forest green
  '#4B0082', // Indigo
  '#FF6347', // Tomato
  '#2F4F4F', // Dark slate
  '#F0E68C', // Khaki
  '#800080', // Purple
  '#000000', // Black
];

function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [modelData, setModelData] = useState<ModelData | null>(null);
  const [regions, setRegions] = useState<PaintRegion[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('#C0C0C0');
  const [paintedColors, setPaintedColors] = useState<{ [regionId: string]: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [error, setError] = useState<string>('');

  // Check backend status on mount
  useEffect(() => {
    checkBackendStatus();
  }, []);

  const checkBackendStatus = async () => {
    try {
      const response = await fetch('http://localhost:5000/health');
      if (response.ok) {
        setBackendStatus('online');
      } else {
        setBackendStatus('offline');
      }
    } catch (err) {
      setBackendStatus('offline');
      setError('Backend is not running. Please run: python backend.py');
    }
  };

  // Initialize Three.js scene
  useEffect(() => {
    if (!mountRef.current) return;
    
    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2a2a2a);
    sceneRef.current = scene;
    
    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;
    
    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x2a2a2a, 1);
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Lights - more comprehensive lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight1.position.set(5, 10, 5);
    scene.add(directionalLight1);
    
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight2.position.set(-5, 10, -5);
    scene.add(directionalLight2);
    
    // Add a point light for better visibility
    const pointLight = new THREE.PointLight(0xffffff, 0.5);
    pointLight.position.set(0, 10, 0);
    scene.add(pointLight);
    
    // Remove test cube - no longer needed
    
    // Controls
    let targetRotationX = 0;
    let targetRotationY = 0;
    
    const handleMouseMove = (event: MouseEvent) => {
      if (event.buttons === 1) {
        const deltaX = event.movementX;
        const deltaY = event.movementY;
        targetRotationY += deltaX * 0.01;
        targetRotationX += deltaY * 0.01;
      }
    };
    
    const handleWheel = (event: WheelEvent) => {
      camera.position.z += event.deltaY * 0.01;
      camera.position.z = Math.max(2, Math.min(20, camera.position.z));
    };
    
    renderer.domElement.addEventListener('mousemove', handleMouseMove);
    renderer.domElement.addEventListener('wheel', handleWheel);
    
    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      if (meshRef.current) {
        meshRef.current.rotation.x += (targetRotationX - meshRef.current.rotation.x) * 0.1;
        meshRef.current.rotation.y += (targetRotationY - meshRef.current.rotation.y) * 0.1;
      }
      
      renderer.render(scene, camera);
    };
    animate();
    
    // Handle resize
    const handleResize = () => {
      if (!mountRef.current) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('mousemove', handleMouseMove);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      mountRef.current?.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  // Parse STL file
  const parseSTL = async (file: File): Promise<THREE.BufferGeometry> => {
    const arrayBuffer = await file.arrayBuffer();
    const view = new DataView(arrayBuffer);
    
    // Check if ASCII or binary
    const header = new Uint8Array(arrayBuffer, 0, 5);
    let headerString = '';
    for (let i = 0; i < 5; i++) {
      headerString += String.fromCharCode(header[i]);
    }
    
    if (headerString === 'solid') {
      throw new Error('ASCII STL not supported yet. Please use binary STL.');
    }
    
    // Binary STL
    const triangleCount = view.getUint32(80, true);
    const vertices = new Float32Array(triangleCount * 9);
    const normals = new Float32Array(triangleCount * 9);
    
    let offset = 84;
    let vertexIndex = 0;
    
    for (let i = 0; i < triangleCount; i++) {
      // Normal
      const nx = view.getFloat32(offset, true);
      const ny = view.getFloat32(offset + 4, true);
      const nz = view.getFloat32(offset + 8, true);
      offset += 12;
      
      // Vertices
      for (let j = 0; j < 3; j++) {
        vertices[vertexIndex] = view.getFloat32(offset, true);
        vertices[vertexIndex + 1] = view.getFloat32(offset + 4, true);
        vertices[vertexIndex + 2] = view.getFloat32(offset + 8, true);
        
        normals[vertexIndex] = nx;
        normals[vertexIndex + 1] = ny;
        normals[vertexIndex + 2] = nz;
        
        offset += 12;
        vertexIndex += 3;
      }
      offset += 2; // Skip attribute byte count
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    
    return geometry;
  };

  // Send vertices to backend for segmentation
  const segmentWithBackend = async (geometry: THREE.BufferGeometry): Promise<PaintRegion[]> => {
    const positions = geometry.attributes.position;
    const vertices = [];
    
    // Extract unique vertices (STL has duplicates)
    const uniqueVertices = new Map<string, number>();
    const vertexArray = [];
    
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
      
      if (!uniqueVertices.has(key)) {
        uniqueVertices.set(key, vertexArray.length);
        vertexArray.push([x, y, z]);
      }
    }
    
    console.log(`Sending ${vertexArray.length} unique vertices to backend...`);
    
    const response = await fetch('http://localhost:5000/segment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vertices: vertexArray
      })
    });
    
    if (!response.ok) {
      throw new Error(`Backend error: ${response.statusText}`);
    }
    
    const data: BackendResponse = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Segmentation failed');
    }
    
    // Map backend vertex indices to geometry indices
    const backendRegions = data.regions;
    const mappedRegions: PaintRegion[] = [];
    
    // Create reverse mapping from backend indices to geometry indices
    const reverseMapping = new Map<number, number[]>();
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
      const backendIndex = uniqueVertices.get(key);
      
      if (backendIndex !== undefined) {
        if (!reverseMapping.has(backendIndex)) {
          reverseMapping.set(backendIndex, []);
        }
        reverseMapping.get(backendIndex)!.push(i);
      }
    }
    
    // Convert backend regions to geometry indices
    for (const region of backendRegions) {
      const geometryIndices: number[] = [];
      
      for (const backendIdx of region.vertex_indices) {
        const geoIndices = reverseMapping.get(backendIdx);
        if (geoIndices) {
          geometryIndices.push(...geoIndices);
        }
      }
      
      mappedRegions.push({
        ...region,
        vertex_indices: geometryIndices,
        vertex_count: geometryIndices.length,
        vertex_percentage: (geometryIndices.length / positions.count) * 100
      });
    }
    
    return mappedRegions;
  };

  // Apply colors to geometry
  const applyColorsToGeometry = useCallback(() => {
    if (!modelData?.geometry || !meshRef.current) return;
    
    const geometry = modelData.geometry;
    const vertexCount = geometry.attributes.position.count;
    const colors = new Float32Array(vertexCount * 3);
    
    // Default gray
    const defaultColor = new THREE.Color(0x808080);
    for (let i = 0; i < vertexCount; i++) {
      colors[i * 3] = defaultColor.r;
      colors[i * 3 + 1] = defaultColor.g;
      colors[i * 3 + 2] = defaultColor.b;
    }
    
    // Apply region colors
    regions.forEach(region => {
      if (!region.visible) return;
      
      const colorHex = paintedColors[region.id] || region.color;
      const color = new THREE.Color(colorHex);
      
      region.vertex_indices.forEach(idx => {
        if (idx < vertexCount) {
          colors[idx * 3] = color.r;
          colors[idx * 3 + 1] = color.g;
          colors[idx * 3 + 2] = color.b;
        }
      });
    });
    
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.attributes.color.needsUpdate = true;
  }, [modelData, regions, paintedColors]);

  // Update colors when regions or painted colors change
  useEffect(() => {
    applyColorsToGeometry();
  }, [applyColorsToGeometry]);

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsLoading(true);
    setError('');
    
    try {
      // Parse STL
      console.log('Parsing STL file...');
      const geometry = await parseSTL(file);
      
      // Center and scale
      geometry.center();
      geometry.computeBoundingBox();
      const bbox = geometry.boundingBox!;
      const size = Math.max(
        bbox.max.x - bbox.min.x,
        bbox.max.y - bbox.min.y,
        bbox.max.z - bbox.min.z
      );
      
      // Try different scaling approach
      const targetSize = 5;
      const scale = targetSize / size;
      geometry.scale(scale, scale, scale);
      
      // Recompute and recenter after scaling
      geometry.computeBoundingBox();
      geometry.center();
      
      console.log('Geometry scaling:', {
        originalSize: size,
        scaleFactor: scale,
        targetSize: targetSize,
        newBounds: geometry.boundingBox
      });
      
      // Get segmentation from backend
      console.log('Getting segmentation from backend...');
      const backendRegions = await segmentWithBackend(geometry);
      
      // Make all regions visible by default
      const visibleRegions = backendRegions.map(r => ({ ...r, visible: true }));
      setRegions(visibleRegions);
      
      console.log(`Received ${visibleRegions.length} regions from backend`);
      
      // Apply initial colors to geometry BEFORE creating mesh
      const vertexCount = geometry.attributes.position.count;
      const colors = new Float32Array(vertexCount * 3);
      
      // Start with white/light gray
      const defaultColor = new THREE.Color(0xcccccc);
      for (let i = 0; i < vertexCount; i++) {
        colors[i * 3] = defaultColor.r;
        colors[i * 3 + 1] = defaultColor.g;
        colors[i * 3 + 2] = defaultColor.b;
      }
      
      // Apply region colors
      visibleRegions.forEach(region => {
        const color = new THREE.Color(region.color);
        region.vertex_indices.forEach(idx => {
          if (idx < vertexCount) {
            colors[idx * 3] = color.r;
            colors[idx * 3 + 1] = color.g;
            colors[idx * 3 + 2] = color.b;
          }
        });
      });
      
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      
      // Create mesh with basic material first to ensure visibility
      const material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        wireframe: false
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(0, 0, 0);
      
      // Also create a simple test cube to verify rendering
      const testGeometry = new THREE.BoxGeometry(2, 2, 2);
      const testMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff });
      const testCube = new THREE.Mesh(testGeometry, testMaterial);
      testCube.position.set(0, 0, 0);
      
      // Remove old mesh
      if (meshRef.current && sceneRef.current) {
        sceneRef.current.remove(meshRef.current);
        meshRef.current.geometry.dispose();
        (meshRef.current.material as THREE.Material).dispose();
      }
      
      // Add new mesh
      if (sceneRef.current) {
        // Clear the entire scene first
        while(sceneRef.current.children.length > 0) {
          const child = sceneRef.current.children[0];
          sceneRef.current.remove(child);
        }
        
        // Re-add lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
        sceneRef.current.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(5, 10, 5);
        sceneRef.current.add(directionalLight);
        
        // Add test cube first to verify rendering works
        sceneRef.current.add(testCube);
        console.log('Test cube added at origin');
        
        // Add the actual mesh
        sceneRef.current.add(mesh);
        meshRef.current = mesh;
        
        // Create axes helper to see coordinate system
        const axesHelper = new THREE.AxesHelper(5);
        sceneRef.current.add(axesHelper);
        console.log('Axes helper added');
        
        // Get the actual bounds
        const boundingBox = geometry.boundingBox!;
        const center = new THREE.Vector3();
        boundingBox.getCenter(center);
        const size = new THREE.Vector3();
        boundingBox.getSize(size);
        
        // Debug: Log everything
        console.log('Scene debug:', {
          sceneChildren: sceneRef.current.children.length,
          meshVertices: geometry.attributes.position.count,
          boundingBox: {
            min: boundingBox.min.toArray(),
            max: boundingBox.max.toArray(),
            center: center.toArray(),
            size: size.toArray()
          },
          meshWorldMatrix: mesh.matrixWorld.toArray()
        });
        
        // Simple camera setup
        if (cameraRef.current) {
          cameraRef.current.position.set(5, 5, 10);
          cameraRef.current.lookAt(0, 0, 0);
          cameraRef.current.updateProjectionMatrix();
          
          console.log('Camera setup:', {
            position: cameraRef.current.position.toArray(),
            target: [0, 0, 0],
            fov: cameraRef.current.fov,
            near: cameraRef.current.near,
            far: cameraRef.current.far
          });
        }
        
        // Force render multiple times
        if (rendererRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
          
          // Try rendering a few times with delay
          setTimeout(() => {
            if (rendererRef.current && cameraRef.current && sceneRef.current) {
              rendererRef.current.render(sceneRef.current, cameraRef.current);
              console.log('Delayed render complete');
            }
          }, 100);
        }
      }
      
      setModelData({
        name: file.name,
        size: file.size,
        geometry,
        vertexCount: geometry.attributes.position.count
      });
      
      // Select first region
      if (visibleRegions.length > 0) {
        setSelectedRegion(visibleRegions[0].id);
      }
      
      // Clear previous colors
      setPaintedColors({});
      
    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load model');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle color selection
  const handleColorSelect = (regionId: string, color: string) => {
    setPaintedColors(prev => ({
      ...prev,
      [regionId]: color
    }));
  };

  // Toggle region visibility
  const toggleRegionVisibility = (regionId: string) => {
    setRegions(prev => prev.map(r => 
      r.id === regionId ? { ...r, visible: !r.visible } : r
    ));
  };

  // Reset colors
  const resetColors = () => {
    setPaintedColors({});
  };

  // Export color scheme
  const exportColorScheme = () => {
    const scheme = {
      model: modelData?.name,
      timestamp: new Date().toISOString(),
      regions: regions.map(r => ({
        name: r.name,
        color: paintedColors[r.id] || r.color,
        vertices: r.vertex_count,
        percentage: r.vertex_percentage
      }))
    };
    
    const blob = new Blob([JSON.stringify(scheme, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${modelData?.name || 'miniature'}_colors.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-container">
      {/* 3D Viewer */}
      <div className="viewer-container">
        <div ref={mountRef} className="threejs-mount" />
        
        {/* Status indicator */}
        <div className="status-indicator">
          {backendStatus === 'online' ? (
            <div className="status-online">
              <CheckCircle size={16} />
              Backend Connected
            </div>
          ) : backendStatus === 'offline' ? (
            <div className="status-offline">
              <AlertCircle size={16} />
              Backend Offline - Run: python backend.py
            </div>
          ) : (
            <div className="status-checking">
              Checking backend...
            </div>
          )}
        </div>
        
        {/* Upload button overlay */}
        {!modelData && (
          <div className="upload-overlay">
            <label className="upload-button">
              <Upload size={20} />
              {isLoading ? 'Processing...' : 'Upload STL Model'}
              <input
                ref={fileInputRef}
                type="file"
                accept=".stl"
                onChange={handleFileUpload}
                disabled={isLoading || backendStatus !== 'online'}
                style={{ display: 'none' }}
              />
            </label>
            {error && (
              <div className="error-message">
                <AlertCircle size={16} />
                {error}
              </div>
            )}
          </div>
        )}
        
        {/* Model info */}
        {modelData && (
          <div className="model-info">
            <h3>{modelData.name}</h3>
            <p>Vertices: {modelData.vertexCount?.toLocaleString()}</p>
            <p>Regions: {regions.length}</p>
          </div>
        )}
      </div>
      
      {/* Control Panel */}
      {modelData && (
        <div className="control-panel">
          <h2>
            <Palette size={24} />
            Paint Regions
          </h2>
          
          {/* Region List */}
          <div className="region-list">
            {regions.map(region => (
              <div
                key={region.id}
                className={`region-item ${selectedRegion === region.id ? 'selected' : ''}`}
                onClick={() => setSelectedRegion(region.id)}
              >
                <div className="region-header">
                  <div className="region-info">
                    <div
                      className="color-swatch"
                      style={{ backgroundColor: paintedColors[region.id] || region.color }}
                    />
                    <span className="region-name">{region.name}</span>
                  </div>
                  <button
                    className="visibility-toggle"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleRegionVisibility(region.id);
                    }}
                  >
                    {region.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                </div>
                <div className="region-stats">
                  {region.vertex_count} vertices ({region.vertex_percentage?.toFixed(1)}%)
                </div>
              </div>
            ))}
          </div>
          
          {/* Color Palette */}
          {selectedRegion && (
            <div className="color-palette">
              <h3>
                <Brush size={16} />
                Choose Color
              </h3>
              <div className="color-grid">
                {PAINT_COLORS.map(color => (
                  <button
                    key={color}
                    className={`color-button ${selectedColor === color ? 'selected' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      setSelectedColor(color);
                      handleColorSelect(selectedRegion, color);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          
          {/* Actions */}
          <div className="actions">
            <button onClick={resetColors} className="action-button">
              <RotateCcw size={16} />
              Reset Colors
            </button>
            
            <button onClick={exportColorScheme} className="action-button export">
              <Download size={16} />
              Export Scheme
            </button>
            
            <label className="action-button">
              <Upload size={16} />
              New Model
              <input
                type="file"
                accept=".stl"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </label>
          </div>
          
          {/* Instructions */}
          <div className="instructions">
            <h4>Controls:</h4>
            <ul>
              <li>Drag to rotate</li>
              <li>Scroll to zoom</li>
              <li>Click region to select</li>
              <li>Click color to paint</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;