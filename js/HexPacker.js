/* ==============================================
   HEX PACKER CLASS
   
   Main packing logic and rendering
   ============================================== */

import { SQRT3, INTERNAL_REF, VISUAL_BASE_SIZE } from './constants.js';
import { ShapeGenerators } from './shapes.js';
import { 
    isHexagonInsideShape, 
    getBoundingBox, 
    lineIntersection, 
    getHexVertices,
    getSignedArea,
    ensureCCW,
    distSq,
    AXIAL_DIRS,
    offsetToAxial,
    axialToOffset,
    axialKey
} from './geometry.js';

export class HexPacker {
    constructor(inputs, displays) {
        this.inputs = inputs;
        this.displays = displays;
        this.state = {};
        this.children = [];
        this.boundaryPath = [];
        this.parentShape = null;
        this.visualParentPoly = [];
        this.cellRadius = 0;
        this.childRadius = 0;
        this.axialCellMap = new Map(); // Map of axialKey -> child object
    }

    // ===========================================
    // STATE MANAGEMENT
    // ===========================================
    
    updateState() {
        this.state = {
            userInputParent: parseFloat(this.inputs.parentSize.value) || 300,
            userInputPadding: parseFloat(this.inputs.padding.value) || 0,
            parentRotation: (parseFloat(this.inputs.parentRotation.value) || 0) * Math.PI / 180,
            density: parseFloat(this.inputs.density.value) || 1,
            shapeName: this.inputs.parentShape.value,
            isChildFlat: this.inputs.childOrientation.checked,
            isConform: this.inputs.boundary.checked,
            unit: this.inputs.unit.value,
            // Origin offset in user units (converted to internal units during compute)
            originOffsetX: parseFloat(this.inputs.originOffsetX?.value) || 0,
            originOffsetY: parseFloat(this.inputs.originOffsetY?.value) || 0,
            // Debug toggle for testing alternate axial conversion
            useAltAxial: this.inputs.axialAltToggle?.checked || false
        };

        this.updateDisplays();
        this.compute();
    }

    updateDisplays() {
        const s = this.state;
        // Update editable value displays (set value if input, innerText if span)
        this.setDisplayValue(this.displays.density, s.density.toFixed(1));
        this.setDisplayValue(this.displays.padding, s.userInputPadding.toFixed(1));
        this.setDisplayValue(this.displays.parentRotation, Math.round(s.parentRotation * 180 / Math.PI).toString());
        this.displays.unitLabels.forEach(el => el.innerText = s.unit);
    }

    setDisplayValue(el, value) {
        if (!el) return;
        if (el.tagName === 'INPUT') {
            el.value = value;
        } else {
            el.innerText = value;
        }
    }

    setEmpty() {
        this.children = [];
        this.boundaryPath = [];
        this.displays.count.innerText = 0;
        this.displays.edge.innerText = "0.00";
        this.displays.width.innerText = "0.00";
    }

    // ===========================================
    // MAIN COMPUTATION
    // ===========================================
    
