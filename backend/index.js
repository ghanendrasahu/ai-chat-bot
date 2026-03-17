import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json());

// initialize OpenAI client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // make sure you set this in your environment
});

app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    // send user message to GPT
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are Mira, a friendly AI girl who chats warmly." },
        { role: "user", content: message },
      ],
    });

    const reply = response.choices[0].message.content;
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.listen(3001, () => console.log("✅ Backend running on http://localhost:3001"));
