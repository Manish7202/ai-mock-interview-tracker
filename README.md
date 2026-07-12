AI Mock Interview Tracker

A 100% client-side, browser-based mock interview simulator that parses your resume, generates tailored interview questions, records your spoken answers, monitors your eye contact via webcam, and produces a scored performance report — all without sending any data to a server.

✨ Features


Resume parsing — Upload a PDF resume; text is extracted locally in the browser using pdf.js.
Dynamic question generation — Scans extracted resume text for known skill keywords (JavaScript, React, AWS, Agile, etc.) and builds personalized interview questions from templates. Falls back to generic questions if no skills are found.
Voice-based answering — Uses the browser's Web Speech API (SpeechRecognition) to transcribe spoken answers in real time.
Webcam-based proctoring / anti-cheat

Gaze tracking via face-api.js (TinyFaceDetector) — warns the user if their face isn't detected on screen.
Phone detection via TensorFlow.js + coco-ssd object detection — instantly ends the interview if a cell phone is spotted on camera.
3-strike warning system before the interview is auto-cancelled.



Automated scorecard — Scores each answer based on response length/depth, calculates a communication score penalized by look-away count, and renders an animated circular progress report with per-question feedback.
Privacy-first — No backend, no API keys, no data leaves the browser. All PDF parsing, question generation, and scoring happen locally.


🛠️ Tech Stack

PurposeLibraryPDF text extractionpdf.jsFace detectionface-api.jsObject (phone) detectionTensorFlow.js + coco-ssdSpeech-to-textWeb Speech API (native browser)IconsFont Awesome 6FontsGoogle Fonts — Playfair Display, Grand Hotel, Goudy Bookletter 1911

No build tools, frameworks, or package manager are required — it's plain HTML/CSS/JS with libraries loaded via CDN.

📁 Project Structure

AI-Mock-Interview-Tracker/
├── index.html      # App markup — 3 views: setup, live interview, scorecard
├── style.css       # Dark "glassmorphism" UI theme, animations, layout
├── script.js       # All app logic: PDF parsing, question gen, speech,
│                    # gaze/phone detection, scoring, rendering
└── README.md
