import { Router, Request, Response } from "express";
import * as admin from "firebase-admin";
import { getFirebaseConfig } from "../config.js";

interface SignupBody {
  name?: string;
  email?: string;
  password?: string;
}

interface LoginBody {
  email?: string;
  password?: string;
}

const router = Router();

router.post("/auth/signup", async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body as SignupBody;

    if (!name || !email || !password) {
      res.status(400).json({ error: "name, email, and password are required" });
      return;
    }

    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });

    await admin.firestore().collection("users").doc(userRecord.uid).set({
      name,
      email,
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({
      message: "User created",
      user: { name, email, uid: userRecord.uid },
    });
  } catch (error: any) {
    const message = error.code === "auth/email-already-exists"
      ? "Email already registered"
      : error.message || "Internal server error";
    res.status(400).json({ error: message });
  }
});

router.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as LoginBody;

    if (!email || !password) {
      res.status(400).json({ error: "email and password are required" });
      return;
    }

    const config = getFirebaseConfig();
    const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;

    const endpoint = authEmulatorHost
      ? `http://${authEmulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=any-key`
      : `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.apiKey}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });

    const data = await response.json();

    if (!response.ok) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const userDoc = await admin.firestore().collection("users").doc(data.localId).get();
    const userData = userDoc.data();

    res.status(200).json({
      message: "Logged in",
      uid: data.localId,
      email: data.email,
      name: userData?.name || "",
      token: data.idToken,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Internal server error" });
  }
});

export default router;
