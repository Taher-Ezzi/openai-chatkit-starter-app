// app/api/tts/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
    try {
        const { text } = await request.json();

        if (!text) {
            return NextResponse.json({ error: "No text provided" }, { status: 400 });
        }

        // Generate the speech audio
        const speechResponse = await openai.audio.speech.create({
            model: "tts-1", // You can also use "tts-1-hd"
            voice: "alloy", // Choose your preferred voice
            input: text,
            response_format: "mp3",
        });

        // Stream the audio file back to the frontend
        // We get the body as a ReadableStream and pass it to the Response
        if (speechResponse.body) {
            return new Response(speechResponse.body, {
                headers: {
                    "Content-Type": "audio/mpeg",
                },
            });
        } else {
            return NextResponse.json(
                { error: "Failed to generate speech" },
                { status: 500 }
            );
        }
    } catch (error) {
        console.error("Error in TTS route:", error);
        return NextResponse.json(
            { error: "Failed to generate speech" },
            { status: 500 }
        );
    }
}