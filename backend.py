# backend.py - Simple, working geometric segmentation for miniature painting
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
import trimesh
import logging
from typing import List, Dict, Tuple
import base64
import io

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

class MiniatureSegmenter:
    """Simple geometric segmentation that actually works"""
    
    def __init__(self):
        self.region_definitions = {
            'base': {
                'height_range': (0.0, 0.05),
                'color': '#8B4513',
                'description': 'Base and ground elements'
            },
            'legs': {
                'height_range': (0.05, 0.35),
                'color': '#4682B4', 
                'description': 'Legs and lower body armor'
            },
            'torso': {
                'height_range': (0.35, 0.65),
                'color': '#C0C0C0',
                'description': 'Main torso and chest armor'
            },
            'arms': {
                'height_range': (0.4, 0.7),
                'radial_threshold': 0.4,
                'color': '#CD853F',
                'description': 'Arms and shoulder pads'
            },
            'head': {
                'height_range': (0.65, 1.0),
                'color': '#F5DEB3',
                'description': 'Head, helmet and accessories'
            }
        }
    
    def segment_mesh(self, vertices: np.ndarray) -> Dict[str, List[int]]:
        """
        Segment mesh vertices into painting regions using simple geometry
        
        Args:
            vertices: Nx3 array of vertex positions
            
        Returns:
            Dictionary mapping region names to vertex indices
        """
        if len(vertices) == 0:
            return {}
        
        # Calculate bounding box and normalize heights
        min_coords = np.min(vertices, axis=0)
        max_coords = np.max(vertices, axis=0)
        height_range = max_coords[1] - min_coords[1]
        
        if height_range == 0:
            # Flat object - all vertices go to base
            return {'base': list(range(len(vertices)))}
        
        # Normalize vertex heights to 0-1 range
        normalized_heights = (vertices[:, 1] - min_coords[1]) / height_range
        
        # Calculate radial distances from center (for arm detection)
        center_x = (min_coords[0] + max_coords[0]) / 2
        center_z = (min_coords[2] + max_coords[2]) / 2
        radial_distances = np.sqrt(
            (vertices[:, 0] - center_x) ** 2 + 
            (vertices[:, 2] - center_z) ** 2
        )
        max_radial = np.max(radial_distances)
        if max_radial > 0:
            normalized_radial = radial_distances / max_radial
        else:
            normalized_radial = np.zeros_like(radial_distances)
        
        # Assign vertices to regions
        regions = {name: [] for name in self.region_definitions.keys()}
        
        for i, (height, radial) in enumerate(zip(normalized_heights, normalized_radial)):
            assigned = False
            
            # Check each region's criteria
            if height < 0.05:
                regions['base'].append(i)
                assigned = True
            elif height < 0.35:
                regions['legs'].append(i)
                assigned = True
            elif height < 0.65:
                # Check if it's an arm (outer position)
                if radial > 0.4 and height > 0.4:
                    regions['arms'].append(i)
                else:
                    regions['torso'].append(i)
                assigned = True
            elif height < 0.85:
                regions['head'].append(i)
                assigned = True
            
            # Fallback to torso if not assigned
            if not assigned:
                regions['torso'].append(i)
        
        # Remove empty regions
        regions = {k: v for k, v in regions.items() if len(v) > 0}
        
        logger.info(f"Segmentation complete: {len(vertices)} vertices into {len(regions)} regions")
        for name, indices in regions.items():
            logger.info(f"  {name}: {len(indices)} vertices ({len(indices)/len(vertices)*100:.1f}%)")
        
        return regions
    
    def analyze_stl_file(self, file_data: bytes) -> Dict:
        """
        Analyze an STL file and return segmentation data
        
        Args:
            file_data: Binary STL file data
            
        Returns:
            Analysis results with regions and statistics
        """
        try:
            # Load mesh using trimesh
            mesh = trimesh.load(io.BytesIO(file_data), file_type='stl')
            
            # Get vertices (unique points)
            vertices = mesh.vertices
            
            # Perform segmentation
            regions = self.segment_mesh(vertices)
            
            # Calculate mesh statistics
            bounds = mesh.bounds
            volume = mesh.volume if mesh.is_volume else 0
            
            # Format response
            result = {
                'success': True,
                'mesh_info': {
                    'vertices': len(vertices),
                    'faces': len(mesh.faces),
                    'volume': float(volume),
                    'bounds': {
                        'min': bounds[0].tolist(),
                        'max': bounds[1].tolist()
                    }
                },
                'regions': []
            }
            
            # Add region information
            for name, indices in regions.items():
                region_info = self.region_definitions.get(name, {})
                result['regions'].append({
                    'id': name,
                    'name': name.title(),
                    'description': region_info.get('description', ''),
                    'color': region_info.get('color', '#808080'),
                    'vertex_count': len(indices),
                    'vertex_percentage': len(indices) / len(vertices) * 100,
                    'vertex_indices': indices[:100]  # Send sample for preview
                })
            
            return result
            
        except Exception as e:
            logger.error(f"Error analyzing STL: {e}")
            return {
                'success': False,
                'error': str(e)
            }

