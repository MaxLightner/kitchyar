# Appliance model source

Models extracted from the user-supplied `KIT OBJ.glb` scene on 2026-11-04. The original file remains untouched.

| Output | Original mesh/node | Visual use |
| --- | --- | --- |
| `gas5.glb` | `Gas` | Five-burner gas cooktop |
| `fridge-side.glb` | `Samsung` | Side-by-side refrigerator |
| `oven.glb` | `Oven 1`, `Oven Drawer` | Built-in oven |
| `microwave.glb` | `Macro` | Built-in microwave |
| `sink-double.glb` | `Sink1` | Double-bowl sink, no drainer, source faucet |
| `faucet.glb` | Upper triangles of `Sink1` | Curved faucet for procedural sink variants |

Original embedded PBR textures and material assignments are preserved. Embedded bitmap dimensions are capped at 1024px to limit mobile download and graphics memory. Oven roughness is clamped to the valid glTF range.

These are visual assets only. Semantic dimensions, cabinet cutouts, placement, front optimization, the stove/hood link, refrigerator surround and sink customization continue to use the existing Kitchyar model/solver. Unmatched appliance variants retain their procedural rendering. Missing GLBs degrade to procedural fallback.