    compute() {
        const s = this.state;
        
        // Generate parent shape
        const generator = ShapeGenerators[s.shapeName];
        if (!generator) {
            this.setEmpty();
            return;
        }
        
        this.parentShape = generator(s.parentRotation);
        const parentPoly = this.parentShape.points;
        this.visualParentPoly = parentPoly;
        
        // Calculate padding in internal units
        const paddingRatio = s.userInputPadding / VISUAL_BASE_SIZE;
        const internalPadding = paddingRatio * INTERNAL_REF;

        // Get bounding box of parent shape
        const bbox = getBoundingBox(parentPoly);
        
        // Calculate child hex size based on density
        const nominalCellRadius = INTERNAL_REF / s.density;
        
        // Child angle offset
        const childAngleOffset = s.isChildFlat ? 0 : -Math.PI / 6;
        
        // Calculate lattice spacing
        const hexWidth = s.isChildFlat ? nominalCellRadius * 2 : nominalCellRadius * SQRT3;
        const hexHeight = s.isChildFlat ? nominalCellRadius * SQRT3 : nominalCellRadius * 2;
        const colSpacing = s.isChildFlat ? hexWidth * 0.75 : hexWidth;
        const rowSpacing = s.isChildFlat ? hexHeight : hexHeight * 0.75;
        
        // Scan grid to find all hexagons that fit
        const scanRangeX = Math.ceil((bbox.width / 2) / colSpacing) + 2;
        const scanRangeY = Math.ceil((bbox.height / 2) / rowSpacing) + 2;
        
        const cluster = [];
        
        // Convert origin offset from user units to internal units
        const offsetScale = INTERNAL_REF / s.userInputParent;
        const internalOffsetX = s.originOffsetX * offsetScale;
        const internalOffsetY = s.originOffsetY * offsetScale;
        
        for (let row = -scanRangeY; row <= scanRangeY; row++) {
            for (let col = -scanRangeX; col <= scanRangeX; col++) {
                const { cx, cy } = this.getGridPosition(col, row, colSpacing, rowSpacing, s.isChildFlat, internalOffsetX, internalOffsetY);
                
                if (isHexagonInsideShape(cx, cy, nominalCellRadius, childAngleOffset, parentPoly)) {
                    cluster.push({ col, row, x: cx, y: cy });
                }
            }
        }

        if (cluster.length === 0) {
            this.setEmpty();
            return;
        }

        // Store results
        this.cellRadius = nominalCellRadius;
        this.childRadius = Math.max(0, nominalCellRadius - (internalPadding / SQRT3));
        this.children = cluster;

        // Build axial coordinate lookup map for neighbor-aware boundary walking
        this.axialCellMap = new Map();
        for (const child of this.children) {
            const { q, r } = offsetToAxial(child.col, child.row, s.isChildFlat, s.useAltAxial);
            child.q = q;
            child.r = r;
            this.axialCellMap.set(axialKey(q, r), child);
        }

        // Calculate boundary if conform mode is on
        if (s.isConform && this.children.length > 0) {
            this.calculateWalkedBoundary(childAngleOffset);
        } else {
            this.boundaryPath = [];
        }

        // Update statistics
        this.updateStats();
    }

    getGridPosition(col, row, colSpacing, rowSpacing, isFlat, offsetX = 0, offsetY = 0) {
        let cx, cy;
        // Use symmetric stagger: ((n % 2) + 2) % 2 handles negative numbers correctly
        // This ensures col -1 and col +1 stagger in opposite directions for symmetry
        const colStagger = ((col % 2) + 2) % 2;
        const rowStagger = ((row % 2) + 2) % 2;
        
        if (isFlat) {
            // Flat-topped hex grid
            cx = col * colSpacing + offsetX;
            cy = row * rowSpacing + (colStagger ? rowSpacing / 2 : 0) + offsetY;
        } else {
            // Pointy-topped hex grid  
            cx = col * colSpacing + (rowStagger ? colSpacing / 2 : 0) + offsetX;
            cy = row * rowSpacing + offsetY;
        }
        return { cx, cy };
    }

    updateStats() {
        const s = this.state;
        const scalar = s.userInputParent / INTERNAL_REF;
        this.displays.count.innerText = this.children.length;
        this.displays.edge.innerText = (this.childRadius * scalar).toFixed(2) + ` ${s.unit}`;
        this.displays.width.innerText = (this.childRadius * scalar * (s.isChildFlat ? 2 : SQRT3)).toFixed(2) + ` ${s.unit}`;
    }

    // ===========================================
    // BOUNDARY CALCULATION (Neighbor-aware walker)
    // ===========================================
    
