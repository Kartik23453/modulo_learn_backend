import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, ".env") });

const { GoogleGenerativeAI } = await import("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateTimestamps(params) {
  const { title, description, duration, url, transcript } = params;
  let prompt = `You are a YouTube timestamp generator. Create logical chapter timestamps with topic labels for the given video.

Title: ${title}
URL: ${url}
Description: ${description}
Duration: ${duration} seconds`;

  if (transcript) prompt += `\n\nTranscript:\n${transcript.slice(0, 50000)}`;

  prompt += `\n\nGenerate timestamps as a valid JSON array of objects with "start_seconds" (number) and "title" (string).
- First timestamp must start at 0
- Each section at least 30 seconds apart
- Cover the full duration logically
- Return ONLY the raw JSON array, no markdown, no code fences, no extra text`;

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  console.log("Raw response:", text.slice(0, 300));

  const cleanJson = text.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
  const timestamps = JSON.parse(cleanJson);
  console.log("Parsed timestamps:", JSON.stringify(timestamps, null, 2));
  return timestamps;
}

generateTimestamps({
  title: "Introduction to JavaScript",
  description: "A beginner friendly guide to JavaScript programming",
  duration: 600,
  url: "https://youtube.com/watch?v=test123",
}).catch((e) => console.error("Error:", e.message));
