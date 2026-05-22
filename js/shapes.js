/* ==============================================
   SHAPE GENERATORS
   
   Each generator returns { points: [{x, y}...], isClosed: bool, isCircular?: bool }
   All shapes are centered at origin with radius = INTERNAL_REF
   ============================================== */

import { INTERNAL_REF, CIRCLE_SEGMENTS } from './constants.js';

/**
 * Generate a regular polygon with n sides
 */
function regularPolygon(n, rotation = 0) {
    const points = [];
    const angleOffset = -Math.PI / 2 + rotation; // Start from top
    for (let i = 0; i < n; i++) {
        const angle = angleOffset + (i * 2 * Math.PI) / n;
        points.push({
            x: INTERNAL_REF * Math.cos(angle),
            y: INTERNAL_REF * Math.sin(angle)
        });
    }
    return { points, isClosed: true };
}

/**
 * Generate a star with n points
 */
function star(n, innerRatio = 0.4, rotation = 0) {
    const points = [];
    const angleOffset = -Math.PI / 2 + rotation;
    for (let i = 0; i < n * 2; i++) {
        const angle = angleOffset + (i * Math.PI) / n;
        const r = i % 2 === 0 ? INTERNAL_REF : INTERNAL_REF * innerRatio;
        points.push({
            x: r * Math.cos(angle),
            y: r * Math.sin(angle)
        });
    }
    return { points, isClosed: true };
}

/**
 * Apply rotation to a set of points
 */
function rotatePoints(pts, rotation) {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return pts.map(p => ({
        x: p.x * cos - p.y * sin,
        y: p.x * sin + p.y * cos
    }));
}

// ==============================================
// SHAPE DEFINITIONS
// ==============================================

export const ShapeGenerators = {
    // --- Regular Polygons ---
    triangle:   (rotation = 0) => regularPolygon(3, rotation),
    square:     (rotation = 0) => regularPolygon(4, rotation),
    pentagon:   (rotation = 0) => regularPolygon(5, rotation),
    hexagon:    (rotation = 0) => regularPolygon(6, rotation),
    heptagon:   (rotation = 0) => regularPolygon(7, rotation),
    octagon:    (rotation = 0) => regularPolygon(8, rotation),
    nonagon:    (rotation = 0) => regularPolygon(9, rotation),
    decagon:    (rotation = 0) => regularPolygon(10, rotation),
    dodecagon:  (rotation = 0) => regularPolygon(12, rotation),

    // --- Curves ---
    circle(rotation = 0) {
        const points = [];
        for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
            const angle = rotation + (i * 2 * Math.PI) / CIRCLE_SEGMENTS;
            points.push({
                x: INTERNAL_REF * Math.cos(angle),
                y: INTERNAL_REF * Math.sin(angle)
            });
        }
        return { points, isClosed: true, isCircular: true };
    },

    ellipse(rotation = 0) {
        const points = [];
        const a = INTERNAL_REF;           // semi-major axis
        const b = INTERNAL_REF * 0.5;     // semi-minor axis (2:1 ratio)
        for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
            const angle = (i * 2 * Math.PI) / CIRCLE_SEGMENTS;
            const x = a * Math.cos(angle);
            const y = b * Math.sin(angle);
            const cos = Math.cos(rotation);
            const sin = Math.sin(rotation);
            points.push({
                x: x * cos - y * sin,
                y: x * sin + y * cos
            });
        }
        return { points, isClosed: true, isCircular: true };
    },

    // --- Stars ---
    star5: (rotation = 0) => star(5, 0.38, rotation),
    star6: (rotation = 0) => star(6, 0.5, rotation),
    star8: (rotation = 0) => star(8, 0.4, rotation),

    // --- Exotic Shapes ---
    heart(rotation = 0) {
        const points = [];
        const scale = INTERNAL_REF * 0.9;
        // Parametric heart curve
        for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
            const t = (i * 2 * Math.PI) / CIRCLE_SEGMENTS;
            const x = 16 * Math.pow(Math.sin(t), 3);
            const y = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t));
            const px = (x / 17) * scale;
            const py = (y / 17) * scale;
            points.push({ x: px, y: py });
        }
        return { points: rotatePoints(points, rotation), isClosed: true, isCircular: true };
    },

    cross(rotation = 0) {
        const arm = INTERNAL_REF;
        const width = INTERNAL_REF * 0.35;
        const pts = [
            { x: -width, y: -arm },
            { x: width,  y: -arm },
            { x: width,  y: -width },
            { x: arm,    y: -width },
            { x: arm,    y: width },
            { x: width,  y: width },
            { x: width,  y: arm },
            { x: -width, y: arm },
            { x: -width, y: width },
            { x: -arm,   y: width },
            { x: -arm,   y: -width },
            { x: -width, y: -width }
        ];
        return { points: rotatePoints(pts, rotation), isClosed: true };
    },

    arrow(rotation = 0) {
        const pts = [
            { x: 0,                    y: -INTERNAL_REF },
            { x: INTERNAL_REF * 0.6,   y: -INTERNAL_REF * 0.2 },
            { x: INTERNAL_REF * 0.25,  y: -INTERNAL_REF * 0.2 },
            { x: INTERNAL_REF * 0.25,  y: INTERNAL_REF },
            { x: -INTERNAL_REF * 0.25, y: INTERNAL_REF },
            { x: -INTERNAL_REF * 0.25, y: -INTERNAL_REF * 0.2 },
            { x: -INTERNAL_REF * 0.6,  y: -INTERNAL_REF * 0.2 }
        ];
        return { points: rotatePoints(pts, rotation), isClosed: true };
    },

    gear(rotation = 0) {
        const teeth = 8;
        const outerR = INTERNAL_REF;
        const innerR = INTERNAL_REF * 0.7;
        const toothWidth = Math.PI / teeth / 2;
        const points = [];
        
        for (let i = 0; i < teeth; i++) {
            const baseAngle = (i * 2 * Math.PI) / teeth - Math.PI / 2;
            // Tooth profile
            points.push({
                x: innerR * Math.cos(baseAngle - toothWidth),
                y: innerR * Math.sin(baseAngle - toothWidth)
            });
            points.push({
                x: outerR * Math.cos(baseAngle - toothWidth * 0.6),
                y: outerR * Math.sin(baseAngle - toothWidth * 0.6)
            });
            points.push({
                x: outerR * Math.cos(baseAngle + toothWidth * 0.6),
                y: outerR * Math.sin(baseAngle + toothWidth * 0.6)
            });
            points.push({
                x: innerR * Math.cos(baseAngle + toothWidth),
                y: innerR * Math.sin(baseAngle + toothWidth)
            });
        }
        
        return { points: rotatePoints(points, rotation), isClosed: true };
    }
};

/**
 * Get list of all available shape names
 */
export function getShapeNames() {
    return Object.keys(ShapeGenerators);
}