    /**
     * Robust boundary algorithm using neighbor-aware edge walking:
     * 1. Find connected clusters using BFS with axial neighbor lookup
     * 2. Walk each cluster's outer boundary using the proven CCW edge walker
     * 3. Merge multiple cluster boundaries with minimal straight bridges
     * 4. Offset inward by (cellRadius - childRadius) for padding
     * 5. Clean any self-intersections
     */
    calculateWalkedBoundary(angleOffset) {
        if (this.children.length === 0) {
            this.boundaryPath = [];
            return;
        }

        const PRECISION = 0.1;

        // Step 1: Find connected clusters
        const clusters = this.findConnectedClusters();
        
        if (clusters.length === 0) {
            this.boundaryPath = [];
            return;
        }

        // Step 2: Walk each cluster's boundary
        const clusterBoundaries = [];
        for (const cluster of clusters) {
            const boundary = this.walkClusterBoundary(cluster, angleOffset);
            if (boundary && boundary.length >= 3) {
                clusterBoundaries.push(boundary);
            }
        }

        if (clusterBoundaries.length === 0) {
            this.boundaryPath = [];
            return;
        }

        // Step 3: Merge multiple boundaries into one
        let mergedPath;
        if (clusterBoundaries.length === 1) {
            mergedPath = clusterBoundaries[0];
        } else {
            mergedPath = this.mergeClusterBoundaries(clusterBoundaries);
        }

        // Step 4: Offset path inward for padding
        const paddingOffset = this.cellRadius - this.childRadius;
        if (paddingOffset > 0) {
            mergedPath = this.offsetPathInward(mergedPath, paddingOffset);
        }

        // Step 5: Clean any self-intersections and duplicates
        mergedPath = this.cleanPath(mergedPath, PRECISION);
        
        this.boundaryPath = ensureCCW(mergedPath);
    }

    /**
     * Find connected clusters of hexagons using BFS with axial neighbors
     * Returns array of clusters, each cluster is array of child objects
     */
    findConnectedClusters() {
        const visited = new Set();
        const clusters = [];

        for (const child of this.children) {
            const key = axialKey(child.q, child.r);
            if (visited.has(key)) continue;

            // BFS to find all connected cells
            const cluster = [];
            const queue = [child];
            visited.add(key);

            while (queue.length > 0) {
                const current = queue.shift();
                cluster.push(current);

                // Check all 6 neighbors
                for (const dir of AXIAL_DIRS) {
                    const nq = current.q + dir.dq;
                    const nr = current.r + dir.dr;
                    const nkey = axialKey(nq, nr);
                    
                    if (!visited.has(nkey) && this.axialCellMap.has(nkey)) {
                        visited.add(nkey);
                        queue.push(this.axialCellMap.get(nkey));
                    }
                }
            }

            clusters.push(cluster);
        }

        return clusters;
    }

    /**
     * Walk the outer boundary of a cluster using neighbor-aware edge walking
     * This is the proven algorithm that works for hex grids:
     * - Start from topmost-leftmost hex with an exposed edge
     * - Walk CCW around the perimeter by checking neighbors
     * - If no neighbor in current direction: emit edge, pivot CW (convex turn)
     * - If neighbor exists: move to neighbor, pivot CCW (concave turn)
     * 
     * @param {Array} cluster - Array of child objects in this cluster
     * @param {number} angleOffset - Hex rotation angle offset
     * @returns {Array} Array of {x, y} points forming the boundary at cellRadius
     */
    walkClusterBoundary(cluster, angleOffset) {
        if (cluster.length === 0) return [];
        
        // Build a local set of axial keys for this cluster
        const clusterSet = new Set(cluster.map(c => axialKey(c.q, c.r)));
        
        // Helper to check if a neighbor exists in this cluster
        const hasNeighbor = (q, r, dirIndex) => {
            const dir = AXIAL_DIRS[dirIndex];
            return clusterSet.has(axialKey(q + dir.dq, r + dir.dr));
        };

        // Find starting hex: topmost (min y), then leftmost (min x)
        // This ensures we start on the outer boundary
        let startHex = cluster[0];
        for (const hex of cluster) {
            if (hex.y < startHex.y || (hex.y === startHex.y && hex.x < startHex.x)) {
                startHex = hex;
            }
        }

        // Find starting direction: first direction with NO neighbor (exposed edge)
        // For topmost hex, direction 4 (NW) or 5 (NE) is likely exposed
        // We scan to find the first exposed edge starting from direction 0
        let startDir = -1;
        for (let d = 0; d < 6; d++) {
            if (!hasNeighbor(startHex.q, startHex.r, d)) {
                startDir = d;
                break;
            }
        }

        // If no exposed edge found (shouldn't happen for boundary hex), fallback
        if (startDir === -1) {
            return this.fallbackBoundary(cluster, angleOffset);
        }

        // Get hex vertices at cellRadius for this hex orientation
        const hexVerts = getHexVertices(this.cellRadius, angleOffset);
        
        // Walk the boundary
        const boundaryPoints = [];
        let currentHex = startHex;
        let currentDir = startDir;
        let iterations = 0;
        const maxIterations = cluster.length * 6 + 10;

        do {
            iterations++;
            if (iterations > maxIterations) {
                console.warn('Boundary walk exceeded max iterations');
                break;
            }

            // Check if neighbor exists in current direction
            if (hasNeighbor(currentHex.q, currentHex.r, currentDir)) {
                // Neighbor exists: move to that neighbor (concave turn)
                const dir = AXIAL_DIRS[currentDir];
                const neighborKey = axialKey(currentHex.q + dir.dq, currentHex.r + dir.dr);
                currentHex = this.axialCellMap.get(neighborKey);
                
                // Pivot CCW (back 2 directions, i.e. +4 mod 6) to look for next edge
                currentDir = (currentDir + 4) % 6;
            } else {
                // No neighbor: emit this edge's starting vertex
                // The edge for direction d goes from vertex d to vertex (d+1)%6
                // We emit vertex d (the starting point of the edge in CCW order)
                const v = hexVerts[currentDir];
                boundaryPoints.push({
                    x: currentHex.x + v.x,
                    y: currentHex.y + v.y
                });
                
                // Pivot CW to next direction (convex turn)
                currentDir = (currentDir + 1) % 6;
            }

            // Check if we've returned to start
        } while (!(currentHex === startHex && currentDir === startDir));

        // Ensure CCW winding
        return ensureCCW(boundaryPoints);
    }

