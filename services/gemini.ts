
import { GoogleGenAI, Type } from "@google/genai";
import { Track } from "../types";

export const geminiService = {
  /**
   * Helper to get fresh instance of the AI client.
   * Ensures API key is read at call-time.
   */
  getClient() {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  },

  /**
   * Semantic Discovery: Search bar processing
   */
  async semanticDiscovery(query: string): Promise<Partial<Track>[]> {
    const ai = this.getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Search for music based on this mood/query: "${query}". 
      Return a list of 8 real songs. Prioritize YouTube Official Audio or Topic channels.
      Return the data in a clean structured format. 
      For "uri", provide a likely YouTube Video ID if you are highly confident, otherwise provide the search query.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              artist: { type: Type.STRING },
              uri: { type: Type.STRING, description: "YouTube Video ID (11 chars) or a specific search query" },
              genre: { type: Type.STRING },
              mood: { type: Type.STRING }
            },
            required: ["title", "artist", "uri"]
          }
        }
      }
    });

    try {
      return JSON.parse(response.text);
    } catch (e) {
      console.error("Discovery parsing failed", e);
      return [];
    }
  },

  /**
   * Healing Handshake: Resolve dead links
   */
  async resolveAlternativeAudio(track: Track): Promise<string | null> {
    const ai = this.getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `The YouTube track "${track.title} by ${track.artist}" is restricted or blocked. 
      Find an alternative Official Audio link or Topic channel version.
      Return a JSON object with a single field "searchQuery".`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            searchQuery: { type: Type.STRING }
          }
        }
      }
    });
    try {
      return JSON.parse(response.text).searchQuery;
    } catch {
      return null;
    }
  },

  /**
   * Local Analysis: Filename extraction
   */
  async analyzeLocalFile(filename: string): Promise<Partial<Track>> {
    const ai = this.getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze this filename: "${filename}". 
      Extract artist, song title, and suggest a genre. 
      Also provide a numeric seed for a cover image (1-1000).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            artist: { type: Type.STRING },
            genre: { type: Type.STRING },
            coverSeed: { type: Type.NUMBER }
          },
          required: ["title", "artist"]
        }
      }
    });

    try {
      const data = JSON.parse(response.text);
      return {
        title: data.title,
        artist: data.artist,
        genre: data.genre,
        coverUrl: `https://picsum.photos/seed/${data.coverSeed || Math.random()}/600/600`
      };
    } catch (e) {
      return {
        title: filename.split('.')[0],
        artist: 'Unknown',
        coverUrl: `https://picsum.photos/seed/music/600/600`
      };
    }
  }
};
