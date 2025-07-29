<template>
  <div class="game-container">
    <h1>Musical Ear Trainer</h1>

    <div class="score-area">Score: {{ score }} / {{ totalRounds }}</div>

    <div
      class="feedback-area"
      :class="{ correct: isCorrect, incorrect: !isCorrect && feedbackMessage }"
    >
      {{ feedbackMessage }}
    </div>

    <div class="game-board">
      <div class="staff-wrapper">
        <img
          :src="staffImageSrc"
          alt="Musical Staff"
          class="musical-staff-image"
          @click="handleStaffClick"
        />
        <div
          v-if="showCorrectPositionHint && !userInputs.positionCorrect"
          class="correct-position-hint"
          :style="correctPositionHintStyle"
        ></div>
      </div>

      <div v-if="currentNote.note" class="note-info-section">
        <p>Listen to the note and identify its properties!</p>

        <div v-if="gameState === 'askingTextPosition'" class="question-group">
          <label for="next-note">Next Note:</label>
          <input
            type="text"
            id="next-note"
            v-model="userInputs.nextNoteGuess"
            placeholder="e.g., Db4"
          />
          <span
            v-if="userInputsChecked && !userInputs.nextNoteCorrect"
            class="error-text"
          >
            Correct: {{ currentNote.nextNote }}
          </span>

          <label for="previous-note">Previous Note:</label>
          <input
            type="text"
            id="previous-note"
            v-model="userInputs.previousNoteGuess"
            placeholder="e.g., B3"
          />
          <span
            v-if="userInputsChecked && !userInputs.previousNoteCorrect"
            class="error-text"
          >
            Correct: {{ currentNote.previousNote }}
          </span>

          <p>Click on the staff to mark the position of the note.</p>
          <input
            type="number"
            id="position-guess"
            v-model.number="userInputs.positionGuess"
            placeholder="Position (1-29)"
            disabled
          />
          <span
            v-if="userInputsChecked && !userInputs.positionCorrect"
            class="error-text"
          >
            Correct: {{ currentNote.position }}
          </span>

          <button @click="checkTextPosition" :disabled="isLoading">
            Check Answers
          </button>
        </div>

        <div v-if="gameState === 'askingSound'" class="question-group">
          <h3>Listen and Identify the Original Note!</h3>
          <div class="sound-guess-buttons">
            <button
              v-for="(note, index) in guessNotesForSound"
              :key="index"
              @click="
                playSound(note.audioPath);
                userInputs.soundGuessPos = index;
              "
              :class="{ 'selected-sound': userInputs.soundGuessPos === index }"
              :disabled="isLoading"
            >
              Play {{ index + 1 }}
            </button>
          </div>
          <button
            @click="checkSoundGuess"
            :disabled="isLoading || userInputs.soundGuessPos === null"
          >
            Submit Sound Guess
          </button>
          <span
            v-if="userInputsChecked && !userInputs.soundCorrect"
            class="error-text"
          >
            Incorrect Sound.
          </span>
        </div>

        <button @click="startNewRound" :disabled="isLoading">
          Next Round / Start Game
        </button>
      </div>

      <div v-else class="start-game-prompt">
        <p>Click "Start Game" to begin your musical ear training!</p>
        <button @click="startNewRound" :disabled="isLoading">Start Game</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from "vue";
import axios from "axios";
// import { useRouter } from "vue-router";

// --- Configuration ---
const API_BASE_URL = "http://localhost:8080/api";
const STAFF_IMAGE_PATH = "/img/staff.png"; // Path to your staff image in /public/img/

// !!! IMPORTANT: Adjust these (x,y) coordinates based on YOUR specific staff.png image. !!!
// How to find them:
// 1. Run the frontend (`npm run serve`).
// 2. Open browser developer tools (F12).
// 3. Click on the staff image where each note position (1-29) should be.
// 4. Observe the `console.log` output: "Clicked at: x=..., y=..."
// 5. Update the map below with the accurate (x, y) for each position.
//    'x' will likely be constant (center of the staff), 'y' will change (decreasing for higher notes).
const positionPixelMap = {
  // Estimated for a staff image around 600px wide, and notes spread vertically
  // from roughly y=380 (position 1) to y=40 (position 29).
  // Use this as a starting point, but MEASURE your own image!
  1: { x: 300, y: 380 }, // C2 (lowest on staff, highest Y)
  2: { x: 300, y: 367 }, // Db2
  3: { x: 300, y: 354 }, // D2
  4: { x: 300, y: 341 }, // Eb2
  5: { x: 300, y: 328 }, // E2
  6: { x: 300, y: 315 }, // F2
  7: { x: 300, y: 302 }, // Gb2
  8: { x: 300, y: 289 }, // G2
  9: { x: 300, y: 276 }, // Ab2
  10: { x: 300, y: 263 }, // A2
  11: { x: 300, y: 250 }, // Bb2
  12: { x: 300, y: 237 }, // B2
  13: { x: 300, y: 224 }, // C3
  14: { x: 300, y: 211 }, // Db3
  15: { x: 300, y: 198 }, // D3
  16: { x: 300, y: 185 }, // Eb3
  17: { x: 300, y: 172 }, // E3
  18: { x: 300, y: 159 }, // F3
  19: { x: 300, y: 146 }, // Gb3
  20: { x: 300, y: 133 }, // G3
  21: { x: 300, y: 120 }, // Ab3
  22: { x: 300, y: 107 }, // A3
  23: { x: 300, y: 94 }, // Bb3
  24: { x: 300, y: 81 }, // B3
  25: { x: 300, y: 68 }, // C4
  26: { x: 300, y: 55 }, // Db4
  27: { x: 300, y: 42 }, // D4
  28: { x: 300, y: 29 }, // Eb4
  29: { x: 300, y: 16 }, // C6 (highest on staff, lowest Y)
};

