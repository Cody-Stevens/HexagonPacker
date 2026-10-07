// Run from the repo root with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHexagonInsideShape } from '../js/geometry.js';
import { HexPacker } from '../js/HexPacker.js';

const POINTY = -Math.PI / 6;

// Independent check: does any outline edge properly cross any hexagon edge,
// or does any outline vertex lie strictly inside the hexagon?
const orient = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function outlineCrossesHex(cx, cy, r, angleOffset, poly) {
    const h = [];
    for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 + angleOffset;
        h.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    for (const p of poly) {
        if (h.every((a, i) => orient(a, h[(i + 1) % 6], p) > 0)) return true;
    }
    for (let i = 0; i < 6; i++) {
        const a = h[i], b = h[(i + 1) % 6];
        for (let j = 0; j < poly.length; j++) {
            const c = poly[j], d = poly[(j + 1) % poly.length];
            if (orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0) return true;
        }
    }
    return false;
}

function pack(shape, density, flat = false) {
    const v = value => ({ value: String(value) });
    const inputs = {
        parentSize: v(300), parentShape: v(shape), parentRotation: v(0), density: v(density),
        padding: v(2), childOrientation: { checked: flat }, boundary: { checked: false },
        unit: v('mm'), originOffsetX: v(0), originOffsetY: v(0), axialAltToggle: { checked: false }
    };
    const d = () => ({ innerText: '' });
    const displays = { density: d(), padding: d(), parentRotation: d(), count: d(), edge: d(), width: d(), unitLabels: [] };
    const packer = new HexPacker(inputs, displays);
    packer.updateState();
    return packer;
}

// Square with a thin V-notch whose tip pokes into the hexagon's right edge
// (x = 866) between two hexagon vertices (866, +-500). All 6 hexagon
// vertices are inside the polygon, but the outline crosses the hexagon.
const notchedSquare = [
    { x: -3000, y: -3000 }, { x: 3000, y: -3000 }, { x: 3000, y: -100 },
    { x: 700, y: 0 },
    { x: 3000, y: 100 }, { x: 3000, y: 3000 }, { x: -3000, y: 3000 }
];

test('rejects hexagon when a reflex outline vertex pokes between two hexagon vertices', () => {
    assert.equal(outlineCrossesHex(0, 0, 1000, POINTY, notchedSquare), true);
    assert.equal(isHexagonInsideShape(0, 0, 1000, POINTY, notchedSquare), false);
});

test('still accepts a hexagon that is fully inside (notch tip outside the margin)', () => {
    const shallow = notchedSquare.map(p => (p.x === 700 ? { x: 900, y: 0 } : p));
    assert.equal(isHexagonInsideShape(0, 0, 1000, POINTY, shallow), true);
});

test('no packed hexagon crosses the star6 / star8 / heart outlines (default settings)', () => {
    for (const [shape, density, flat] of [['star6', 5, false], ['star8', 5, false], ['star8', 5, true], ['heart', 3, true]]) {
        const p = pack(shape, density, flat);
        const angle = flat ? 0 : POINTY;
        const bad = p.children.filter(c => outlineCrossesHex(c.x, c.y, p.cellRadius, angle, p.visualParentPoly));
        assert.equal(bad.length, 0, `${shape} d=${density}${flat ? ' flat' : ''}: ${bad.length}/${p.children.length} hexagons cross the outline`);
    }
});

test('convex parent shapes keep their packing counts', () => {
    assert.equal(pack('hexagon', 5).children.length, 13);
    assert.equal(pack('circle', 10).children.length, 91);
    assert.equal(pack('square', 10).children.length, 57);
});
