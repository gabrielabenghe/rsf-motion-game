# YR Motion Game

YR Motion Game is a browser-based fighting game controlled through real-time body movement recognition.

The project was developed for Romanian Science Festival 2026 – Young Researchers.

## How it works

The webcam stream is processed using MediaPipe. A geometric rule-based detector maps body landmarks to four actions:

- ATTACK — extend the right arm sideways
- BLOCK — raise both arms toward the chest
- DODGE — lower the upper body
- SPECIAL — raise both arms

Distances are normalized using shoulder width to reduce sensitivity to the player's distance from the camera.

## Tech stack

- Next.js
- TypeScript
- MediaPipe Pose Landmarker
- MediaPipe Hand Landmarker

## Research

The research paper evaluates gesture-recognition accuracy and latency at different distances from the camera.

## Source

The complete implementation is publicly available in this repository for transparency and reproducibility.
