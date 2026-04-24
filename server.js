import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const OLLAMA_URL = "http://localhost:11434/api/chat";

app.post("/api/chat", async (req, res) => {
  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/", (req, res) => {
  res.send("API IA personnelle en ligne !");
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("API en ligne sur le port " + port));