// --- Reactive State ---
// const router = useRouter(); // If you use router.push for navigation

const currentNote = reactive({
  idx: null,
  note: "",
  audioPath: "",
  nextNote: "",
  previousNote: "",
  position: null,
});

const userInputs = reactive({
  nextNoteGuess: "",
  previousNoteGuess: "",
  positionGuess: null, // Will be set by handleStaffClick
  soundGuessPos: null, // 0-indexed position of the sound chosen by user
  // Tracking correctness for UI feedback
  nextNoteCorrect: false,
  previousNoteCorrect: false,
  positionCorrect: false,
  soundCorrect: false,
});

const score = ref(0);
const totalRounds = ref(0);
const feedbackMessage = ref("");
const isLoading = ref(false); // To disable buttons during API calls
const gameState = ref("idle"); // 'idle', 'askingTextPosition', 'askingSound'
const userInputsChecked = ref(false); // To show errors after user checks answers

const guessNotesForSound = ref([]); // Array of notes for the sound test
const correctSoundPosition = ref(null); // The 0-indexed position of the actual note in guessNotesForSound

const staffImageSrc = computed(() => STAFF_IMAGE_PATH);

const isCorrect = computed(() => {
  // This computed property checks if ALL answers submitted in the current phase were correct.
  // It's used for dynamic feedback class.
  if (!userInputsChecked.value) {
    return false;
  }

  if (gameState.value === "askingTextPosition") {
    return (
      userInputs.nextNoteCorrect &&
      userInputs.previousNoteCorrect &&
      userInputs.positionCorrect
    );
  }
  if (gameState.value === "askingSound") {
    return userInputs.soundCorrect;
  }
  return false;
});

const showCorrectPositionHint = computed(() => {
  return (
    userInputsChecked.value &&
    gameState.value === "askingTextPosition" &&
    !userInputs.positionCorrect
  );
});

const correctPositionHintStyle = computed(() => {
  if (!currentNote.position || !positionPixelMap[currentNote.position]) {
    return {};
  }
  const pos = positionPixelMap[currentNote.position];
  return {
    left: `${pos.x}px`,
    top: `${pos.y}px`,
  };
});

// --- Methods ---

const resetInputsAndFeedback = () => {
  userInputs.nextNoteGuess = "";
  userInputs.previousNoteGuess = "";
  userInputs.positionGuess = null;
  userInputs.soundGuessPos = null;
  userInputs.nextNoteCorrect = false;
  userInputs.previousNoteCorrect = false;
  userInputs.positionCorrect = false;
  userInputs.soundCorrect = false;
  feedbackMessage.value = "";
  userInputsChecked.value = false;
  guessNotesForSound.value = [];
  correctSoundPosition.value = null;
};

const startNewRound = async () => {
  isLoading.value = true;
  resetInputsAndFeedback(); // Clear previous answers and feedback
  totalRounds.value++; // Increment total rounds

  try {
    const response = await axios.post(`${API_BASE_URL}/note/new`);
    Object.assign(currentNote, response.data); // Update currentNote reactive object
    feedbackMessage.value = "New note generated. Identify its properties!";
    gameState.value = "askingTextPosition"; // Move to the first phase
  } catch (error) {
    console.error("Error getting new note:", error);
    feedbackMessage.value = "Failed to get new note. Please try again.";
  } finally {
    isLoading.value = false;
  }
};

const checkTextPosition = async () => {
  isLoading.value = true;
  userInputsChecked.value = true; // Mark that user has submitted answers
  try {
    const payload = {
      noteIdx: currentNote.idx,
      userNext: userInputs.nextNoteGuess,
      userPrevious: userInputs.previousNoteGuess,
      userPosition: userInputs.positionGuess,
    };
    const response = await axios.post(
      `${API_BASE_URL}/note/check_text_position`,
      payload
    );

    // Update correctness flags based on backend response
    userInputs.nextNoteCorrect = response.data.nextCorrect;
    userInputs.previousNoteCorrect = response.data.previousCorrect;
    userInputs.positionCorrect = response.data.positionCorrect;

    // Provide feedback message
    if (
      response.data.nextCorrect &&
      response.data.previousCorrect &&
      response.data.positionCorrect
    ) {
      feedbackMessage.value =
        "All text and position answers are CORRECT! Preparing sound test...";
      score.value++; // Increment score only if all are correct in this phase
      // Automatically move to sound test phase
      await prepareSoundTest();
    } else {
      feedbackMessage.value =
        "Some answers are incorrect. Review and click 'Next Round' to try again.";
    }
  } catch (error) {
    console.error("Error checking text/position:", error);
    feedbackMessage.value = "Failed to check answers. Please try again.";
  } finally {
    isLoading.value = false;
  }
};

