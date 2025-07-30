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

        <button
          v-if="currentNote.audioPath && gameState === 'askingTextPosition'"
          @click="playSound(currentNote.audioPath)"
          :disabled="isLoading || isPlayingAudio"
          class="replay-button"
        >
          Replay Sound
        </button>

        <div v-if="gameState === 'askingTextPosition'" class="question-group">
          <label for="note-name-guess">Note Name:</label>
          <input
            type="text"
            id="note-name-guess"
            v-model="userInputs.noteNameGuess"
            placeholder="e.g., C4"
          />
          <span
            v-if="userInputsChecked && !userInputs.noteNameCorrect"
            class="error-text"
          >
            Correct: {{ currentNote.note }}
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

          <button
            @click="checkTextPosition"
            :disabled="isLoading || isPlayingAudio"
          >
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
              :class="{
                'selected-sound': userInputs.soundGuessPos === index,
                'correct-sound':
                  showSoundFeedback && index === correctSoundPosition, // NEW: Correct answer
                'incorrect-sound':
                  showSoundFeedback &&
                  userInputs.soundGuessPos === index &&
                  !userInputs.soundCorrect, // NEW: User's wrong guess
              }"
              :disabled="isLoading || isPlayingAudio"
            >
              Play {{ index + 1 }}
            </button>
          </div>
          <button
            @click="checkSoundGuess"
            :disabled="
              isLoading || userInputs.soundGuessPos === null || isPlayingAudio
            "
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

        <button @click="startNewRound" :disabled="isLoading || isPlayingAudio">
          Next Round / Start Game
        </button>
      </div>

      <div v-else class="start-game-prompt">
        <p>Click "Start Game" to begin your musical ear training!</p>
        <button @click="startNewRound" :disabled="isLoading || isPlayingAudio">
          Start Game
        </button>
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
  noteNameGuess: "",
  positionGuess: null,
  soundGuessPos: null,
  noteNameCorrect: false,
  positionCorrect: false,
  soundCorrect: false,
});

const score = ref(0);
const totalRounds = ref(0);
const feedbackMessage = ref("");
const isLoading = ref(false); // To disable buttons during API calls
const gameState = ref("idle"); // 'idle', 'askingTextPosition', 'askingSound'
const userInputsChecked = ref(false); // To show errors after user checks answers
const showSoundFeedback = ref(false);

const isPlayingAudio = ref(false); // To track if audio is currently playing

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
      userInputs.noteNameCorrect && // NEW
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
  userInputs.noteNameGuess = "";
  userInputs.positionGuess = null;
  userInputs.soundGuessPos = null;
  userInputs.noteNameCorrect = false;
  userInputs.positionCorrect = false;
  userInputs.soundCorrect = false;
  feedbackMessage.value = "";
  userInputsChecked.value = false;
  guessNotesForSound.value = [];
  correctSoundPosition.value = null;
  showSoundFeedback.value = false;
};

const startNewRound = async () => {
  isLoading.value = true;
  resetInputsAndFeedback(); // Clear previous answers and feedback
  totalRounds.value++; // Increment total rounds

  try {
    const response = await axios.post(`${API_BASE_URL}/note/new`);
    Object.assign(currentNote, response.data); // Update currentNote reactive object
    playSound(currentNote.audioPath); // Automatically play the new note's audio

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
  userInputsChecked.value = true;
  try {
    const payload = {
      noteIdx: currentNote.idx,
      userNoteName: userInputs.noteNameGuess, // NEW
      userPosition: userInputs.positionGuess,
    };
    const response = await axios.post(
      `${API_BASE_URL}/note/check_text_position`,
      payload
    );

    userInputs.noteNameCorrect = response.data.noteNameCorrect; // NEW
    userInputs.positionCorrect = response.data.positionCorrect;

    if (
      response.data.noteNameCorrect && // UPDATED CONDITION
      response.data.positionCorrect
    ) {
      feedbackMessage.value =
        "Note Name and Position are CORRECT! Preparing sound test..."; // UPDATED MESSAGE
      score.value++;
      await prepareSoundTest();
    } else {
      feedbackMessage.value =
        "Some answers are incorrect. Review and click 'Next Round' to try again.";
    }
  } catch (error) {
    console.error("Error checking position:", error); // Updated message
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
  if (!audioPath) {
    console.warn("Attempted to play sound with empty audioPath.");
    return;
  }

  isPlayingAudio.value = true; // Set to true when playback begins

  const audio = new Audio(`http://localhost:8080${audioPath}`);

  audio.onended = () => {
    isPlayingAudio.value = false; // Set to false when playback ends naturally
  };

  audio.onerror = (e) => {
    isPlayingAudio.value = false; // Set to false if an error occurs
    console.error("Audio playback error:", e);
    feedbackMessage.value = "Error playing sound. Please try again."; // Inform user
  };

  audio.play().catch((e) => {
    isPlayingAudio.value = false; // Also set to false if play() itself returns a rejected promise
    console.error("Error initiating audio playback:", e);
    feedbackMessage.value =
      "Error initiating sound. Browser autoplay policy might be blocking.";
  });
};

const checkSoundGuess = async () => {
  isLoading.value = true;
  userInputsChecked.value = true; // Mark user inputs as checked
  showSoundFeedback.value = true;
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
  max-width: 1200px; /* Increase max-width to allow more horizontal space */
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
  display: flex; /* Use flexbox */
  flex-direction: row; /* Arrange items in a row */
  flex-wrap: wrap; /* Allow items to wrap to the next line on smaller screens */
  justify-content: center; /* Center items horizontally */
  align-items: flex-start; /* Align items to the top of the container */
  gap: 30px; /* Space between the two columns */
}

.staff-wrapper {
  position: relative;
  /* Allow it to grow, shrink, and take up roughly 50% of the available space */
  flex: 1 1 500px; /* flex-grow flex-shrink flex-basis (min-width before shrinking) */
  max-width: 600px; /* Maximum size for the image */
  min-width: 300px; /* Ensure it doesn't get too small before wrapping */
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
  /* Allow it to grow, shrink, and take up roughly 400px base space */
  flex: 1 1 400px;
  max-width: 450px; /* Adjust max-width if needed for inputs */
  min-width: 300px; /* Ensure it doesn't get too small */
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

    &.correct-sound {
      background-color: #28a745 !important; /* Green */
      border: 2px solid #1e7e34 !important;
      color: white;
    }

    &.incorrect-sound {
      background-color: #dc3545 !important; /* Red */
      border: 2px solid #bd2130 !important;
      color: white;
    }
  }
}

.error-text {
  color: #dc3545;
  font-size: 0.9em;
  margin-top: 5px;
}

.replay-button {
  background-color: #28a745 !important; /* Green color for replay */
  margin-bottom: 15px; /* Adds some space below the button */
  // Inherits other button styles from .question-group button
  &:hover:not(:disabled) {
    background-color: #218838 !important;
  }
}

.audio-status {
  font-weight: bold;
  color: #007bff; /* A nice blue color */
  margin-top: 10px;
  margin-bottom: 10px;
}
</style>
