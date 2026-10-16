---
title: "BirthdayBot"
order: 6
draft: false
kind: live
tagline: "Turns one shared photo and a short prompt into a narrated birthday video and caption."
stack: ["Next.js", "TypeScript", "OpenAI", "fal", "ElevenLabs", "ffmpeg", "Langfuse", "Vercel"]
links:
  live: https://birthdaybot-five.vercel.app
  github: https://github.com/RajatA98/BirthdayBot
problem: "People want to send something more personal than a text on a friend's birthday but have no time to edit a video. BirthdayBot takes one photo of the people involved and a rough idea, and returns a short cinematic video with a voice-over and a caption ready to send."
hardPart: "Video models drift: they swap the people in the photo for stock actors, garble any text they draw, and reject long prompts outright. Video, voice and music come from three providers on different clocks, and the final file still has to be mixed so the voice sits clearly over the music."
decision: "Ran it as a bounded agent workflow with a plan the user reviews and edits before any video is generated, instead of a free-form chatbot that spends a paid generation on its first guess."
outcome: "Live on Vercel: photo analysis, an editable plan, parallel video, voice and music jobs, one automatic retry with a safer payload on failure, and an ffmpeg mix normalised to broadcast loudness. Prompt guardrails lock the subjects' identity and move the birthday title out of the video into an overlay."
figure:
  value: "2,400"
  note: "character hard cap on the video prompt, set under the provider's limit so generations stop failing on submit"
  cleared: true
redacted: false
---
