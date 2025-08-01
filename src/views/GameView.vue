<template>
  <div class="game-container">
    <h1>Musical Ear Trainer</h1>

    <div class="score-area">
      Score: {{ score }} / {{ totalRounds }} | Left rounds:
      {{ MAX_ROUNDS - totalRounds }}
    </div>

    <div
      class="feedback-area"
      :class="{
        correct: feedbackType === 'correct',
        incorrect: feedbackType === 'incorrect',
      }"
    >
      {{ feedbackMessage }}
    </div>

    <div class="game-board">
      <div v-if="gameState === 'idle'" class="start-game-prompt">
        <p>Click "Start Game" to begin your musical ear training!</p>
        <button @click="startNewRound" :disabled="isLoading">Start Game</button>
      </div>

      <div v-else-if="gameState === 'gameOver'" class="game-over-screen">
        <h2>Game Over!</h2>
        <p>Your final score is: {{ score }} out of {{ MAX_ROUNDS }}</p>
        <button @click="resetGame" :disabled="isLoading">Play Again</button>
      </div>

      <div v-else-if="gameState === 'askingGuess'" class="note-info-section">
        <p>Listen to the note and identify its properties!</p>

        <button
          @click="replayCurrentNoteSound"
          :disabled="isLoading || isPlayingAudio"
          class="replay-button"
        >
          {{ isPlayingAudio ? "Playing..." : "Replay Sound" }}
        </button>

        <div class="question-group">
          <label for="code-guess">Note Code:</label>
          <input
            type="text"
            id="code-guess"
            v-model="userInputs.codeGuess"
            placeholder="e.g., C4"
            :disabled="isLoading"
          />

          <p>Click on the staff to mark the position of the note.</p>
          <label for="position-guess">Note Position:</label>
          <input
            type="number"
            id="position-guess"
            v-model.number="userInputs.positionGuess"
            placeholder="Position (1-29)"
            disabled
          />

          <button
            @click="checkUserChoices"
            :disabled="isLoading || isPlayingAudio"
          >
            Check Answers
          </button>
        </div>
      </div>

      <div
        v-else-if="gameState === 'showingFeedback'"
        class="note-info-section"
      >
        <p>Review your answers:</p>

        <button
          @click="replayCurrentNoteSound"
          :disabled="isLoading || isPlayingAudio"
          class="replay-button"
        >
          {{ isPlayingAudio ? "Playing..." : "Replay Sound" }}
        </button>

        <div class="question-group">
          <label for="code-guess">Note Code:</label>
          <input
            type="text"
            id="code-guess"
            v-model="userInputs.codeGuess"
            placeholder="e.g., C4"
            disabled
          />
          <span v-if="!userInputs.codeCorrect" class="error-text">
            Correct: {{ currentNote.code }}
          </span>

          <label for="position-guess">Note Position:</label>
          <input
            type="number"
            id="position-guess"
            v-model.number="userInputs.positionGuess"
            placeholder="Position (1-29)"
            disabled
          />
          <span v-if="!userInputs.positionCorrect" class="error-text">
            Correct: {{ currentNote.position }}
          </span>

          <button
            v-if="totalRounds < MAX_ROUNDS"
            @click="startNewRound"
            :disabled="isLoading || isPlayingAudio"
          >
            Next Round
          </button>
          <button
            v-else
            @click="resetGame"
            :disabled="isLoading || isPlayingAudio"
          >
            Finish Game
          </button>
        </div>
      </div>

      <div v-else class="loading-error-state">
        <p v-if="gameState === 'loading'">Loading game data...</p>
        <p v-else-if="gameState === 'error'">
          An error occurred. Please refresh or try again.
        </p>
        <p v-if="gameState === 'error'" class="error-text-full">
          <button @click="resetGame">Go to Start</button>
        </p>
      </div>

      <div
        class="staff-wrapper"
        v-if="gameState === 'askingGuess' || gameState === 'showingFeedback'"
      >
        <img
          :src="staffImageSrc"
          alt="Musical Staff"
          class="musical-staff-image"
          @click="handleStaffClick"
        />
        <div
          v-if="showCorrectPositionHint"
          class="correct-position-hint"
          :style="correctPositionHintStyle"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from "vue";
import axios from "axios";