    /**
     * Fallback boundary calculation using edge-counting method
     * Used when the walker fails (e.g., degenerate cases)
     */
    fallbackBoundary(cluster, angleOffset) {
        const PRECISION = 0.1;
        const allEdges = [];
        const cv = getHexVertices(this.cellRadius, angleOffset);
        
        for (const child of cluster) {
            for (let i = 0; i < 6; i++) {
                const v1 = cv[i];
                const v2 = cv[(i + 1) % 6];
                allEdges.push({
                    p1: { x: child.x + v1.x, y: child.y + v1.y },
                    p2: { x: child.x + v2.x, y: child.y + v2.y }
                });
            }
        }

        const outerEdges = this.findOuterEdges(allEdges, PRECISION);
        if (outerEdges.length === 0) return [];

        const loops = this.chainEdgesIntoLoops(outerEdges, PRECISION);
        if (loops.length === 0) return [];

        // Return largest CCW loop
        let largestLoop = null;
        let largestArea = 0;
        for (const loop of loops) {
            const area = getSignedArea(loop);
            if (area > largestArea) {
                largestArea = area;
                largestLoop = loop;
            }
        }

        return largestLoop || [];
    }

    /**
     * Merge multiple cluster boundaries into a single closed path
     * Uses minimal straight bridges between closest vertices
     */
    mergeClusterBoundaries(boundaries) {
        if (boundaries.length === 0) return [];
        if (boundaries.length === 1) return boundaries[0];

        // Sort by area (largest first) - main boundary first
        boundaries.sort((a, b) => Math.abs(getSignedArea(b)) - Math.abs(getSignedArea(a)));

        // Start with the largest boundary
        let merged = [...boundaries[0]];

        // Merge remaining boundaries one by one
        for (let i = 1; i < boundaries.length; i++) {
            const loopB = boundaries[i];
            
            // Find closest vertex pair between merged and loopB
            let bestDist = Infinity;
            let bestA = 0, bestB = 0;
            
            for (let ia = 0; ia < merged.length; ia++) {
                for (let ib = 0; ib < loopB.length; ib++) {
                    const d = distSq(merged[ia], loopB[ib]);
                    if (d < bestDist) {
                        bestDist = d;
                        bestA = ia;
                        bestB = ib;
                    }
                }
            }

            // Create bridged path with out-and-back connection:
            // merged[0..bestA] -> bridge to loopB[bestB] -> 
            // loopB[bestB..end, 0..bestB] -> bridge back -> merged[bestA..end]
            const result = [];
            
            // Add merged up to and including bestA
            for (let j = 0; j <= bestA; j++) {
                result.push(merged[j]);
            }
            
            // Bridge: add connection point on loopB
            result.push(loopB[bestB]);
            
            // Add all of loopB starting from bestB (going around the loop)
            for (let j = 1; j < loopB.length; j++) {
                result.push(loopB[(bestB + j) % loopB.length]);
            }
            
            // Bridge back: return to the connection point on loopB, then back to merged
            result.push(loopB[bestB]);
            result.push(merged[bestA]);
            
            // Continue with rest of merged (skip bestA since we already added it)
            for (let j = bestA + 1; j < merged.length; j++) {
                result.push(merged[j]);
            }
            
            merged = result;
        }

        return merged;
    }

