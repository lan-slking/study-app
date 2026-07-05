# Notes App

A simple notes app built with React and Vite. Notes are kept in memory (React state),
so they reset whenever you refresh the page.

## Features

- Sidebar listing all notes
- Add a new note
- Delete a note
- Edit the title and content of the selected note

## Project structure

- `src/App.jsx` — top-level component; owns the notes state and passes it down
- `src/Sidebar.jsx` — renders the note list, "New Note" button, and delete buttons
- `src/NoteEditor.jsx` — renders the title/content inputs for the selected note

## Getting started

```bash
npm install
npm run dev
```

Then open the URL Vite prints in the terminal (usually http://localhost:5173).
