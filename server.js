import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const client = new Anthropic();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/parse-pdf", upload.single("pdf"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(req.file.buffer);
    res.json({ text: data.text });
  } catch (err) {
    res.status(500).json({ error: "Failed to parse PDF" });
  }
});

app.post("/api/chat", async (req, res) => {
  const { messages, resume } = req.body;
  if (!resume) return res.status(400).json({ error: "Resume required" });
  if (!messages?.length) return res.status(400).json({ error: "Messages required" });

  const systemPrompt = `You are an expert job interviewer conducting a professional mock interview. The candidate has requested the following interview context:

<context>
${resume}
</context>

Your role:
- Tailor every question to the role, company, or scenario described above
- Ask behavioral questions (STAR format), technical questions, and situational questions relevant to the context
- Be professional but conversational — like a real interview, not an interrogation
- Probe deeper with natural follow-up questions based on their answers
- Occasionally challenge or push back constructively to see how they handle pressure
- Focus on one question at a time; don't flood them with multiple questions
- Briefly acknowledge their answer before moving to the next question
- After several rounds, offer brief, specific feedback on their responses

Start by greeting the candidate warmly and diving straight into your first question.`;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = client.messages.stream({
      model: "claude-opus-4-7",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Toastman running at http://localhost:${PORT}`));
