import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGeminiConfig } from "../config.js";

const config = getGeminiConfig();

if (!config.apiKey) {
  console.warn("GEMINI_API_KEY is not set in .env");
}

const genAI = new GoogleGenerativeAI(config.apiKey || "dummy-key");

export async function generateTimestamps(params: {
  title: string;
  description: string;
  duration: number;
  url: string;
  transcript?: string;
}): Promise<{ start_seconds: number; title: string }[]> {
  const { title, description, duration, url, transcript } = params;

  let prompt =
`You are a YouTube timestamp generator. Create logical chapter timestamps with topic labels for the given video.

Title: ${title}
URL: ${url}
Description: ${description}
Duration: ${duration} seconds`;

  if (transcript) {
    prompt += `\n\nTranscript:\n${transcript.slice(0, 50000)}`;
  }

  prompt +=

`\n\nGenerate timestamps as a valid JSON array of objects with "start_seconds" (number) and "title" (string).
- First timestamp must start at 0
- Each section at least 30 seconds apart
- Cover the full duration logically
- Return ONLY the raw JSON array, no markdown, no code fences, no extra text`;

  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const cleanJson = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*$/g, "")
    .trim();

  try {
    const timestamps = JSON.parse(cleanJson) as { start_seconds: number; title: string }[];
    if (!Array.isArray(timestamps) || timestamps.length === 0) {
      throw new Error("Gemini returned empty or invalid array");
    }
    return timestamps;
  } catch (err) {
    throw new Error(`Failed to parse Gemini response: ${(err as Error).message}`);
  }
}
