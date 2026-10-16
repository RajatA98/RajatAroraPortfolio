---
title: "Mulingo"
order: 5
draft: false
kind: live
tagline: "Learn piano the way a language app teaches a language: an 88-key interactive piano in the browser."
stack: ["JavaScript", "Web Audio API", "SVG", "HTML", "CSS", "GitHub Pages"]
links:
  live: https://rajata98.github.io/Mulingo/
  github: https://github.com/RajatA98/Mulingo
problem: "Beginners who want to learn piano usually need a keyboard, a teacher or a paid app before they play a single note. Mulingo teaches reading and playing in short lessons with instant feedback, using nothing but a browser."
hardPart: "All 88 keys, A0 to C8, have to sound right with no audio samples to download, and low bass notes vanish on laptop speakers unless they are shaped differently. Notes also have to appear on a staff in the right place, with ledger lines, for both treble and bass clef."
decision: "Synthesised every note in the Web Audio API from the equal-temperament formula (440 Hz times two to the power of semitones from A4 over twelve) instead of shipping a recorded sample per key."
outcome: "Live on GitHub Pages as a static site with no build step and no install: 12 progressive lessons from first notes to sharps, flats and both clefs, playable by mouse or computer keyboard."
figure:
  value: "88 keys"
  note: "full piano range, A0 to C8, synthesised in the browser with no audio files"
  cleared: true
redacted: false
---
