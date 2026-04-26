import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyAf7baJAam7cnVezAtDPDJrxE5gnmyEo5s",
  authDomain: "maintech-v-1.firebaseapp.com",
  projectId: "maintech-v-1",
  storageBucket: "maintech-v-1.firebasestorage.app",
  messagingSenderId: "1044116721819",
  appId: "1:1044116721819:web:27365400a3ca85fefe763e",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
