FROM ollama/ollama

RUN ollama pull mistral

COPY . .

CMD ["node", "server.js"]
