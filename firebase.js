// ============================================================
// firebase.js
// This file connects Earth Mood Meter to Firebase Firestore.
// It handles:
//   1. Setting up the connection to your Firebase project
//   2. Reading and writing mood vote counts (moodStats collection)
//   3. Reading and writing community messages (communityMessages collection)
//
// You do NOT need to edit script.js or index.html to connect your
// own Firebase project — just fill in firebaseConfig below.
// ============================================================

// --- Firebase SDK imports (loaded from Google's CDN as ES Modules) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  onSnapshot,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ------------------------------------------------------------
// STEP 1: Paste your own Firebase project config here.
// Get this from: Firebase Console -> Project Settings -> General
// -> "Your apps" -> Web app -> SDK setup and configuration
// ------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyBEw7lLE_Xh5OF1hPH8Br-Qq5paF4FhZx0",
  authDomain: "earth-mood-meter-5d921.firebaseapp.com",
  projectId: "earth-mood-meter-5d921",
  storageBucket: "earth-mood-meter-5d921.firebasestorage.app",
  messagingSenderId: "846835061462",
  appId: "1:846835061462:web:31f78cec8f740592836f77",
  measurementId: "G-LEGC1GRD7C"
};

// Initialize Firebase and Firestore.
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// The list of moods used everywhere in the app.
// Keeping this in one place makes it easy to add/remove a mood later.
export const MOOD_LIST = [
  { key: "happy", emoji: "😊", label: "Happy" },
  { key: "calm", emoji: "😌", label: "Calm" },
  { key: "okay", emoji: "😐", label: "Okay" },
  { key: "tired", emoji: "😴", label: "Tired" },
  { key: "sad", emoji: "😔", label: "Sad" },
  { key: "angry", emoji: "😡", label: "Angry" },
];

// The single document that stores all mood vote counts.
// Path: moodStats/global  -> { happy: 155000, calm: 90000, ... }
const moodStatsRef = doc(db, "moodStats", "global");

// ------------------------------------------------------------
// One-time setup: if the moodStats document doesn't exist yet,
// create it with realistic starting numbers so the site doesn't
// look empty on launch day. This only runs once — after that,
// the document already exists and this is skipped.
// ------------------------------------------------------------
async function ensureMoodStatsSeeded() {
  const snapshot = await getDoc(moodStatsRef);
  if (snapshot.exists()) return; // Already seeded, nothing to do.

  // Roughly 500,000 votes spread naturally across moods.
  const seedData = {
    happy: 155000,
    calm: 90000,
    okay: 100000,
    tired: 70000,
    sad: 50000,
    angry: 35000,
  };

  await setDoc(moodStatsRef, seedData);
}
ensureMoodStatsSeeded();

// ------------------------------------------------------------
// Listen for live changes to the mood vote counts.
// Calls onUpdate(counts) every time the numbers change in Firestore,
// so the progress bars stay in sync for everyone viewing the site.
// ------------------------------------------------------------
export function listenToMoodStats(onUpdate) {
  return onSnapshot(moodStatsRef, (snapshot) => {
    if (snapshot.exists()) {
      onUpdate(snapshot.data());
    }
  });
}

// ------------------------------------------------------------
// Cast a vote for a given mood key ("happy", "calm", etc).
// Uses Firestore's increment() so simultaneous votes from many
// visitors around the world are counted safely.
// ------------------------------------------------------------
export async function castMoodVote(moodKey) {
  await updateDoc(moodStatsRef, {
    [moodKey]: increment(1),
  });
}

// ------------------------------------------------------------
// Community messages: anonymous, no accounts, newest first.
// ------------------------------------------------------------
const messagesCollectionRef = collection(db, "communityMessages");

// Listen for the most recent 50 messages, newest first.
// Calls onUpdate(messagesArray) every time a message is added.
export function listenToCommunityMessages(onUpdate) {
  const messagesQuery = query(
    messagesCollectionRef,
    orderBy("timestamp", "desc"),
    limit(50)
  );

  return onSnapshot(messagesQuery, (snapshot) => {
    const messages = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    onUpdate(messages);
  });
}

// Send a new anonymous message to Firestore.
export async function submitCommunityMessage(messageText) {
  await addDoc(messagesCollectionRef, {
    message: messageText,
    timestamp: serverTimestamp(),
  });
}