const handleStaffClick = (event) => {
  if (gameState.value !== "askingTextPosition" || isLoading.value) {
    return;
  }

  // Get the image element
  const img = event.target;
  const imgRect = img.getBoundingClientRect();

  // Calculate click coordinates relative to the image
  const x = event.clientX - imgRect.left;
  const y = event.clientY - imgRect.top;

  console.log(`Clicked at: x=${x}, y=${y}`); // For debugging and finding pixel positions

  // Find the closest notesPos based on y-coordinate
  let closestPosition = null;
  let minDistance = Infinity;

  for (const posNumStr in positionPixelMap) {
    const posNum = parseInt(posNumStr); // Ensure key is treated as number
    const mapPos = positionPixelMap[posNum];
    const distance = Math.abs(y - mapPos.y); // Primarily check Y distance
    if (distance < minDistance) {
      minDistance = distance;
      closestPosition = posNum;
    }
  }
  userInputs.positionGuess = closestPosition;
  feedbackMessage.value = `You selected position: ${closestPosition}`;
};

const prepareSoundTest = async () => {
  isLoading.value = true;
  try {
    const payload = { noteIdx: currentNote.idx };
    const response = await axios.post(
      `${API_BASE_URL}/note/prepare_sound_test`,
      payload
    );
    guessNotesForSound.value = response.data.guessNotes;
    correctSoundPosition.value = response.data.correctGuessPos;
    gameState.value = "askingSound"; // Transition to sound phase
    feedbackMessage.value =
      "Sound test ready! Listen and pick the original note.";
  } catch (error) {
    console.error("Error preparing sound test:", error);
    feedbackMessage.value = "Failed to prepare sound test. Please try again.";
  } finally {
    isLoading.value = false;
  }
};

const playSound = (audioPath) => {
  const audio = new Audio(`http://localhost:8080${audioPath}`); // Full path to backend
  audio.play().catch((e) => console.error("Error playing sound:", e));
};

const checkSoundGuess = async () => {
  isLoading.value = true;
  userInputsChecked.value = true; // Mark user inputs as checked
  try {
    const payload = {
      correctGuessPos: correctSoundPosition.value,
      userSoundGuessPos: userInputs.soundGuessPos,
    };
    const response = await axios.post(
      `${API_BASE_URL}/note/check_sound_guess`,
      payload
    );
    userInputs.soundCorrect = response.data.soundCorrect;

    if (response.data.soundCorrect) {
      feedbackMessage.value = "Sound guess is CORRECT! Well done!";
      // Score was already incremented if text/position were correct.
      // Decide if you want another point for sound if it's a separate "task"
      // score.value++; // Optional: add another point here if sound is a separate scoring task
    } else {
      feedbackMessage.value = "Incorrect sound. Time for the next round!";
    }
  } catch (error) {
    console.error("Error checking sound guess:", error);
    feedbackMessage.value = "Failed to check sound guess. Please try again.";
  } finally {
    isLoading.value = false;
  }
};

// --- Lifecycle Hooks ---
onMounted(() => {
  // You can automatically start a new round when the component mounts
  // Or keep it idle and wait for a "Start Game" button click
  // startNewRound();
});
</script>

<style scoped lang="scss">
.game-container {
  max-width: 800px;
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
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.staff-wrapper {
  position: relative; /* Essential for positioning the hint */
  width: 100%;
  max-width: 600px; /* Adjust based on your image size */
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
  width: 20px; /* Size of the circle */
  height: 20px;
  background-color: rgba(255, 0, 0, 0.6); /* Red with transparency */
  border-radius: 50%;
  transform: translate(-50%, -50%); /* Centers the circle on the (x,y) point */
  pointer-events: none; /* Allows clicks to pass through to the image */
  border: 2px solid red;
}

.note-info-section,
.start-game-prompt {
  background-color: #fff;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.05);
  width: 100%;
  max-width: 400px;
  text-align: left;
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
    flex: 1 1 auto; /* Allow buttons to grow/shrink */
    min-width: 100px;
    background-color: #6c757d;

    &:hover:not(:disabled) {
      background-color: #5a6268;
    }

    &.selected-sound {
      border: 2px solid #007bff; /* Highlight selected selected sound */
      box-shadow: 0 0 5px #007bff;
    }
  }
}

.error-text {
  color: #dc3545;
  font-size: 0.9em;
  margin-top: 5px;
}
</style>
