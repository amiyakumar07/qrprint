// Firebase Configuration for PrintEase / QRPrint (Project: qrrprint)
const firebaseConfig = {
  apiKey: "AIzaSyDWax18q8g-QJ05Acs0e_tz-0WEESt6KKs",
  authDomain: "qrrprint.firebaseapp.com",
  projectId: "qrrprint",
  storageBucket: "qrrprint.firebasestorage.app",
  messagingSenderId: "702154396525",
  appId: "1:702154396525:web:dbf92975722cb6f924c064",
  measurementId: "G-JXKSRBS7KE"
};

// Initialize Firebase
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
