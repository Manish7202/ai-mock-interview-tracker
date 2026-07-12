document.addEventListener("DOMContentLoaded", function () {

    // ─── VIEW ELEMENTS ───────────────────────────────────────────────────────
    const setupView = document.getElementById("setup-view");
    const interviewView = document.getElementById("interview-view");
    const scorecardView = document.getElementById("scorecard-view");

    // ─── SETUP ELEMENTS ──────────────────────────────────────────────────────
    const uploadArea = document.getElementById("upload-area");
    const resumeUpload = document.getElementById("resume-input");
    const fileStatus = document.getElementById("file-status");
    const startBtn = document.getElementById("start-interview-btn");
    const camToggle = document.getElementById("cam-toggle");

    // ─── INTERVIEW ELEMENTS ──────────────────────────────────────────────────
    const videoElement = document.getElementById("webcam-video");
    const aiSpeakingIndicator = document.getElementById("ai-speaking");
    const currentQuestion = document.getElementById("current-question");
    const micBtn = document.getElementById("mic-btn");
    const transcriptionBox = document.getElementById("transcription-box");
    const liveText = document.getElementById("live-text");
    const loadingState = document.getElementById("loading-state");
    const loadingMsg = document.getElementById("loading-msg");
    const sessionProgress = document.getElementById("session-progress");
    const micHint = document.getElementById("mic-hint");

    // ─── GAZE ELEMENTS ───────────────────────────────────────────────────────
    const gazeLabel = document.getElementById("gaze-label");
    const gazeStatus = document.getElementById("gaze-status");
    const warningOverlay = document.getElementById("warning-overlay");
    const warningText = document.getElementById("warning-text");
    const warningCountBadge = document.getElementById("warning-count-badge");
    const cancelledOverlay = document.getElementById("cancelled-overlay");

    // ─── STATE ───────────────────────────────────────────────────────────────
    let isRecording = false;
    let currentQuestionIndex = 0;
    const TOTAL_QUESTIONS = 2;
    let webcamStream = null;
    let resumeText = "";
    let generatedQuestions = [];
    let capturedAnswer = "";
    let qaLog = [];

    // SPEECH RECOGNITION STATE
    let recognition = null;
    let recognitionEnded = false;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;   // show interim so partial words aren't lost
        recognition.lang = "en-US";

        recognition.onresult = (e) => {
            let interim = "";
            capturedAnswer = "";
            for (let i = 0; i < e.results.length; i++) {
                if (e.results[i].isFinal) {
                    capturedAnswer += e.results[i][0].transcript + " ";
                } else {
                    interim += e.results[i][0].transcript;
                }
            }

            if (isRecording) {
                liveText.textContent = (capturedAnswer + interim).trim();
                if (liveText.textContent) {
                    transcriptionBox.classList.remove("hidden");
                }
            }
        };

        recognition.onerror = (e) => {
            // 'no-speech' is harmless — user just hasn't spoken yet
            if (e.error !== "no-speech") console.warn("Speech recognition error:", e.error);
        };

        // onend fires AFTER all final results are delivered — safe to read capturedAnswer here
        recognition.onend = () => {
            recognitionEnded = true;
            if (!isRecording) {
                // stopRecordingAndAnalyze already called — now process the answer
                processAnswer();
            }
        };
    }

    // ─── GAZE STATE ──────────────────────────────────────────────────────────
    let lookAwayCount = 0;
    const MAX_WARNINGS = 3;
    let lookAwayTimer = null;
    let warningTimer = null;
    let gazeDetectionActive = false;
    let detectionInterval = null;
    let objectDetector = null;

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 1 — FILE UPLOAD & PDF EXTRACTION
    // ═════════════════════════════════════════════════════════════════════════

    uploadArea.addEventListener("click", () => resumeUpload.click());

    resumeUpload.addEventListener("change", async (e) => {
        if (!e.target.files.length) return;
        await handleFileUpload(e.target.files[0]);
    });

    uploadArea.addEventListener("dragover", (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = "var(--primary)";
        uploadArea.style.background = "rgba(99,102,241,0.1)";
    });

    uploadArea.addEventListener("dragleave", (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = "";
        uploadArea.style.background = "";
    });

    uploadArea.addEventListener("drop", (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = "";
        uploadArea.style.background = "";
        if (e.dataTransfer.files.length) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });

    async function handleFileUpload(file) {
        if (file.type !== "application/pdf") {
            alert("Only PDF files are currently supported for parsing. Please upload a PDF.");
            return;
        }

        uploadArea.classList.add("hidden");
        fileStatus.classList.remove("hidden");
        document.getElementById("file-name").textContent = file.name;

        startBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Reading PDF...';
        startBtn.disabled = true;

        try {
            resumeText = await extractTextFromPDF(file);
            startBtn.disabled = false;
            startBtn.innerHTML = 'Start Interview <i class="fa-solid fa-bolt"></i>';
        } catch (err) {
            console.error("PDF parse error:", err);
            resumeText = "[Could not parse PDF]";
            startBtn.disabled = false;
            startBtn.innerHTML = 'Start Interview <i class="fa-solid fa-bolt"></i>';
        }
    }

    async function extractTextFromPDF(file) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            fullText += content.items.map(item => item.str).join(" ") + "\n";
        }
        return fullText.trim();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 2 — START INTERVIEW & GENERATE QUESTIONS (100% LOCAL)
    // ═════════════════════════════════════════════════════════════════════════

    startBtn.addEventListener("click", async () => {
        setupView.classList.add("hidden");
        setupView.classList.remove("active");
        interviewView.classList.remove("hidden");
        interviewView.classList.add("active");

        if (camToggle.checked) {
            await startWebcam();
        } else {
            const pip = document.querySelector(".webcam-pip");
            if (pip) pip.style.display = "none";
        }

        showLoading("Reading your resume and generating questions...");

        try {
            await generateQuestionsFromResume();
        } catch (err) {
            console.error("Question generation failed:", err);
            // Graceful fallback if API is unavailable
            generatedQuestions = [
                "Tell me about yourself and your professional background.",
                "What are your strongest technical skills?",
                "Describe a challenging project you have worked on.",
                "How do you handle pressure and tight deadlines?",
                "What are your career goals for the next few years?"
            ];
        }

        hideLoading();
        runAISequence();
    });

    // ─── LOCAL EXTRACTION: generate questions from resume text ─────────────────────
    async function generateQuestionsFromResume() {
        // Simple local keyword extraction
        const commonSkills = ["JavaScript", "Python", "Java", "C++", "React", "Angular", "Vue", "Node.js", "SQL", "NoSQL", "AWS", "Azure", "Docker", "Kubernetes", "Machine Learning", "Data Analysis", "Project Management", "Agile", "Scrum", "UI/UX", "HTML", "CSS", "TypeScript", "Git", "Leadership", "Marketing", "Sales", "Communication", "Teamwork"];
        
        let foundSkills = [];
        const textUpper = resumeText.toUpperCase();
        
        commonSkills.forEach(skill => {
            if (textUpper.includes(skill.toUpperCase())) {
                foundSkills.push(skill);
            }
        });

        // Shuffle and pick top skills
        foundSkills = foundSkills.sort(() => 0.5 - Math.random());
        const selectedSkills = foundSkills.slice(0, TOTAL_QUESTIONS);

        generatedQuestions = [];
        const templates = [
            "I noticed you have experience with {skill}. Can you describe a challenging project where you utilized it?",
            "How has your background in {skill} helped you solve a complex problem?",
            "What are some best practices you follow when working with {skill}?",
            "Can you tell me about a time you had to learn something new quickly while working with {skill}?"
        ];

        for (let i = 0; i < TOTAL_QUESTIONS; i++) {
            if (selectedSkills[i]) {
                const template = templates[Math.floor(Math.random() * templates.length)];
                generatedQuestions.push(template.replace("{skill}", selectedSkills[i]));
            } else {
                // Fallback if not enough skills found
                const fallbacks = [
                    "Tell me about yourself and your professional background.",
                    "What do you consider to be your greatest professional achievement?",
                    "How do you handle tight deadlines and pressure?",
                    "Where do you see your career heading in the next few years?"
                ];
                generatedQuestions.push(fallbacks[i % fallbacks.length]);
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 3 — INTERVIEW FLOW
    // ═════════════════════════════════════════════════════════════════════════

    function runAISequence() {
        const question = generatedQuestions[currentQuestionIndex];

        sessionProgress.textContent = `QUESTION ${currentQuestionIndex + 1} OF ${TOTAL_QUESTIONS}`;
        currentQuestion.textContent = question;

        transcriptionBox.classList.add("hidden");
        liveText.innerHTML = "";
        micBtn.disabled = true;
        micHint.textContent = "AI is speaking...";
        aiSpeakingIndicator.classList.remove("hidden");

        const ttsDelay = Math.max(2000, question.length * 35);
        setTimeout(() => {
            aiSpeakingIndicator.classList.add("hidden");
            micBtn.disabled = false;
            micBtn.innerHTML = '<i class="fa-solid fa-microphone"></i><div class="ripple"></div>';
            micHint.textContent = "Click to answer — click again to stop";
        }, ttsDelay);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 4 — MIC RECORDING (uses Web Speech API if available)
    // ═════════════════════════════════════════════════════════════════════════

    micBtn.addEventListener("click", () => {
        if (!isRecording) startRecording();
        else stopRecordingAndAnalyze();
    });

    function startRecording() {
        isRecording = true;
        capturedAnswer = "";
        recognitionEnded = false;

        micBtn.classList.add("recording");
        micBtn.innerHTML = '<i class="fa-solid fa-stop"></i><div class="ripple"></div>';
        transcriptionBox.classList.add("hidden");
        micHint.textContent = "Recording... click stop when done";

        // Reuse the single recognition instance — no repeated permission prompts
        if (recognition) {
            try { recognition.start(); } catch (e) { /* already started */ }
        }
    }

    function stopRecordingAndAnalyze() {
        isRecording = false;

        micBtn.classList.remove("recording");
        micBtn.disabled = true;
        micHint.textContent = "Processing your answer...";

        if (recognition) {
            try { recognition.stop(); } catch (e) { /* already stopped */ }

            setTimeout(() => {
                if (!recognitionEnded) processAnswer();
            }, 1500);
        } else {
            processAnswer();
        }
    }

     function processAnswer() {
        recognitionEnded = true;

        const answer = capturedAnswer.trim() || "(No answer recorded)";
        liveText.textContent = answer;
        transcriptionBox.classList.remove("hidden");

        qaLog.push({
            question: generatedQuestions[currentQuestionIndex],
            answer: answer
        });

        showLoading("AI is analyzing your answer...");

        setTimeout(async () => {
            hideLoading();
            currentQuestionIndex++;
            if (currentQuestionIndex < TOTAL_QUESTIONS) {
                runAISequence();
            } else {
                await generateScorecard();
            }
        }, 1000);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 5 — AI SCORECARD GENERATION
    // ═════════════════════════════════════════════════════════════════════════

    async function generateScorecard() {
        showLoading("Generating your interview report...");

        try {
            const scorecardData = await generateLocalScorecard();
            renderScorecard(scorecardData);
        } catch (err) {
            console.error("Scorecard generation failed:", err);
            renderFallbackScorecard();
        }

        stopGazeDetection();
        if (webcamStream) webcamStream.getTracks().forEach(t => t.stop());
        hideLoading();

        interviewView.classList.add("hidden");
        interviewView.classList.remove("active");
        scorecardView.classList.remove("hidden");
        scorecardView.classList.add("active");
    }

    async function generateLocalScorecard() {
        return new Promise((resolve) => {
            setTimeout(() => {
                let totalTechScore = 0;
                let breakdown = [];

                qaLog.forEach(item => {
                    const trimmedAnswer = item.answer.trim();
                    const isNoAnswer = !trimmedAnswer || trimmedAnswer === "(No answer recorded)";
                    const wordCount = isNoAnswer ? 0 : trimmedAnswer.split(/\s+/).length;
                    let score = 0;
                    let feedback = "";
                    let badge = "";

                    if (isNoAnswer) {
                        score = 0;
                        badge = "danger";
                        feedback = "No answer was recorded for this question. Please ensure your microphone is working and you speak clearly.";
                    } else if (wordCount < 10) {
                        score = 4;
                        badge = "warning";
                        feedback = "Your answer was very brief. Try to elaborate more and provide specific examples.";
                    } else if (wordCount < 30) {
                        score = 7;
                        badge = "success";
                        feedback = "Good answer, but could use a bit more detail regarding your exact role and the outcome.";
                    } else {
                        score = 9;
                        badge = "success";
                        feedback = "Excellent, detailed response! You clearly articulated your experience.";
                    }

                    totalTechScore += score;
                    breakdown.push({
                        question: item.question,
                        score: `${score}/10`,
                        badge: badge,
                        feedback: feedback
                    });
                });

                const avgTech = Math.round((totalTechScore / qaLog.length) * 10);
                // Communication score is impacted by how many times they looked away
                const commPenalty = lookAwayCount * 15;
                const commScore = Math.max(0, 95 - commPenalty);

                let overallVerdict = "";
                if (totalTechScore === 0) {
                    overallVerdict = "You completed the interview, but no answers were recorded. Please ensure your microphone is enabled and that you speak clearly to answer the questions.";
                } else {
                    overallVerdict = `You completed the interview! Your technical explanations scored an average of ${avgTech}%. Based on the length and depth of your answers, you showed a solid foundation.`;
                }

                resolve({
                    technicalScore: avgTech || 0,
                    communicationScore: commScore,
                    overallVerdict: overallVerdict,
                    breakdown: breakdown
                });
            }, 1500); // Simulate processing delay
        });
    }

    function renderScorecard(data) {
        // ── Animate circular scores from 0 to actual value ──────────────────
        animateScore("tech-circle", "tech-score", data.technicalScore);
        animateScore("comm-circle", "comm-score", data.communicationScore);

        // Dynamic color for progress circles
        updateCircleColor("tech-circle", data.technicalScore);
        updateCircleColor("comm-circle", data.communicationScore);

        // ── Look-away remark ─────────────────────────────────────────────────
        const gazeRemark = document.getElementById("gaze-remark");
        if (gazeRemark) {
            gazeRemark.textContent = lookAwayCount > 0
                ? `⚠ You looked away ${lookAwayCount} time(s) during the interview.`
                : "✓ Good eye contact maintained throughout.";
        }

        // Update verdict
        const verdictEl = document.querySelector(".summary-card p");
        if (verdictEl) verdictEl.textContent = data.overallVerdict;

        // Render per-question breakdown
        const breakdownEl = document.querySelector(".breakdown");
        if (breakdownEl && data.breakdown) {
            breakdownEl.innerHTML = "";
            data.breakdown.forEach((item, i) => {
                breakdownEl.innerHTML += `
                <div class="glass-card breakdown-card" style="margin-bottom:1rem;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:0.8rem;">
                        <h3 style="font-size:0.95rem;color:#e2e8f0;line-height:1.4;">Q${i + 1}: ${item.question}</h3>
                        <span class="badge ${item.badge}" style="white-space:nowrap;">Score: ${item.score}</span>
                    </div>
                    <p class="feedback-text"><i class="fa-solid fa-comment"></i> ${item.feedback}</p>
                </div>`;
            });
        }
    }

     // Smoothly animate the circular progress from 0 → target
    function animateScore(circleId, scoreId, target) {
        const circle = document.getElementById(circleId);
        const scoreEl = document.getElementById(scoreId);
        if (!circle || !scoreEl) return;

        let current = 0;
        const step = target / 60; // ~60 frames
        const interval = setInterval(() => {
            current = Math.min(current + step, target);
            const pct = Math.round(current);
            circle.style.setProperty("--percent", pct + "%");
            scoreEl.textContent = pct + "%";
            if (current >= target) clearInterval(interval);
        }, 16); // ~60fps
    }
 
    function updateCircleColor(circleId, score) {
        const circle = document.getElementById(circleId);
        if (!circle) return;
        circle.classList.remove("warning-circle", "danger-circle");
        if (score < 40) {
            circle.classList.add("danger-circle");
        } else if (score < 70) {
            circle.classList.add("warning-circle");
        }
    }

    function renderFallbackScorecard() {
        // Reset scores to 0 — never show fake hardcoded numbers
        animateScore("tech-circle", "tech-score", 0);
        animateScore("comm-circle", "comm-score", 0);
        updateCircleColor("tech-circle", 0);
        updateCircleColor("comm-circle", 0);
        const verdictEl = document.getElementById("verdict-text");
        if (verdictEl) verdictEl.textContent = "Interview completed. Unable to generate AI feedback right now — please check your connection and try again.";
        const breakdownEl = document.getElementById("breakdown-container");
        if (breakdownEl) breakdownEl.innerHTML = `<div class="glass-card" style="text-align:center;padding:2rem;color:var(--warning);"><i class="fa-solid fa-triangle-exclamation"></i> Could not load AI feedback.</div>`;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // WEBCAM + GAZE DETECTION
    // ═════════════════════════════════════════════════════════════════════════

    async function startWebcam() {
        try {
            webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });
            videoElement.srcObject = webcamStream;
            startGazeDetection();
        } catch (err) {
            console.error("Webcam denied:", err);
            const pip = document.getElementById("webcam-pip");
            if (pip) pip.innerHTML = '<p style="color:#ef4444;font-size:0.7rem;padding:10px;text-align:center;">Camera blocked</p>';
        }
    }

    async function startGazeDetection() {
        showLoading("Initializing anti-cheat systems...");
        
        let faceApiLoaded = false;
        try {
            // Load Face API
            await faceapi.nets.tinyFaceDetector.loadFromUri(
                "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"
            );
            faceApiLoaded = true;
        } catch (e) {
            console.warn("Face-API unavailable:", e);
        }

        try {
            // Load Object Detector
            if (typeof cocoSsd !== 'undefined') {
                objectDetector = await cocoSsd.load();
            } else {
                console.error("COCO-SSD library is missing!");
            }
        } catch (e) {
            console.warn("COCO-SSD unavailable:", e);
        }
        
        hideLoading();
        gazeDetectionActive = true;

        if (faceApiLoaded || objectDetector) {
            runDetectionLoop(faceApiLoaded);
        } else {
            runSimulatedGaze();
        }
    }

    function runDetectionLoop(faceApiLoaded) {
        detectionInterval = setInterval(async () => {
            if (!gazeDetectionActive) return;
            try {
                // 1. Check for phone first
                if (objectDetector) {
                    // lower threshold to 0.3 to catch more phones, sometimes phones look like remotes to the AI
                    const objects = await objectDetector.detect(videoElement, 10, 0.3);
                    const phoneDetected = objects.some(obj => obj.class === "cell phone" || obj.class === "remote");
                    if (phoneDetected) {
                        cancelInterviewDueToPhone();
                        return; // Skip face detection this frame
                    }
                }

                // 2. Check for face
                if (faceApiLoaded) {
                    const detections = await faceapi.detectAllFaces(
                        videoElement,
                        new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.4 })
                    );
                    if (detections.length === 0) {
                        if (!lookAwayTimer) {
                            updateGazeUI("warning", "Looking away...");
                            lookAwayTimer = setTimeout(() => triggerWarning("Look away detected! Please keep your eyes on the screen."), 2000);
                        }
                    } else {
                        clearTimeout(lookAwayTimer);
                        lookAwayTimer = null;
                        updateGazeUI("ok", "Eyes on screen ✓");
                    }
                }
            } catch (e) { }
        }, 500);
    }



    function runSimulatedGaze() {
        updateGazeUI("ok", "Monitoring...");
        setTimeout(() => {
            if (gazeDetectionActive) triggerWarning("Look away detected! Please keep your eyes on the screen.");
        }, 15000);
    }

    function updateGazeUI(state, text) {
        if (!gazeLabel) return;
        gazeLabel.textContent = text;
        gazeStatus.className = "gaze-status";
        if (state === "warning") gazeStatus.classList.add("warning");
        if (state === "danger") gazeStatus.classList.add("danger");
    }

    function triggerWarning(customMessage) {
        if (!gazeDetectionActive) return;
        lookAwayCount++;
        if (lookAwayCount >= MAX_WARNINGS) { cancelInterview(); return; }

        warningText.textContent = customMessage;
        warningCountBadge.textContent = `Warning ${lookAwayCount} of ${MAX_WARNINGS - 1}`;
        warningOverlay.classList.remove("hidden");
        updateGazeUI("danger", `⚠ Warning ${lookAwayCount}/${MAX_WARNINGS - 1}`);

        clearTimeout(warningTimer);
        warningTimer = setTimeout(() => {
            warningOverlay.classList.add("hidden");
            updateGazeUI("ok", "Eyes on screen ✓");
            lookAwayTimer = null;
        }, 3000);
    }

    function cancelInterviewDueToPhone() {
        const reasonText = document.querySelector(".cancelled-box p");
        if (reasonText) {
            reasonText.innerHTML = "<strong>Violation Detected:</strong> A cell phone was caught on camera. Your interview has been instantly terminated.";
            reasonText.style.color = "#ef4444";
        }
        cancelInterview();
    }

    function cancelInterview() {
        gazeDetectionActive = false;
        clearInterval(detectionInterval);
        clearTimeout(lookAwayTimer);
        clearTimeout(warningTimer);
        if (webcamStream) webcamStream.getTracks().forEach(t => t.stop());
        warningOverlay.classList.add("hidden");
        cancelledOverlay.classList.remove("hidden");
    }

    function stopGazeDetection() {
        gazeDetectionActive = false;
        clearInterval(detectionInterval);
        clearTimeout(lookAwayTimer);
        clearTimeout(warningTimer);
    }

    // ─── HELPERS ─────────────────────────────────────────────────────────────

    function showLoading(msg) {
        if (loadingMsg) loadingMsg.textContent = msg;
        loadingState.classList.remove("hidden");
    }

    function hideLoading() {
        loadingState.classList.add("hidden");
    }

});


