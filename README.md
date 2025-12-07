# HexagonPacker

A simple browser-based tool for packing hexagons inside a larger hexagon. This project was created with AI assistance ("vibecoding") to generate SVGs for laser cutting.

**Try it out:** [https://codystevens.studio/tools/hexagon-packer.html](https://codystevens.studio/tools/hexagon-packer.html)

You can use the hosted version on my website without needing to deploy it yourself.

## What it does

This tool calculates a hexagonal packing pattern within a parent hexagon boundary and exports the result as an SVG file. It is designed for laser cutting, CNC, or digital design workflows where you need precise geometric patterns.

## Features

- **Adjustable units** - Work in pixels, millimeters, centimeters, or inches
- **Parent edge length** - Set the size of your outer hexagon
- **Orientation controls** - Flip between pointy-top and flat-top for both the parent and child hexagons
- **Boundary modes** - Simple boundary or conform mode to handle edge cases
- **Density control** - Adjust how many layers of hexagons you want packed in
- **Padding** - Set the gap between hexagons (useful for kerf compensation)
- **Live stats** - See the count, child edge length, and width as you tweak settings
- **SVG export** - One-click download of your packed hexagon pattern

## Usage

1. Open `index.html` in your browser (or use the hosted version)
2. Adjust the controls to configure your pattern
3. Click "Export SVG" to download the file

## Why does this exist?

I needed a quick way to generate hexagon patterns for a project without manually drawing them in vector software, so I used AI tools to help build this solution.

## License

This project is licensed under the MIT License. This means it is free to use for commercial projects, you can modify the source code, and do whatever you want with it. See [LICENSE](LICENSE) for the full text.