    /**
     * Find edges that appear exactly once (boundary edges)
     * Uses same precision as legacy working version
     */
    findOuterEdges(allEdges, precision) {
        const edgeKey = (e) => {
            const x1 = Math.round(e.p1.x / precision);
            const y1 = Math.round(e.p1.y / precision);
            const x2 = Math.round(e.p2.x / precision);
            const y2 = Math.round(e.p2.y / precision);
            // Normalize so A->B and B->A produce same key
            if (x1 < x2 || (x1 === x2 && y1 < y2)) {
                return `${x1},${y1}-${x2},${y2}`;
            } else {
                return `${x2},${y2}-${x1},${y1}`;
            }
        };

        // Count occurrences of each edge
        const edgeCounts = new Map();
        for (const edge of allEdges) {
            const key = edgeKey(edge);
            edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
        }

        // Keep only edges appearing exactly once
        return allEdges.filter(e => edgeCounts.get(edgeKey(e)) === 1);
    }

    /**
     * Chain loose edges into closed loops using adjacency walk
     */
    chainEdgesIntoLoops(edges, precision) {
        if (edges.length === 0) return [];

        const pointKey = (p) => `${Math.round(p.x / precision)},${Math.round(p.y / precision)}`;
        const pointsEqual = (p1, p2) => Math.abs(p1.x - p2.x) < precision && Math.abs(p1.y - p2.y) < precision;

        // Build adjacency map
        const adjacency = new Map();
        for (let i = 0; i < edges.length; i++) {
            const e = edges[i];
            const k1 = pointKey(e.p1);
            const k2 = pointKey(e.p2);
            if (!adjacency.has(k1)) adjacency.set(k1, []);
            if (!adjacency.has(k2)) adjacency.set(k2, []);
            adjacency.get(k1).push({ edgeIdx: i, point: e.p1, other: e.p2 });
            adjacency.get(k2).push({ edgeIdx: i, point: e.p2, other: e.p1 });
        }

        const used = new Set();
        const loops = [];

        for (let startIdx = 0; startIdx < edges.length; startIdx++) {
            if (used.has(startIdx)) continue;

            const loop = [];
            const startPoint = edges[startIdx].p1;
            const startKey = pointKey(startPoint);
            
            loop.push(startPoint);
            used.add(startIdx);
            
            let currentPoint = edges[startIdx].p2;
            let currentKey = pointKey(currentPoint);
            let watchdog = 0;

            while (watchdog < edges.length * 2) {
                watchdog++;
                
                if (currentKey === startKey) break;

                if (loop.length === 0 || !pointsEqual(currentPoint, loop[loop.length - 1])) {
                    loop.push(currentPoint);
                }

                const connections = adjacency.get(currentKey);
                if (!connections) break;

                // Pick the next unused edge, prefer CCW turn
                let found = false;
                for (const conn of connections) {
                    if (!used.has(conn.edgeIdx)) {
                        used.add(conn.edgeIdx);
                        currentPoint = conn.other;
                        currentKey = pointKey(currentPoint);
                        found = true;
                        break;
                    }
                }
                if (!found) break;
            }

            // Clean duplicates and validate
            const cleanLoop = [];
            for (let i = 0; i < loop.length; i++) {
                const prev = cleanLoop.length > 0 ? cleanLoop[cleanLoop.length - 1] : loop[loop.length - 1];
                if (!pointsEqual(loop[i], prev)) {
                    cleanLoop.push(loop[i]);
                }
            }

            if (cleanLoop.length >= 3) {
                loops.push(ensureCCW(cleanLoop));
            }
        }

        return loops;
    }

