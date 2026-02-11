# 3D Agent Office Visualization

A cool isometric 3D office environment where each agent is represented by an animated colored box in Three.js.

## Features

- **3D Isometric Office**: Interactive office environment with working desks and lounge areas
- **Animated Agent Boxes**: Each agent is a colorful 3D box that floats and rotates
- **Station System**: Agents move between "working" stations (desks) and "idle" stations (lounge)
- **Status Indicators**: Visual indicators show if agents are working (green) or idle (orange)
- **Click Interaction**: Click on any agent box to select it
- **Thought Bubbles**: See truncated agent responses in floating thought bubbles
- **Chat Modal**: Click the thought bubble to open a full chat interface
- **Real-time Updates**: Connects to the gateway and displays live agent data

## Usage

1. Navigate to `/agent-office` from the home page (click the "Office" button in the header)
2. The scene will automatically connect to your gateway and load agents
3. Use mouse to:
   - **Rotate**: Left click + drag
   - **Pan**: Right click + drag
   - **Zoom**: Scroll wheel
4. Click on any colored box to interact with that agent
5. View quick responses in the thought bubble
6. Click the bubble to open the full chat modal

## Color Scheme

Each agent gets a unique color from the palette:
- Pink (`#FF6B9D`)
- Purple (`#C96DD8`)
- Blue (`#79A3FF`)
- Orange (`#FFB347`)
- Green (`#77DD77`)

## Station Types

- **Working Stations**: 3 desk areas with monitors - for agents with status "running"
- **Idle Stations**: Lounge area with couches - for agents with status "idle"

Agents automatically transition between stations based on their status.

## Components

- `AgentOfficeScene.tsx` - Main scene coordinator
- `OfficeEnvironment.tsx` - 3D office furniture and layout
- `AgentBoxes.tsx` - Agent box models with animations
- `ThoughtBubble.tsx` - Floating response overlay
- `ChatModal.tsx` - Full chat interface modal

## Future Enhancements

- More detailed 3D models (replace placeholder boxes)
- Message sending from thought bubble
- Agent-to-agent interaction visualization
- Different office layouts
- Sound effects
- Performance metrics visualization