// --- Configuration ---
const API_BASE_URL = "http://localhost:8080/api";
const STAFF_IMAGE_PATH = "/img/staff.png"; // Path to staff image in /public/img/
const MAX_ROUNDS = 3; // Define the maximum number of rounds for a game

// --- Position Pixel Map ---
// Maps note positions (1-29) to pixel coordinates on the staff image.
// C2 is at the bottom (highest Y), C6 is at the top (lowest Y).
const positionPixelMap = {
  1: { x: 288, y: 435 }, // C2 (lowest on staff, highest Y)
  2: { x: 288, y: 420 },
  3: { x: 288, y: 404 },
  4: { x: 288, y: 389 },
  5: { x: 288, y: 376 },
  6: { x: 288, y: 359 },
  7: { x: 288, y: 346 },
  8: { x: 288, y: 329 },
  9: { x: 288, y: 316 },
  10: { x: 288, y: 300 },
  11: { x: 288, y: 287 },
  12: { x: 288, y: 271 },
  13: { x: 288, y: 257 },
  14: { x: 288, y: 241 },
  15: { x: 288, y: 228 },
  16: { x: 288, y: 210 },
  17: { x: 288, y: 199 },
  18: { x: 288, y: 183 },
  19: { x: 288, y: 170 },
  20: { x: 288, y: 155 },
  21: { x: 288, y: 142 },
  22: { x: 288, y: 125 },
  23: { x: 288, y: 112 },
  24: { x: 288, y: 97 },
  25: { x: 288, y: 84 },
  26: { x: 288, y: 67 },
  27: { x: 288, y: 54 },
  28: { x: 288, y: 38 },
  29: { x: 288, y: 25 }, // C6 (highest on staff, lowest Y)
};

// --- Reactive State ---
const currentNote = reactive({
  idx: null,
  code: null,
  audioPath: null,
  position: null,
});

const userInputs = reactive({
  codeGuess: null,
  positionGuess: null,
  codeCorrect: false,
  positionCorrect: false,
});

const score = ref(0);
const totalRounds = ref(0);
const feedbackMessage = ref("");
const feedbackType = ref(""); // 'correct', 'incorrect', '' for no specific styling
const gameState = ref("idle"); // 'idle', 'askingGuess', 'showingFeedback', 'gameOver', 'error'

const isLoading = ref(false); // Controls loading state for API calls
const isPlayingAudio = ref(false); // Controls audio playback state

const staffImageSrc = computed(() => STAFF_IMAGE_PATH);

const showCorrectPositionHint = computed(() => {
  return feedbackType.value === "incorrect" && !userInputs.positionCorrect;
});

const correctPositionHintStyle = computed(() => {
  if (currentNote.position && positionPixelMap[currentNote.position]) {
    const { x, y } = positionPixelMap[currentNote.position];
    return {
      left: `${x}px`,
      top: `${y}px`,
    };
  }
  return {};
});

// --- Methods ---

const resetInputsAndFeedback = () => {
  userInputs.codeGuess = null;
  userInputs.positionGuess = null;
  userInputs.codeCorrect = false;
  userInputs.positionCorrect = false;
  feedbackMessage.value = "";
  feedbackType.value = "";
};

const startNewRound = async () => {
  if (totalRounds.value >= MAX_ROUNDS) {
    console.warn("Maximum rounds reached. Cannot start a new round.");
    gameState.value = "gameOver"; // Set to game over state
  }

  isLoading.value = true;
  resetInputsAndFeedback(); // Clear previous answers and feedback

  console.log("--- Starting New Round ---");

  try {
    const response = await axios.post(`${API_BASE_URL}/note/new`);
    Object.assign(currentNote, {
      idx: response.data.idx,
      code: response.data.code, // Map 'code' from backend to 'note' in frontend
      audioPath: response.data.audioPath,
      position: response.data.position,
    });
    console.log("currentNote updated:", currentNote);

    //await playSound(currentNote.audioPath); // Play the new note's audio

    feedbackMessage.value = "New note generated. Identify its properties!";
    feedbackType.value = "";
    gameState.value = "askingGuess"; // Transition to asking guess
  } catch (error) {
    console.error("Error getting new note:", error);
    feedbackMessage.value = "Failed to get new note. Please try again.";
    feedbackType.value = "incorrect";
    gameState.value = "error"; // Set to error state on failure
  } finally {
    isLoading.value = false;
  }
};

