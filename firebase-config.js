/* Firebase settings for My Timetable premium. These values are public by design (every Firebase
   web app ships them); security comes from firestore.rules, not from hiding this file.
   Paste the web app config from Firebase console > Project settings > Your apps. */
window.FIREBASE_CONFIG={"apiKey": "AIzaSyC0e2oLYZifmeEpZvU4BNUVi44rVZSZ7U0", "authDomain": "my-timetable-511022.firebaseapp.com", "projectId": "my-timetable-511022", "storageBucket": "my-timetable-511022.firebasestorage.app", "messagingSenderId": "73763140137", "appId": "1:73763140137:web:bb783b70d22e71fc7d6238"};
window.PREMIUM_CONFIG={
  enabled:true,              // false = everything free, no sign-in (also what happens while FIREBASE_CONFIG is null)
  price:"₦2,500", per:"a month",
  WHATSAPP_NUMBERS:["2349125716579","2348106223294"],  // ← WhatsApp numbers for buying codes (country code, no +). One button each; numbers are never shown.
  whatsappText:"Hi, I want a My Timetable premium code",
  clearLocalOnLapse:false,   // true = when premium ends, remove premium data from the phone (kept in the account)
  emulator:null              // tests only: {auth:"127.0.0.1:9099",firestore:"127.0.0.1:8080"}
};
