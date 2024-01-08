# vue-sfc-to-jsx
a toolchain for converting Vue SFC to jsx

## Tool Positioning
This is an efficiency tool designed to assist in transforming Vue SFC to tsx files.
1. Prioritize the stylesheet part for later processing.
2. Generate new files instead of modifying the original ones.
3. The transformation process includes multiple stages, such as transitioning from template to JSX, JSX to TSX, and Options API to Class API. Each stage can correspond to a sub-tool.

## Limitations
Supports only Vue 2.6.x SFC. Other versions maybe supported in the future.
