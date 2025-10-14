import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, get } from 'firebase/database';

// Firebase configuration
// You'll need to replace these with your actual Firebase config values
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "firestudio-rebuild.firebaseapp.com",
  databaseURL: "https://firestudio-rebuild-default-rtdb.firebaseio.com",
  projectId: "firestudio-rebuild",
  storageBucket: "firestudio-rebuild.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Helper function to read data from a path
export const readFirebaseData = async (path: string) => {
  const dataRef = ref(database, path);
  const snapshot = await get(dataRef);
  
  if (snapshot.exists()) {
    return snapshot.val();
  } else {
    console.log("No data available at path:", path);
    return null;
  }
};

// Helper function to listen to real-time updates
export const subscribeToPath = (path: string, callback: (data: any) => void) => {
  const dataRef = ref(database, path);
  
  const unsubscribe = onValue(dataRef, (snapshot) => {
    const data = snapshot.val();
    callback(data);
  });
  
  return unsubscribe;
};

export { database, ref, onValue, get };
