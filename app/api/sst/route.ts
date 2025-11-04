// app/api/stt/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// This initializes the OpenAI client with your API key from .env.local
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        // Convert the file to a format Whisper can handle.
        // We pass the file and a "file" name which is required by the API.
        const transcription = await openai.audio.transcriptions.create({
            file: file,
            model: "whisper-1",
        });

        // Send the transcribed text back to the frontend
        return NextResponse.json({ transcript: transcription.text });
    } catch (error) {
        console.error("Error in STT route:", error);
        return NextResponse.json(
            { error: "Failed to transcribe audio" },
            { status: 500 }
        );
    }
}