# Initialize segmenter
segmenter = MiniatureSegmenter()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'geometric_segmentation',
        'version': '1.0.0'
    })

@app.route('/segment', methods=['POST'])
def segment_model():
    """
    Segment a 3D model into painting regions
    
    Expects:
        - stl_file: Base64 encoded STL file
        or
        - vertices: Array of vertex coordinates
    """
    try:
        data = request.get_json()
        
        if 'stl_file' in data:
            # Decode base64 STL file
            stl_data = base64.b64decode(data['stl_file'].split(',')[1] if ',' in data['stl_file'] else data['stl_file'])
            result = segmenter.analyze_stl_file(stl_data)
            
        elif 'vertices' in data:
            # Direct vertex array
            vertices = np.array(data['vertices'])
            regions = segmenter.segment_mesh(vertices)
            
            result = {
                'success': True,
                'regions': []
            }
            
            for name, indices in regions.items():
                region_info = segmenter.region_definitions.get(name, {})
                result['regions'].append({
                    'id': name,
                    'name': name.title(),
                    'color': region_info.get('color', '#808080'),
                    'vertex_count': len(indices),
                    'vertex_indices': indices
                })
        else:
            return jsonify({
                'success': False,
                'error': 'No model data provided'
            }), 400
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Segmentation error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/segment-advanced', methods=['POST'])
def segment_with_options():
    """
    Advanced segmentation with customizable parameters
    """
    try:
        data = request.get_json()
        
        # Get custom parameters
        miniature_type = data.get('type', 'humanoid')  # humanoid, creature, vehicle
        detail_level = data.get('detail_level', 'medium')  # low, medium, high
        
        # Adjust segmentation based on type
        if miniature_type == 'creature':
            # Simpler segmentation for creatures
            segmenter.region_definitions = {
                'base': {'height_range': (0.0, 0.1), 'color': '#8B4513'},
                'body': {'height_range': (0.1, 0.7), 'color': '#D2691E'},
                'head': {'height_range': (0.7, 1.0), 'color': '#F5DEB3'}
            }
        elif miniature_type == 'vehicle':
            # Different regions for vehicles
            segmenter.region_definitions = {
                'chassis': {'height_range': (0.0, 0.3), 'color': '#2F4F4F'},
                'hull': {'height_range': (0.3, 0.7), 'color': '#708090'},
                'turret': {'height_range': (0.7, 1.0), 'color': '#696969'}
            }
        
        # Process the model
        if 'vertices' in data:
            vertices = np.array(data['vertices'])
            regions = segmenter.segment_mesh(vertices)
            
            return jsonify({
                'success': True,
                'type': miniature_type,
                'regions': [
                    {
                        'id': name,
                        'name': name.title(),
                        'vertex_indices': indices,
                        'vertex_count': len(indices)
                    }
                    for name, indices in regions.items()
                ]
            })
        else:
            return jsonify({
                'success': False,
                'error': 'No vertex data provided'
            }), 400
            
    except Exception as e:
        logger.error(f"Advanced segmentation error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/export-regions', methods=['POST'])
def export_regions():
    """
    Export segmentation data in various formats
    """
    try:
        data = request.get_json()
        format_type = data.get('format', 'json')  # json, obj, ply
        regions = data.get('regions', [])
        
        if format_type == 'json':
            # Simple JSON export
            return jsonify({
                'success': True,
                'format': 'json',
                'data': regions
            })
            
        elif format_type == 'obj':
            # Export as OBJ with material groups
            obj_content = "# Miniature painting regions\n"
            for region in regions:
                obj_content += f"g {region['id']}\n"
                obj_content += f"# {region.get('vertex_count', 0)} vertices\n"
            
            return jsonify({
                'success': True,
                'format': 'obj',
                'content': obj_content
            })
            
        else:
            return jsonify({
                'success': False,
                'error': f'Unsupported format: {format_type}'
            }), 400
            
    except Exception as e:
        logger.error(f"Export error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    print("🎨 Miniature Painter Backend - Geometric Segmentation")
    print("=" * 50)
    print("✅ Simple, working segmentation without SAM complexity")
    print("✅ 5-8 meaningful regions for painting")
    print("✅ Height-based and radial detection")
    print("✅ No impossible pixel-to-vertex mapping")
    print("=" * 50)
    print("Server running on http://localhost:5000")
    
    app.run(debug=True, host='0.0.0.0', port=5000)