    /**
     * Bridge multiple loops by connecting at their nearest vertices
     * Simpler and more robust than edge-based bridging
     */
    bridgeLoopsAtVertices(loops) {
        if (loops.length === 0) return [];
        if (loops.length === 1) return loops[0];

        // Sort by area (largest first)
        loops.sort((a, b) => Math.abs(getSignedArea(b)) - Math.abs(getSignedArea(a)));
        
        let merged = [...loops[0]];

        for (let i = 1; i < loops.length; i++) {
            const loopB = loops[i];
            
            // Find closest vertex pair between merged and loopB
            let bestDist = Infinity;
            let bestA = 0, bestB = 0;
            
            for (let ia = 0; ia < merged.length; ia++) {
                for (let ib = 0; ib < loopB.length; ib++) {
                    const d = distSq(merged[ia], loopB[ib]);
                    if (d < bestDist) {
                        bestDist = d;
                        bestA = ia;
                        bestB = ib;
                    }
                }
            }

            // Create bridged path: 
            // merged[0..bestA] -> loopB[bestB..end, 0..bestB] -> merged[bestA..end]
            const result = [];
            
            // Add merged up to and including bestA
            for (let j = 0; j <= bestA; j++) {
                result.push(merged[j]);
            }
            
            // Add all of loopB starting from bestB
            for (let j = 0; j < loopB.length; j++) {
                result.push(loopB[(bestB + j) % loopB.length]);
            }
            
            // Bridge back: add the connection point again
            result.push(loopB[bestB]);
            
            // Continue with rest of merged
            for (let j = bestA; j < merged.length; j++) {
                result.push(merged[j]);
            }
            
            merged = result;
        }

        return merged;
    }

    /**
     * Clean path by removing duplicate vertices and ensuring CCW
     */
    cleanPath(path, precision) {
        if (path.length < 3) return path;

        const pointsEqual = (p1, p2) => 
            Math.abs(p1.x - p2.x) < precision && Math.abs(p1.y - p2.y) < precision;

        // Remove consecutive duplicates
        const cleaned = [];
        for (let i = 0; i < path.length; i++) {
            const curr = path[i];
            if (cleaned.length === 0 || !pointsEqual(curr, cleaned[cleaned.length - 1])) {
                cleaned.push(curr);
            }
        }

        // Check first/last
        if (cleaned.length > 1 && pointsEqual(cleaned[0], cleaned[cleaned.length - 1])) {
            cleaned.pop();
        }

        return cleaned.length >= 3 ? ensureCCW(cleaned) : path;
    }

