import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, get } from 'firebase/database';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyChjTlYO3UcfK2nK6Efy5F71ekxnGjH5W8",
  authDomain: "firestudio-rebuild.firebaseapp.com",
  databaseURL: "https://firestudio-rebuild-default-rtdb.firebaseio.com",
  projectId: "firestudio-rebuild",
  storageBucket: "firestudio-rebuild.firebasestorage.app",
  messagingSenderId: "202782471810",
  appId: "1:202782471810:web:974edaa311d9d428a6269b",
  measurementId: "G-6ZBFKS1RL9"
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
