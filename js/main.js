/* ==============================================
   MAIN APPLICATION ENTRY POINT
   
   Initializes the HexPacker and wires up UI events
   ============================================== */

import { HexPacker } from './HexPacker.js';

// ===========================================
// DOM ELEMENT REFERENCES
// ===========================================

const inputs = {
    parentSize: document.getElementById('parentSize'),
    parentShape: document.getElementById('parentShape'),
    parentRotation: document.getElementById('parentRotation'),
    density: document.getElementById('density'),
    padding: document.getElementById('padding'),
    childOrientation: document.getElementById('childOrientationToggle'),
    boundary: document.getElementById('boundaryToggle'),
    unit: document.getElementById('unitSelect'),
    originOffsetX: document.getElementById('originOffsetX'),
    originOffsetY: document.getElementById('originOffsetY'),
    axialAltToggle: document.getElementById('axialAltToggle')
};

// Editable value displays (now inputs, not spans)
const displays = {
    density: document.getElementById('densityVal'),
    padding: document.getElementById('paddingVal'),
    parentRotation: document.getElementById('parentRotationVal'),
    count: document.getElementById('statCount'),
    edge: document.getElementById('statEdge'),
    width: document.getElementById('statWidth'),
    unitLabels: document.querySelectorAll('.unit-label')
};

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const downloadBtn = document.getElementById('downloadBtn');

// ===========================================
// INITIALIZE PACKER
// ===========================================

const packer = new HexPacker(inputs, displays);

// ===========================================
// RENDER LOOP
// ===========================================

function render() {
    packer.updateState();
    packer.draw(canvas, ctx);
}

// ===========================================
// BIDIRECTIONAL SLIDER <-> INPUT SYNC
// ===========================================

// Pairs of [slider, editableInput]
const sliderPairs = [
    [inputs.density, displays.density],
    [inputs.padding, displays.padding],
    [inputs.parentRotation, displays.parentRotation]
];

sliderPairs.forEach(([slider, input]) => {
    if (!slider || !input) return;
    
    // Slider changes -> update input value and render
    slider.addEventListener('input', () => {
        input.value = parseFloat(slider.value).toFixed(1);
        render();
    });
    
    // For text input: only update on blur or Enter key, not on every keystroke
    // This allows the user to type a complete value without interference
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur(); // Trigger the change event
        }
    });
    
    // On focus, select all text for easy replacement
    input.addEventListener('focus', () => {
        input.select();
    });
    
    // On blur/change, validate and sync to slider
    input.addEventListener('change', () => {
        let val = parseFloat(input.value);
        if (isNaN(val)) {
            // Reset to slider value if invalid
            val = parseFloat(slider.value);
        }
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        const clamped = Math.max(min, Math.min(max, val));
        slider.value = clamped;
        input.value = clamped;
        render();
    });
});

// ===========================================
// EVENT BINDINGS
// ===========================================

// Bind primary inputs (not the display inputs, they're handled above)
const primaryInputs = [
    inputs.parentSize, inputs.parentShape, inputs.childOrientation,
    inputs.boundary, inputs.unit, inputs.originOffsetX, inputs.originOffsetY,
    inputs.axialAltToggle
];

primaryInputs.forEach(el => {
    if (!el) return;
    el.addEventListener('input', render);
    el.addEventListener('change', render);
});

// SVG Export
downloadBtn.addEventListener('click', () => {
    const content = packer.exportSVG();
    const blob = new Blob([content], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hex_pack_${packer.state.shapeName}_${packer.state.density}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

// ===========================================
// INITIAL RENDER
// ===========================================

render();