    /**
     * Offset path inward with miter/bevel corners
     */
    offsetPathInward(path, amount) {
        if (path.length < 3) return path;

        const result = [];
        const n = path.length;

        for (let i = 0; i < n; i++) {
            const prev = path[(i - 1 + n) % n];
            const curr = path[i];
            const next = path[(i + 1) % n];

            const dx1 = curr.x - prev.x;
            const dy1 = curr.y - prev.y;
            const dx2 = next.x - curr.x;
            const dy2 = next.y - curr.y;

            const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1;
            const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;

            // Inward normals (right-hand side for CCW winding)
            const nx1 = -dy1 / len1;
            const ny1 = dx1 / len1;
            const nx2 = -dy2 / len2;
            const ny2 = dx2 / len2;

            const cross = dx1 * dy2 - dy1 * dx2;
            const dot = nx1 * nx2 + ny1 * ny2;

            if (cross > 0 && dot < 0.5) {
                // Convex corner - miter with limit
                let nx = (nx1 + nx2) / 2;
                let ny = (ny1 + ny2) / 2;
                const nlen = Math.sqrt(nx * nx + ny * ny);
                
                if (nlen > 0.001) {
                    nx /= nlen;
                    ny /= nlen;
                    const halfAngle = Math.acos(Math.max(-1, Math.min(1, dot))) / 2;
                    const scale = Math.min(1 / Math.cos(halfAngle), 2);
                    result.push({ x: curr.x + nx * amount * scale, y: curr.y + ny * amount * scale });
                } else {
                    result.push({ x: curr.x + nx1 * amount, y: curr.y + ny1 * amount });
                }
            } else if (cross < 0 && dot < 0.5) {
                // Concave corner - bevel (two points)
                result.push({ x: curr.x + nx1 * amount, y: curr.y + ny1 * amount });
                result.push({ x: curr.x + nx2 * amount, y: curr.y + ny2 * amount });
            } else {
                // Gentle corner - simple miter
                let nx = (nx1 + nx2) / 2;
                let ny = (ny1 + ny2) / 2;
                const nlen = Math.sqrt(nx * nx + ny * ny);
                
                if (nlen > 0.001) {
                    nx /= nlen;
                    ny /= nlen;
                    const halfAngle = Math.acos(Math.max(-1, Math.min(1, dot))) / 2;
                    const scale = Math.min(1 / Math.cos(halfAngle), 2);
                    result.push({ x: curr.x + nx * amount * scale, y: curr.y + ny * amount * scale });
                } else {
                    result.push({ x: curr.x + nx1 * amount, y: curr.y + ny1 * amount });
                }
            }
        }

        return result;
    }

    /**
     * Clean self-intersections in a polygon
     * Uses a segment-split-and-relink approach
     */
    cleanSelfIntersections(path, precision) {
        if (path.length < 4) return path;

        // Find all intersection points
        const n = path.length;
        const intersections = [];
        
        for (let i = 0; i < n; i++) {
            const a1 = path[i];
            const a2 = path[(i + 1) % n];
            
            for (let j = i + 2; j < n; j++) {
                if (i === 0 && j === n - 1) continue; // Skip adjacent edges
                
                const b1 = path[j];
                const b2 = path[(j + 1) % n];
                
                const inter = this.segmentIntersection(a1, a2, b1, b2);
                if (inter) {
                    intersections.push({ i, j, point: inter });
                }
            }
        }

        // If no intersections, path is clean
        if (intersections.length === 0) return path;

        // Simple approach: if there are self-intersections, 
        // try to find the largest simple loop by area
        // This is a heuristic fallback
        
        // For now, just remove collinear duplicates and return
        const cleaned = [];
        for (let i = 0; i < path.length; i++) {
            const curr = path[i];
            if (cleaned.length === 0) {
                cleaned.push(curr);
            } else {
                const last = cleaned[cleaned.length - 1];
                if (Math.abs(curr.x - last.x) > precision || Math.abs(curr.y - last.y) > precision) {
                    cleaned.push(curr);
                }
            }
        }

        // Also check first/last
        if (cleaned.length > 1) {
            const first = cleaned[0];
            const last = cleaned[cleaned.length - 1];
            if (Math.abs(first.x - last.x) < precision && Math.abs(first.y - last.y) < precision) {
                cleaned.pop();
            }
        }

        return cleaned.length >= 3 ? cleaned : path;
    }

    /**
     * Find intersection point of two segments (if any)
     */
    segmentIntersection(a1, a2, b1, b2) {
        const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
        const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
        
        const cross = d1x * d2y - d1y * d2x;
        if (Math.abs(cross) < 1e-10) return null;
        
        const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / cross;
        const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / cross;
        
        // Check if intersection is within both segments (exclusive of endpoints)
        const eps = 0.001;
        if (t > eps && t < 1 - eps && u > eps && u < 1 - eps) {
            return { x: a1.x + t * d1x, y: a1.y + t * d1y };
        }
        return null;
    }

    // ===========================================
    // RENDERING
    // ===========================================
    
    draw(canvas, ctx) {
        const canvasSize = 600;
        if (canvas.width !== canvasSize) {
            canvas.width = canvasSize;
            canvas.height = canvasSize;
        }
        ctx.clearRect(0, 0, canvasSize, canvasSize);

        const physicalSize = INTERNAL_REF * 2.2;
        const scale = canvasSize / physicalSize;

        ctx.save();
        ctx.translate(canvasSize / 2, canvasSize / 2);
        ctx.scale(scale, scale);

        this.drawParentBoundary(ctx, scale);
        this.drawChildren(ctx, scale);

        ctx.restore();
    }

