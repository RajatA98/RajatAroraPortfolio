---
title: "Bioliminal"
order: 3
draft: false
kind: live
tagline: "An AI-powered muscle-signal wearable, from firmware to mobile app to model."
stack: ["ESP32 firmware", "Flutter", "Python", "Machine learning", "Firebase Hosting"]
links:
  live: https://bioliminal.web.app/demo
  github: https://github.com/orgs/Bioliminal/repositories
problem: "Muscle activity is invisible during training and rehab, and the lab gear that measures it is expensive and tethered to a desk. The question was whether a cheap wearable could read surface muscle signals (sEMG) and turn them into feedback a person can act on."
hardPart: "The signal is tiny and noisy, so the whole chain has to work at once: firmware sampling on an ESP32, a phone app receiving and displaying the stream, and a Python model that can tell real muscle activity from noise. A failure at any layer looks the same from the outside, which makes debugging across hardware, mobile and ML the real work."
decision: "Built one thin path from sensor to firmware to app to model first and only then deepened each layer, rather than perfecting the model on recorded data before any hardware worked."
outcome: "Prototyped across ESP32 firmware, a Flutter app and a Python ML model, and earned a top-six cohort slot to present at a live showcase watched by more than 40,000 viewers. The demo is live on the web."
figure:
  value: "Top 6"
  note: "cohort projects chosen for a live showcase with 40K+ viewers"
  cleared: true
redacted: false
---