const handleStaffClick = (event) => {
  if (
    gameState.value !== "askingGuess" ||
    isLoading.value ||
    isPlayingAudio.value
  ) {
    return; // Only allow clicks in "askingGuess" state when not loading or playing audio
  }

  const img = event.target;
  const imgRect = img.getBoundingClientRect();

  const x = event.clientX - imgRect.left;
  const y = event.clientY - imgRect.top;

  let closestPosition = null;
  let minDistance = Infinity;
  let hasSetGuess = false;

  for (const posNumStr in positionPixelMap) {
    const posNum = parseInt(posNumStr);
    const mapPos = positionPixelMap[posNum];
    const distance = Math.abs(y - mapPos.y);
    const distanceX = Math.abs(x - mapPos.x);

    // Consider positions that are somewhat close in X as well (within 50 pixels)
    if (distance < minDistance && distanceX < 50) {
      minDistance = distance;
      closestPosition = posNum;
      hasSetGuess = true;
    }
  }

  if (hasSetGuess) {
    userInputs.positionGuess = closestPosition;
    feedbackMessage.value = `You selected position: ${closestPosition}`;
    feedbackType.value = "";
  } else {
    userInputs.positionGuess = null;
    feedbackMessage.value = "Click closer to the staff lines!";
    feedbackType.value = "incorrect";
  }
};

const playSound = async (audioPath) => {
  if (!audioPath) {
    console.warn("Attempted to play sound with empty audioPath.");
    return;
  }
  if (isPlayingAudio.value) return; // Prevent multiple audio plays

  isPlayingAudio.value = true;
  console.log("playSound: isPlayingAudio set to true");

  const audio = new Audio(`http://localhost:8080${audioPath}`);

  return new Promise((resolve, reject) => {
    audio.onended = () => {
      isPlayingAudio.value = false;
      console.log("playSound: isPlayingAudio set to false (onended)");
      resolve();
    };

    audio.onerror = (e) => {
      isPlayingAudio.value = false;
      console.error("Audio playback error:", e);
      feedbackMessage.value = "Error playing sound. Please try again.";
      feedbackType.value = "incorrect";
      reject(e);
    };

    audio.play().catch((e) => {
      isPlayingAudio.value = false;
      console.error("Error initiating audio playback:", e);
      feedbackMessage.value =
        "Error initiating sound. Browser autoplay policy might be blocking.";
      feedbackType.value = "incorrect";
      reject(e);
    });
  });
};

const replayCurrentNoteSound = async () => {
  await playSound(currentNote.audioPath);
};

// --- Frontend-only check user choices for Code and Position ---
const checkUserChoices = async () => {
  if (isLoading.value || isPlayingAudio.value) return;

  console.log(
    "checkUserChoices -- codeGuess:",
    userInputs.codeGuess,
    "positionGuess:",
    userInputs.positionGuess,
    "code:",
    currentNote.code,
    "position:",
    currentNote.position
  );

  // Perform local checks
  userInputs.codeCorrect =
    userInputs.codeGuess &&
    userInputs.codeGuess.toLowerCase() === currentNote.code.toLowerCase();

  userInputs.positionCorrect =
    userInputs.positionGuess === currentNote.position;

  const allCorrect = userInputs.codeCorrect && userInputs.positionCorrect;

  feedbackMessage.value = allCorrect
    ? "Note Code and Position are correct! Click Continue."
    : "Some answers are incorrect. Review your answers. Click Next Round or Continue.";
  feedbackType.value = allCorrect ? "correct" : "incorrect";

  if (allCorrect) {
    score.value++; // Increment score only if both are correct
  }

  gameState.value = "showingFeedback"; // Transition to showing text feedback
  console.log(
    "checkUserChoices: Finished local check. gameState set to:",
    gameState.value
  );

  totalRounds.value++;
};

const resetGame = () => {
  score.value = 0;
  totalRounds.value = 0;
  resetInputsAndFeedback();
  gameState.value = "idle";
  console.log("resetGame: Game state reset to idle.");
};

// --- Lifecycle Hooks ---
onMounted(() => {
  console.log("GameView mounted. Waiting for user to click Start Game.");
});
</script>

