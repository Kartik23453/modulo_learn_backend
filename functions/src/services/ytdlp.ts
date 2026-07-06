import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

interface ChapterData {
  start_time: number;
  end_time: number;
  title: string;
}

interface YtDlpOutput {
  title: string;
  description: string;
  duration: number;
  thumbnail: string;
  webpage_url: string;
  chapters: ChapterData[] | null;
  subtitles: Record<string, { ext: string; url: string }[]>;
  automatic_captions: Record<string, { ext: string; url: string }[]>;
  playlist_title?: string;
}

export interface VideoInfo {
  title: string;
  description: string;
  duration: number;
  thumbnail: string;
  url: string;
  chapters: { start_seconds: number; title: string }[] | null;
  subtitles: Record<string, { ext: string; url: string }[]>;
  automatic_captions: Record<string, { ext: string; url: string }[]>;
}

export async function getVideoInfo(url: string): Promise<VideoInfo> {
  const { stdout } = await execFileAsync("yt-dlp", [
    "--dump-json", "--no-download", url,
  ], { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });

  const data: YtDlpOutput = JSON.parse(stdout.trim().split("\n")[0]);

  return {
    title: data.title,
    description: data.description || "",
    duration: data.duration || 0,
    thumbnail: data.thumbnail || "",
    url: data.webpage_url,
    chapters: data.chapters?.length
      ? data.chapters.map((ch) => ({
          start_seconds: Math.floor(ch.start_time),
          title: ch.title,
        }))
      : null,
    subtitles: data.subtitles || {},
    automatic_captions: data.automatic_captions || {},
  };
}

export async function getPlaylistVideos(url: string): Promise<{
  title: string;
  videos: VideoInfo[];
}> {
  const { stdout } = await execFileAsync("yt-dlp", [
    "--dump-json", "--no-download", url,
  ], { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 });

  const lines = stdout.trim().split("\n").filter(Boolean);
  const playlistTitle = JSON.parse(lines[0]).playlist_title || "Untitled Playlist";

  const videos = lines.map((line) => {
    const data: YtDlpOutput = JSON.parse(line);
    return {
      title: data.title,
      description: data.description || "",
      duration: data.duration || 0,
      thumbnail: data.thumbnail || "",
      url: data.webpage_url,
      chapters: data.chapters?.length
        ? data.chapters.map((ch) => ({
            start_seconds: Math.floor(ch.start_time),
            title: ch.title,
          }))
        : null,
      subtitles: data.subtitles || {},
      automatic_captions: data.automatic_captions || {},
    };
  });

  return { title: playlistTitle, videos };
}

export async function getTranscript(info: VideoInfo): Promise<string | null> {
  const subSource = info.subtitles?.en || info.automatic_captions?.en;
  if (!subSource?.length) return null;

  const vttSource = subSource.find((s) => s.ext === "vtt") || subSource[0];
  if (!vttSource?.url) return null;

  try {
    const response = await fetch(vttSource.url);
    const vtt = await response.text();
    return parseVtt(vtt);
  } catch {
    return null;
  }
}

function parseVtt(vtt: string): string {
  return vtt
    .replace(/WEBVTT.*?\n\n/, "")
    .replace(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}.*/g, "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n")
    .trim();
}

export function isPlaylistUrl(url: string): boolean {
  return /[?&]list=/i.test(url) || /youtube\.com\/playlist\?/i.test(url);
}
