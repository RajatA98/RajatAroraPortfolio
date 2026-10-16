---
title: "KnightKnight"
order: 2
draft: false
kind: app-store
tagline: "Chess club tournaments on iOS: QR check-in, automatic pairings, verified ratings."
stack: ["Swift", "iOS", "Glicko-2"]
links:
  appStore: https://apps.apple.com/us/app/knightknight/id6759010497
problem: "Local chess clubs run tournaments on paper and spreadsheets, so the host spends the evening pairing rounds, chasing results and updating ratings by hand. Players want ratings they can trust, and clubs have no budget for tournament software."
hardPart: "Results come from the players themselves, so the system has to record a game from a QR scan, accept self-reported results, pair the next round automatically and still produce ratings nobody can game. Then the app sat stuck in App Store review until the database access rules and mobile autofill were hardened enough to pass."
decision: "Rated games with Glicko-2 rather than plain Elo, because club players play few rated games and Glicko-2 tracks how uncertain each rating is, so a newcomer's first results move their rating sensibly."
outcome: "Built the event system end to end as founding engineer and took the app from stuck in review to live on the App Store, where it passed 100 downloads in its first month."
figure:
  value: "100+"
  note: "App Store downloads in the first month"
  cleared: true
redacted: false
---
