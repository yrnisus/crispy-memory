// frontend/src/SimpleApp.tsx - A minimal working version
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

function SimpleApp() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Initializing...');
  const [vertices, setVertices] = useState(0);
  const [regions, setRegions] = useState<any[]>([]);

  useEffect(() => {
    if (!mountRef.current) return;

    // Basic Three.js setup
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x333333);

    // Camera
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 5;

    // Renderer
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(width, height);
    mountRef.current.appendChild(renderer.domElement);

    // Add a simple cube to verify Three.js works
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    // Add lighting
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(1, 1, 1);
    scene.add(light);

    // Animation
    const animate = () => {
      requestAnimationFrame(animate);
      cube.rotation.x += 0.01;
      cube.rotation.y += 0.01;
      renderer.render(scene, camera);
    };
    animate();

    setStatus('Three.js initialized - Green cube should be visible');

    // Cleanup
    return () => {
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // STL Parser
  const parseSTL = async (file: File): Promise<Float32Array> => {
    const arrayBuffer = await file.arrayBuffer();
    const view = new DataView(arrayBuffer);
    
    // Binary STL
    const triangleCount = view.getUint32(80, true);
    const vertices = new Float32Array(triangleCount * 9);
    
    let offset = 84;
    let vertexIndex = 0;
    
    for (let i = 0; i < triangleCount; i++) {
      // Skip normal (12 bytes)
      offset += 12;
      
      // Read 3 vertices
      for (let j = 0; j < 3; j++) {
        vertices[vertexIndex] = view.getFloat32(offset, true);
        vertices[vertexIndex + 1] = view.getFloat32(offset + 4, true);
        vertices[vertexIndex + 2] = view.getFloat32(offset + 8, true);
        offset += 12;
        vertexIndex += 3;
      }
      offset += 2; // Skip attribute byte count
    }
    
    return vertices;
  };

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus('Loading STL...');
    
    try {
      const vertices = await parseSTL(file);
      setVertices(vertices.length / 3);
      
      // Send to backend
      const uniqueVerts = new Set<string>();
      const vertArray: number[][] = [];  // Fix: Add type annotation
      
      for (let i = 0; i < vertices.length; i += 3) {
        const key = `${vertices[i].toFixed(4)},${vertices[i+1].toFixed(4)},${vertices[i+2].toFixed(4)}`;
        if (!uniqueVerts.has(key)) {
          uniqueVerts.add(key);
          vertArray.push([vertices[i], vertices[i+1], vertices[i+2]]);
        }
      }
      
      setStatus(`Sending ${vertArray.length} vertices to backend...`);
      
      const response = await fetch('http://localhost:5000/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vertices: vertArray })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setRegions(data.regions);
        setStatus(`Success! ${data.regions.length} regions found`);
        
        // Now create the 3D model
        if (mountRef.current) {
          // Clear and recreate scene
          mountRef.current.innerHTML = '';
          
          const width = mountRef.current.clientWidth;
          const height = mountRef.current.clientHeight;
          
          const scene = new THREE.Scene();
          scene.background = new THREE.Color(0x333333);
          
          const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
          camera.position.set(0, 0, 10);
          
          const renderer = new THREE.WebGLRenderer();
          renderer.setSize(width, height);
          mountRef.current.appendChild(renderer.domElement);
          
          // Create geometry from vertices
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
          geometry.computeVertexNormals();
          geometry.center();
          
          // Scale to fit
          geometry.computeBoundingBox();
          const bbox = geometry.boundingBox!;
          const size = bbox.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 5 / maxDim;
          geometry.scale(scale, scale, scale);
          
          // Apply colors based on ACTUAL region data from backend
          const colors = new Float32Array(vertices.length);
          
          // Default color (gray)
          const defaultColor = new THREE.Color(0x808080);
          for (let i = 0; i < vertices.length / 3; i++) {
            colors[i * 3] = defaultColor.r;
            colors[i * 3 + 1] = defaultColor.g;
            colors[i * 3 + 2] = defaultColor.b;
          }
          
          // Region colors from backend
          const regionColorMap: {[key: string]: THREE.Color} = {
            'base': new THREE.Color(0x8B4513),  // Brown
            'legs': new THREE.Color(0x4682B4),  // Steel blue
            'torso': new THREE.Color(0xC0C0C0), // Silver
            'arms': new THREE.Color(0xCD853F),  // Peru/tan
            'head': new THREE.Color(0xF5DEB3),  // Wheat
          };
          
          // Create mapping from unique vertices back to full vertex array
          const uniqueToFull = new Map<string, number[]>();
          for (let i = 0; i < vertices.length; i += 3) {
            const key = `${vertices[i].toFixed(4)},${vertices[i+1].toFixed(4)},${vertices[i+2].toFixed(4)}`;
            const vertexIndex = Math.floor(i / 3);
            if (!uniqueToFull.has(key)) {
              uniqueToFull.set(key, []);
            }
            uniqueToFull.get(key)!.push(vertexIndex);
          }
          
          // Apply colors from region data
          data.regions.forEach((region: any) => {
            const color = regionColorMap[region.id] || new THREE.Color(Math.random() * 0xffffff);
            
            // For each vertex index in this region
            region.vertex_indices.forEach((backendIdx: number) => {
              // Get the corresponding unique vertex
              if (backendIdx < vertArray.length) {
                const vert = vertArray[backendIdx];
                const key = `${vert[0].toFixed(4)},${vert[1].toFixed(4)},${vert[2].toFixed(4)}`;
                
                // Find all occurrences of this vertex in the full array
                const fullIndices = uniqueToFull.get(key);
                if (fullIndices) {
                  fullIndices.forEach(idx => {
                    colors[idx * 3] = color.r;
                    colors[idx * 3 + 1] = color.g;
                    colors[idx * 3 + 2] = color.b;
                  });
                }
              }
            });
          });
          
          console.log('Applied colors to regions:', data.regions.map((r: any) => 
            `${r.id}: ${r.vertex_count} vertices`
          ));
          
          geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
          
          // Create mesh with better material for vertex colors
          const material = new THREE.MeshPhongMaterial({ 
            vertexColors: true,
            side: THREE.DoubleSide,
            shininess: 30,
            specular: 0x222222
          });
          const mesh = new THREE.Mesh(geometry, material);
          scene.add(mesh);
          
          // Add wireframe to see the mesh structure
          const wireframe = new THREE.WireframeGeometry(geometry);
          const lineMaterial = new THREE.LineBasicMaterial({ 
            color: 0x00ff00, 
            opacity: 0.1, 
            transparent: true 
          });
          const lines = new THREE.LineSegments(wireframe, lineMaterial);
          scene.add(lines);
          
          // Add axes helper
          const axes = new THREE.AxesHelper(3);
          scene.add(axes);
          
          // Better lighting for vertex colors
          const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
          directionalLight.position.set(5, 10, 5);
          scene.add(directionalLight);
          
          const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
          directionalLight2.position.set(-5, -10, -5);
          scene.add(directionalLight2);
          
          const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
          scene.add(ambientLight);
          
          // Mouse controls
          let mouseDown = false;
          let mouseX = 0;
          let mouseY = 0;
          
          renderer.domElement.addEventListener('mousedown', (e) => {
            mouseDown = true;
            mouseX = e.clientX;
            mouseY = e.clientY;
          });
          
          renderer.domElement.addEventListener('mouseup', () => {
            mouseDown = false;
          });
          
          renderer.domElement.addEventListener('mousemove', (e) => {
            if (!mouseDown) return;
            const deltaX = e.clientX - mouseX;
            const deltaY = e.clientY - mouseY;
            mesh.rotation.y += deltaX * 0.01;
            mesh.rotation.x += deltaY * 0.01;
            mouseX = e.clientX;
            mouseY = e.clientY;
          });
          
          // Animation loop
          const animate = () => {
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
          };
          animate();
        }
      } else {
        setStatus('Backend error: ' + data.error);
      }
    } catch (error) {
      setStatus('Error: ' + error);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#222', color: 'white' }}>
      {/* 3D View */}
      <div style={{ flex: 1, position: 'relative' }}>
        <div 
          ref={mountRef} 
          style={{ width: '100%', height: '100%', background: '#333' }}
        />
        
        {/* Status */}
        <div style={{ 
          position: 'absolute', 
          top: 10, 
          left: 10, 
          background: 'rgba(0,0,0,0.8)', 
          padding: '10px',
          borderRadius: '5px'
        }}>
          <div>{status}</div>
          {vertices > 0 && <div>Vertices: {vertices}</div>}
        </div>
      </div>
      
      {/* Controls */}
      <div style={{ width: '300px', background: '#111', padding: '20px' }}>
        <h2>Simple 3D Painter</h2>
        
        <div style={{ marginBottom: '20px' }}>
          <input 
            type="file" 
            accept=".stl" 
            onChange={handleFileUpload}
            style={{ marginBottom: '10px' }}
          />
        </div>
        
        {regions.length > 0 && (
          <div>
            <h3>Regions ({regions.length})</h3>
            {regions.map((region, i) => (
              <div key={i} style={{ 
                padding: '5px', 
                margin: '5px 0', 
                background: '#333',
                borderRadius: '3px'
              }}>
                {region.name}: {region.vertex_count} vertices
              </div>
            ))}
          </div>
        )}
        
        <div style={{ marginTop: '20px', fontSize: '12px', color: '#888' }}>
          <p>Instructions:</p>
          <ul>
            <li>You should see a green rotating cube</li>
            <li>Upload an STL file</li>
            <li>Drag to rotate the model</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default SimpleApp;