import { Router, Request, Response } from "express";
import {
  getVideoInfo,
  getPlaylistVideos,
  getTranscript,
  isPlaylistUrl,
  type VideoInfo,
} from "../services/ytdlp.js";
import { generateTimestamps } from "../services/gemini.js";

interface AskBody {
  url?: string;
}

const router = Router();

async function processVideo(info: VideoInfo) {
  if (info.chapters) {
    return {
      title: info.title,
      url: info.url,
      thumbnail: info.thumbnail,
      timestamps: info.chapters,
      source: "chapters" as const,
    };
  }

  const transcript = await getTranscript(info);
  const timestamps = await generateTimestamps({
    title: info.title,
    description: info.description,
    duration: info.duration,
    url: info.url,
    transcript: transcript || undefined,
  });

  return {
    title: info.title,
    url: info.url,
    thumbnail: info.thumbnail,
    timestamps,
    source: transcript ? "gemini+transcript" as const : "gemini" as const,
  };
}

router.post("/ask", async (req: Request, res: Response) => {
  try {
    const { url } = req.body as AskBody;

    if (!url) {
      res.status(400).json({ error: "url is required" });
      return;
    }

    if (isPlaylistUrl(url)) {
      const playlist = await getPlaylistVideos(url);
      const results = [];

      for (const video of playlist.videos) {
        const result = await processVideo(video);
        results.push(result);
      }

      res.json({
        type: "playlist",
        title: playlist.title,
        url,
        videos: results,
      });
    } else {
      const info = await getVideoInfo(url);
      const result = await processVideo(info);

      res.json({
        type: "video",
        title: result.title,
        url: result.url,
        thumbnail: result.thumbnail,
        timestamps: result.timestamps,
      });
    }
  } catch (error: any) {
    const message = error.message || "Internal server error";
    res.status(500).json({ error: message });
  }
});

export default router;