    drawParentBoundary(ctx, scale) {
        ctx.beginPath();
        
        if (this.state.isConform && this.boundaryPath.length > 0) {
            const path = this.boundaryPath;
            ctx.moveTo(path[0].x, path[0].y);
            for (let i = 1; i < path.length; i++) {
                ctx.lineTo(path[i].x, path[i].y);
            }
            ctx.closePath();
        } else if (this.visualParentPoly && this.visualParentPoly.length > 0) {
            const poly = this.visualParentPoly;
            ctx.moveTo(poly[0].x, poly[0].y);
            for (let i = 1; i < poly.length; i++) {
                ctx.lineTo(poly[i].x, poly[i].y);
            }
            ctx.closePath();
        }
        
        ctx.strokeStyle = '#2dd4bf';
        ctx.lineWidth = 2 / scale;
        ctx.lineJoin = 'round';
        ctx.stroke();
    }

    drawChildren(ctx, scale) {
        if (this.childRadius <= 0) return;

        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1 / scale;
        
        const angleOffset = this.state.isChildFlat ? 0 : -Math.PI / 6;
        const cv = getHexVertices(this.childRadius, angleOffset);
        
        this.children.forEach(child => {
            ctx.beginPath();
            ctx.moveTo(child.x + cv[0].x, child.y + cv[0].y);
            for (let i = 1; i < 6; i++) {
                ctx.lineTo(child.x + cv[i].x, child.y + cv[i].y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        });
    }

    // ===========================================
    // SVG EXPORT
    // ===========================================
    
    exportSVG() {
        const s = this.state;
        const scalar = s.userInputParent / INTERNAL_REF;
        const boxSize = s.userInputParent * 2.2;
        const min = -boxSize / 2;
        
        const parentW = s.userInputParent;
        const parentStroke = (parentW / 200).toFixed(3);
        const childStroke = (parentW / 400).toFixed(3);

        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${min} ${min} ${boxSize} ${boxSize}" width="${boxSize}${s.unit}" height="${boxSize}${s.unit}">`;
        
        svg += this.exportParentBoundary(scalar, parentStroke);
        svg += this.exportChildren(scalar, childStroke);
        
        svg += `</svg>`;
        return svg;
    }

    exportParentBoundary(scalar, strokeWidth) {
        let svg = `<g stroke="#2dd4bf" stroke-width="${strokeWidth}" fill="none" stroke-linejoin="round">`;
        
        if (this.state.isConform && this.boundaryPath.length > 0) {
            const d = this.boundaryPath.map((p, i) => 
                (i === 0 ? 'M' : 'L') + ` ${(p.x * scalar).toFixed(3)} ${(p.y * scalar).toFixed(3)}`
            ).join(" ") + " Z";
            svg += `<path d="${d}" />`;
        } else if (this.visualParentPoly) {
            const pPath = this.visualParentPoly.map(p => 
                `${(p.x * scalar).toFixed(3)},${(p.y * scalar).toFixed(3)}`
            ).join(" ");
            svg += `<polygon points="${pPath}" />`;
        }
        
        svg += `</g>`;
        return svg;
    }

    exportChildren(scalar, strokeWidth) {
        let svg = `<g stroke="#94a3b8" stroke-width="${strokeWidth}" fill="none">`;
        
        const angleOffset = this.state.isChildFlat ? 0 : -Math.PI / 6;
        this.children.forEach(child => {
            let pts = "";
            for (let i = 0; i < 6; i++) {
                const a = i * Math.PI / 3 + angleOffset;
                const x = (child.x + Math.cos(a) * this.childRadius) * scalar;
                const y = (child.y + Math.sin(a) * this.childRadius) * scalar;
                pts += `${x.toFixed(3)},${y.toFixed(3)} `;
            }
            svg += `<polygon points="${pts.trim()}" />`;
        });
        
        svg += `</g>`;
        return svg;
    }
}
