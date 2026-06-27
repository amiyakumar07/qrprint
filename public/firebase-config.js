// Firebase Configuration for QRPrint
const firebaseConfig = {
  apiKey: "AIzaSyAAHCJU-p5KhVR_9_nePAIK8Q5Tnf5wOdk",
  authDomain: "project-4bcf1ced-e226-40fa-b67.firebaseapp.com",
  projectId: "project-4bcf1ced-e226-40fa-b67",
  storageBucket: "project-4bcf1ced-e226-40fa-b67.firebasestorage.app",
  messagingSenderId: "1004189609646",
  appId: "1:1004189609646:web:544fb07bf760463539873f"
};

// Initialize Firebase if compat SDK is loaded
if (typeof firebase !== 'undefined') {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
}

// Global Auth Helper Object
window.FirebaseAuthHelper = {
  signUpWithEmail: async (email, password) => {
    try {
      const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
      return { success: true, user: userCredential.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  loginWithEmail: async (email, password) => {
    try {
      const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
      return { success: true, user: userCredential.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  signInWithGoogle: async () => {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      const userCredential = await firebase.auth().signInWithPopup(provider);
      return { success: true, user: userCredential.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  logout: async () => {
    try {
      await firebase.auth().signOut();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  onAuthStateChanged: (callback) => {
    if (typeof firebase !== 'undefined') {
      firebase.auth().onAuthStateChanged(callback);
    }
  }
};
