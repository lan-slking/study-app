# Notes App

A simple notes app built with React and Vite. Notes are kept in memory (React state),
so they reset whenever you refresh the page.

## Features

- Sidebar listing all notes
- Add a new note
- Delete a note
- Edit the title and content of the selected note
- Upload a photo of handwritten notes and have Gemini transcribe and organize
  it into the note's content

## Project structure

- `src/App.jsx` — top-level component; owns the notes state and passes it down
- `src/Sidebar.jsx` — renders the note list, "New Note" button, and delete buttons
- `src/NoteEditor.jsx` — renders the title/content inputs and the "Upload photo" button
- `server/` — minimal Express backend that sends uploaded photos to the Gemini API

## Getting started

### 1. Backend

```bash
cd server
npm install
cp .env.example .env   # then edit .env and add your GEMINI_API_KEY
npm start
```

The backend listens on http://localhost:3001 by default. See `server/.env.example`
for the required environment variables and where to get a free API key.

### 2. Frontend

```bash
npm install
npm run dev
```

Then open the URL Vite prints in the terminal (usually http://localhost:5173). The dev
server proxies `/api/*` requests to the backend (see `vite.config.js`), so both need to
be running for the "Upload photo" feature to work.
