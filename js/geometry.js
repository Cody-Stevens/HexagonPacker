/* ==============================================
   GEOMETRY UTILITIES
   
   Collision detection and geometric helpers
   ============================================== */

// Epsilon for floating-point comparisons (relative to INTERNAL_REF of 10000)
const EPSILON = 0.5;

/**
 * Check if a point is inside a polygon using ray casting algorithm
 * @param {Object} p - Point with {x, y}
 * @param {Array} polygon - Array of points defining the polygon
 * @returns {boolean}
 */
export function isPointInPolygon(p, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        const intersect = ((yi > p.y) !== (yj > p.y)) &&
            (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Check if all vertices of a hexagon are inside a parent polygon
 * Uses a small epsilon inset to avoid floating-point boundary issues
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} hexRadius - Hexagon radius (center to vertex)
 * @param {number} angleOffset - Rotation offset of hexagon
 * @param {Array} parentPolygon - Parent shape polygon
 * @param {number} epsilon - Safety margin inset (default: EPSILON)
 * @returns {boolean}
 */
export function isHexagonInsideShape(cx, cy, hexRadius, angleOffset, parentPolygon, epsilon = EPSILON) {
    // Use slightly larger radius for containment check to ensure margin
    const checkRadius = hexRadius + epsilon;
    
    for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3 + angleOffset;
        const vx = cx + Math.cos(angle) * checkRadius;
        const vy = cy + Math.sin(angle) * checkRadius;
        if (!isPointInPolygon({ x: vx, y: vy }, parentPolygon)) {
            return false;
        }
    }
    return true;
}

/**
 * Get bounding box of a polygon
 * @param {Array} polygon - Array of points
 * @returns {Object} { minX, minY, maxX, maxY, width, height }
 */
export function getBoundingBox(polygon) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (const p of polygon) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Find intersection point of two line segments
 * @param {Object} e1 - First edge { p1: {x,y}, p2: {x,y} }
 * @param {Object} e2 - Second edge { p1: {x,y}, p2: {x,y} }
 * @returns {Object} Intersection point {x, y}
 */
export function lineIntersection(e1, e2) {
    const x1 = e1.p1.x, y1 = e1.p1.y, x2 = e1.p2.x, y2 = e1.p2.y;
    const x3 = e2.p1.x, y3 = e2.p1.y, x4 = e2.p2.x, y4 = e2.p2.y;
    
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) {
        // Lines are parallel, use midpoint of the endpoints
        return { x: (e1.p2.x + e2.p1.x) / 2, y: (e1.p2.y + e2.p1.y) / 2 };
    }
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    return {
        x: x1 + t * (x2 - x1),
        y: y1 + t * (y2 - y1)
    };
}

/**
 * Generate hexagon vertex offsets for a given radius and angle offset
 * @param {number} radius - Hexagon radius
 * @param {number} angleOffset - Rotation offset
 * @returns {Array} Array of 6 vertex offsets
 */
export function getHexVertices(radius, angleOffset) {
    const vertices = [];
    for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3 + angleOffset;
        vertices.push({
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius
        });
    }
    return vertices;
}

/**
 * Calculate the signed area of a polygon (Shoelace formula)
 * Positive = counter-clockwise, Negative = clockwise
 * @param {Array} points - Array of points {x, y}
 * @returns {number} Signed area
 */
export function getSignedArea(points) {
    if (points.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    return area / 2;
}

/**
 * Ensure a polygon has counter-clockwise winding order
 * @param {Array} points - Array of points {x, y}
 * @returns {Array} Points in CCW order
 */
export function ensureCCW(points) {
    if (getSignedArea(points) < 0) {
        return [...points].reverse();
    }
    return points;
}

/**
 * Calculate distance squared between two points
 * @param {Object} p1 - Point {x, y}
 * @param {Object} p2 - Point {x, y}
 * @returns {number} Distance squared
 */
export function distSq(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return dx * dx + dy * dy;
}

// ==============================================
// AXIAL COORDINATE UTILITIES
// For neighbor-aware boundary walking
// ==============================================

/**
 * The 6 axial neighbor directions in CCW order starting from East
 * Used for boundary walking: checking neighbors and pivoting
 */
export const AXIAL_DIRS = [
    { dq: 1, dr: 0 },   // 0: East
    { dq: 0, dr: 1 },   // 1: Southeast  
    { dq: -1, dr: 1 },  // 2: Southwest
    { dq: -1, dr: 0 },  // 3: West
    { dq: 0, dr: -1 },  // 4: Northwest
    { dq: 1, dr: -1 }   // 5: Northeast
];

/**
 * Convert offset coordinates (col, row) to axial coordinates (q, r)
 * 
 * For flat-top hexagons (odd-q offset):
 *   q = col
 *   r = row - floor((col - (col & 1)) / 2)
 * 
 * For pointy-top hexagons (odd-r offset):
 *   q = col - floor((row - (row & 1)) / 2)
 *   r = row
 * 
 * @param {number} col - Grid column
 * @param {number} row - Grid row
 * @param {boolean} isFlat - True for flat-top, false for pointy-top
 * @param {boolean} useAltConversion - Use alternate conversion formula for testing
 * @returns {Object} { q, r } axial coordinates
 */
export function offsetToAxial(col, row, isFlat, useAltConversion = false) {
    if (isFlat) {
        // Flat-top: odd-q offset
        if (useAltConversion) {
            // Alternate: even-q offset
            const q = col;
            const r = row - Math.floor((col + (col & 1)) / 2);
            return { q, r };
        } else {
            const q = col;
            const r = row - Math.floor((col - (col & 1)) / 2);
            return { q, r };
        }
    } else {
        // Pointy-top: odd-r offset
        if (useAltConversion) {
            // Alternate: even-r offset
            const q = col - Math.floor((row + (row & 1)) / 2);
            const r = row;
            return { q, r };
        } else {
            const q = col - Math.floor((row - (row & 1)) / 2);
            const r = row;
            return { q, r };
        }
    }
}

/**
 * Convert axial coordinates (q, r) back to offset coordinates (col, row)
 * 
 * @param {number} q - Axial q coordinate
 * @param {number} r - Axial r coordinate
 * @param {boolean} isFlat - True for flat-top, false for pointy-top
 * @param {boolean} useAltConversion - Use alternate conversion formula for testing
 * @returns {Object} { col, row } offset coordinates
 */
export function axialToOffset(q, r, isFlat, useAltConversion = false) {
    if (isFlat) {
        // Flat-top: odd-q offset
        const col = q;
        if (useAltConversion) {
            const row = r + Math.floor((q + (q & 1)) / 2);
            return { col, row };
        } else {
            const row = r + Math.floor((q - (q & 1)) / 2);
            return { col, row };
        }
    } else {
        // Pointy-top: odd-r offset
        const row = r;
        if (useAltConversion) {
            const col = q + Math.floor((r + (r & 1)) / 2);
            return { col, row };
        } else {
            const col = q + Math.floor((r - (r & 1)) / 2);
            return { col, row };
        }
    }
}

/**
 * Create a key string for axial coordinates
 * @param {number} q 
 * @param {number} r 
 * @returns {string}
 */
export function axialKey(q, r) {
    return `${q},${r}`;
}
