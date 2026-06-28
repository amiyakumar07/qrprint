// Firebase Configuration for PrintEase / QRPrint
const firebaseConfig = {
  apiKey: "AIzaSyAAHCJU-p5KhVR_9_nePAIK8Q5Tnf5wOdk",
  authDomain: "project-4bcf1ced-e226-40fa-b67.firebaseapp.com",
  projectId: "project-4bcf1ced-e226-40fa-b67",
  storageBucket: "project-4bcf1ced-e226-40fa-b67.firebasestorage.app",
  messagingSenderId: "1004189609646",
  appId: "1:1004189609646:web:544fb07bf760463539873f"
};

// Initialize Firebase
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
