---
title: "CollabBoard"
order: 4
draft: false
kind: live
tagline: "A real-time collaborative whiteboard with live cursors and presence."
stack: ["React 19", "TypeScript", "Konva", "Firebase", "Cloud Functions", "Claude", "Vitest", "Playwright"]
links:
  live: https://collabboard-fe299.web.app
  github: https://github.com/RajatA98/CollabBoard
problem: "Teams brainstorming remotely need a shared canvas where everyone sees the same board, the same cursors and the same edits as they happen. Hosted whiteboards do this well, but building one means owning the sync, presence and conflict rules yourself."
hardPart: "Cursors and drags change dozens of times a second while the board itself must persist, and the two have very different cost and durability needs. When two people edit the same sticky note at once, the board still has to settle on one answer that every client agrees on."
decision: "Split the data by lifetime: durable board objects in Firestore and fast, ephemeral cursors, presence and live transforms in the Realtime Database, with last-write-wins on conflicts instead of pulling in a CRDT library."
outcome: "Live on Firebase with live cursors, presence, shapes, sticky notes, pan and zoom, plus an AI command in a Cloud Function that can lay out hundreds of shapes from one request. Built test-first, with unit tests in Vitest and multi-user flows in Playwright."
figure:
  value: "30 ms"
  note: "cursor broadcast throttle that keeps remote cursors smooth without flooding the database"
  cleared: true
redacted: false
---
