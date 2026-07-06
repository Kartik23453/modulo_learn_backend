/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {setGlobalOptions} from "firebase-functions/v2";
import {onRequest} from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import express from "express";
import cors from "cors";
import routes from "./routes/index.js";

admin.initializeApp();

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance.
setGlobalOptions({ maxInstances: 10 });

const app = express();

// Automatically allow cross-origin requests
app.use(cors({ origin: true }));

// Parse JSON bodies
app.use(express.json());

// Mount all routes
app.use(routes);

// Export the express app as an HTTP function
export const api = onRequest(app);
