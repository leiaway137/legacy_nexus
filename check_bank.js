const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore/lite');

const firebaseConfig = {
  apiKey: "AIzaSyDQrCGz8pPoBB_LzX-1Wnj107rr-0BdpVw",
  projectId: "legacy-nexus-4b56d",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkBank() {
  try {
    const snap = await getDocs(collection(db, 'legacy_questions'));
    console.log("TOTAL_BANKED_QUESTIONS=" + snap.size);
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkBank();
