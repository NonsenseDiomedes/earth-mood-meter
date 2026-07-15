// ============================================================
// script.js
// Handles all interactive behavior for Earth Mood Meter:
//   - Casting a mood vote (once every 12 hours, via localStorage)
//   - Animating the live mood statistics bars
//   - Sending and displaying anonymous community messages
// ============================================================

import {
  MOOD_LIST,
  listenToMoodStats,
  castMoodVote,
  listenToCommunityMessages,
  submitCommunityMessage,
} from "./firebase.js";

// How long a visitor must wait between votes (12 hours, in milliseconds).
const VOTE_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const LAST_VOTE_KEY = "earthMoodMeter_lastVoteTimestamp";

// ---------- Grab DOM elements we'll need repeatedly ----------
const moodGrid = document.getElementById("moodGrid");
const moodButtons = Array.from(document.querySelectorAll(".mood-btn"));
const voteConfirmation = document.getElementById("voteConfirmation");
const pulseBars = document.getElementById("pulseBars");
const pulseNumber = document.getElementById("pulseNumber");
const messageInput = document.getElementById("messageInput");
const charCount = document.getElementById("charCount");
const sendBtn = document.getElementById("sendBtn");
const messageFeed = document.getElementById("messageFeed");
const feedEmpty = document.getElementById("feedEmpty");

// ============================================================
// VOTING
// ============================================================

// Check localStorage to see if the visitor already voted within
// the last 12 hours. Returns the number of milliseconds remaining
// on the cooldown, or 0 if they're free to vote.
function getRemainingCooldownMs() {
  const lastVote = localStorage.getItem(LAST_VOTE_KEY);
  if (!lastVote) return 0;

  const elapsed = Date.now() - Number(lastVote);
  const remaining = VOTE_COOLDOWN_MS - elapsed;
  return remaining > 0 ? remaining : 0;
}

// Turns milliseconds into a friendly "Xh Ym" string.
function formatDuration(ms) {
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// Disable voting buttons and show a countdown message if the
// visitor is still on cooldown from a previous vote.
function applyVoteLockState() {
  const remaining = getRemainingCooldownMs();

  if (remaining > 0) {
    moodButtons.forEach((btn) => (btn.disabled = true));
    voteConfirmation.textContent = `You've already shared your mood. Come back in ${formatDuration(remaining)}.`;
    voteConfirmation.classList.add("visible");
    return true;
  }

  moodButtons.forEach((btn) => (btn.disabled = false));
  return false;
}

// Handle a click on any mood button.
async function handleMoodClick(event) {
  const button = event.currentTarget;
  const moodKey = button.dataset.mood;

  // Guard against double-clicks or an already-expired cooldown check.
  if (getRemainingCooldownMs() > 0) return;

  // Immediately lock the UI so the visitor can't double-vote
  // while the network request is in flight.
  moodButtons.forEach((btn) => (btn.disabled = true));
  button.classList.add("selected");

  try {
    await castMoodVote(moodKey);
    localStorage.setItem(LAST_VOTE_KEY, String(Date.now()));

    voteConfirmation.textContent = "Thank you for sharing your mood ❤️";
    voteConfirmation.classList.add("visible");
  } catch (error) {
    console.error("Could not record vote:", error);
    voteConfirmation.textContent = "Something went wrong. Please try again in a moment.";
    voteConfirmation.classList.add("visible");
    // Re-enable buttons so the visitor can retry, since the vote didn't go through.
    moodButtons.forEach((btn) => (btn.disabled = false));
    button.classList.remove("selected");
  }
}

moodButtons.forEach((btn) => btn.addEventListener("click", handleMoodClick));

// Check the vote lock state as soon as the page loads.
applyVoteLockState();

// ============================================================
// LIVE MOOD STATISTICS (animated bars)
// ============================================================

// Build the row elements once; we'll update their widths whenever
// Firestore sends new data instead of rebuilding the whole list.
function buildPulseRows() {
  MOOD_LIST.forEach((mood) => {
    const row = document.createElement("div");
    row.className = "pulse-row";
    row.innerHTML = `
      <div class="pulse-label">
        <span class="pulse-label-emoji">${mood.emoji}</span>
        <span>${mood.label}</span>
      </div>
      <div class="pulse-track">
        <div class="pulse-fill" id="fill-${mood.key}" style="--fill-color:${moodColor(mood.key)}"></div>
      </div>
      <div class="pulse-percent" id="percent-${mood.key}">0%</div>
    `;
    pulseBars.appendChild(row);
  });
}

// Maps each mood to the accent color used for its bar's glow,
// matching the colors used on the mood buttons above.
function moodColor(moodKey) {
  const colorMap = {
    happy: "var(--mood-amber)",
    calm: "var(--mood-teal)",
    okay: "var(--mood-violet)",
    tired: "var(--mood-slate)",
    sad: "var(--mood-blue)",
    angry: "var(--mood-coral)",
  };
  return colorMap[moodKey] || "var(--mood-teal)";
}

buildPulseRows();

// Update the bars and total count whenever Firestore reports new numbers.
listenToMoodStats((counts) => {
  const total = MOOD_LIST.reduce((sum, mood) => sum + (counts[mood.key] || 0), 0);

  pulseNumber.textContent = total.toLocaleString("en-US");

  MOOD_LIST.forEach((mood) => {
    const count = counts[mood.key] || 0;
    const percent = total > 0 ? Math.round((count / total) * 100) : 0;

    const fillEl = document.getElementById(`fill-${mood.key}`);
    const percentEl = document.getElementById(`percent-${mood.key}`);

    if (fillEl) fillEl.style.width = `${percent}%`;
    if (percentEl) percentEl.textContent = `${percent}%`;
  });
});

// ============================================================
// COMMUNITY FEELINGS (anonymous message board)
// ============================================================

// Keep the "characters left" counter in sync as the visitor types.
messageInput.addEventListener("input", () => {
  const remaining = 300 - messageInput.value.length;
  charCount.textContent = `${remaining} characters left`;
});

// Send a new anonymous message.
async function handleSendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  sendBtn.disabled = true;

  try {
    await submitCommunityMessage(text);
    messageInput.value = "";
    charCount.textContent = "300 characters left";
  } catch (error) {
    console.error("Could not send message:", error);
  } finally {
    sendBtn.disabled = false;
  }
}

sendBtn.addEventListener("click", handleSendMessage);

// Turns a Firestore timestamp into a friendly "X minutes ago" string.
function timeAgo(timestamp) {
  if (!timestamp || !timestamp.toDate) return "just now";

  const seconds = Math.floor((Date.now() - timestamp.toDate().getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// Safely inserts message text as plain text (never as HTML), so a
// visitor can't post markup or scripts into the shared feed.
function createMessageCard(messageData) {
  const card = document.createElement("div");
  card.className = "message-card";

  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.innerHTML = `
    <span class="message-anon">Anonymous</span>
    <span class="message-time">${timeAgo(messageData.timestamp)}</span>
  `;

  const text = document.createElement("p");
  text.className = "message-text";
  text.textContent = messageData.message; // textContent avoids any HTML injection

  card.appendChild(meta);
  card.appendChild(text);
  return card;
}

// Render the full message feed whenever Firestore sends an update.
listenToCommunityMessages((messages) => {
  messageFeed.innerHTML = "";

  if (messages.length === 0) {
    messageFeed.appendChild(feedEmpty);
    return;
  }

  messages.forEach((messageData) => {
    messageFeed.appendChild(createMessageCard(messageData));
  });
});
