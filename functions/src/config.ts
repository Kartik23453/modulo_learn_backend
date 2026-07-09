import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

export function getFirebaseConfig() {
  return {
    apiKey: process.env.FIREBASE_API_KEY || "",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.FIREBASE_APP_ID || "",
  };
}

export function getGeminiConfig() {
  return {
    apiKey: process.env.GEMINI_API_KEY || "",
    models: [
      "gemini-3.1-flash-lite",
      "gemini-3-flash-preview",
      "gemini-2.0-flash-lite",
      "gemini-2.0-flash",
    ],
  };
}

export function getNeo4jConfig() {
  return {
    uri: process.env.AURADB_URI || "",
    user: process.env.AURADB_USER || "",
    password: process.env.AURADB_PASSWORD || "",
  };
}