<style scoped lang="scss">
/* Your existing CSS styles remain here, no changes needed */
.game-container {
  max-width: 1200px;
  margin: 20px auto;
  padding: 20px;
  background-color: #f9f9f9;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  font-family: Arial, sans-serif;
  text-align: center;

  h1 {
    color: #333;
    margin-bottom: 20px;
  }
}

.score-area {
  font-size: 1.2em;
  font-weight: bold;
  margin-bottom: 15px;
  color: #555;
}

.feedback-area {
  min-height: 2em;
  margin-bottom: 20px;
  padding: 10px;
  border-radius: 4px;
  font-weight: bold;
  color: #333;
  background-color: #e0e0e0;
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;

  &.correct {
    background-color: #d4edda;
    color: #155724;
    border: 1px solid #c3e6cb;
  }

  &.incorrect {
    background-color: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
    animation: shake 0.5s;
    animation-iteration-count: 1;
  }
}

@keyframes shake {
  0% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-5px);
  }
  50% {
    transform: translateX(5px);
  }
  75% {
    transform: translateX(-5px);
  }
  100% {
    transform: translateX(0);
  }
}

.game-board {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-start;
  gap: 30px;
}

.staff-wrapper {
  position: relative;
  flex: 1 1 500px;
  max-width: 600px;
  min-width: 300px;
  height: auto;
}

.musical-staff-image {
  width: 100%;
  height: auto;
  cursor: pointer;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.correct-position-hint {
  position: absolute;
  width: 20px;
  height: 20px;
  background-color: rgba(255, 0, 0, 0.6);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  border: 2px solid red;
}

.note-info-section,
.start-game-prompt,
.game-over-screen,
.loading-error-state {
  background-color: #fff;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.05);
  flex: 1 1 400px;
  max-width: 450px;
  min-width: 300px;
  text-align: left;
}

.game-over-screen {
  padding: 40px;
  text-align: center;

  h2 {
    color: #333;
    margin-bottom: 20px;
    font-size: 2em;
  }

  p {
    font-size: 1.4em;
    color: #555;
    margin-bottom: 30px;
  }
}

.loading-error-state {
  text-align: center;
  padding: 50px 20px;
  p {
    font-size: 1.2em;
    font-weight: bold;
    color: #555;
  }
  button {
    margin-top: 20px;
    padding: 10px 20px;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 1em;
    &:hover:not(:disabled) {
      background-color: #0056b3;
    }
  }
}

.question-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;

  label {
    font-weight: bold;
    margin-top: 10px;
  }

  input[type="text"],
  input[type="number"] {
    padding: 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1em;
    &:disabled {
      background-color: #e9ecef;
      cursor: not-allowed;
    }
  }

  button {
    padding: 10px 15px;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 1em;
    margin-top: 10px;

    &:hover:not(:disabled) {
      background-color: #0056b3;
    }

    &:disabled {
      background-color: #cccccc;
      cursor: not-allowed;
    }
  }
}

.sound-guess-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  margin-top: 10px;

  button {
    flex: 1 1 auto;
    min-width: 100px;
    background-color: #6c757d;

    &:hover:not(:disabled) {
      background-color: #5a6268;
    }

    &.selected-sound {
      border: 2px solid #007bff;
      box-shadow: 0 0 5px #007bff;
    }

    &.correct-sound {
      background-color: #28a745 !important;
      border: 2px solid #1e7e34 !important;
      color: white;
    }

    &.incorrect-sound {
      background-color: #dc3545 !important;
      border: 2px solid #bd2130 !important;
      color: white;
    }
  }
}

.error-text {
  color: #dc3545;
  font-size: 0.9em;
  margin-top: 5px;
  text-align: left; /* Aligned with input fields */
}

.error-text-full {
  color: #dc3545;
  font-size: 0.9em;
  margin-top: 5px;
  text-align: center;
}

.replay-button {
  background-color: #28a745 !important;
  margin-bottom: 15px;
  margin-top: 10px;
  padding: 10px 15px;
  border-radius: 5px;
  &:hover:not(:disabled) {
    background-color: #218838 !important;
  }
}

.audio-status {
  font-weight: bold;
  color: #007bff;
  margin-top: 10px;
  margin-bottom: 10px;
}
</style>
