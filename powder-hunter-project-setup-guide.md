# Setting Up Your Powder Hunter Project in Claude.ai

Follow these steps in order. The whole thing should take about 10 minutes.

---

## Step 1: Create the Project

1. Go to **claude.ai/projects** in your browser
2. Click **"+ Create a Project"**
3. Name it: **Powder Hunter — Ski Resort Finder**
4. Add a description like: "Family ski trip planning tool. Building an auto-updating webapp from a 201-resort spreadsheet across Ikon, Epic, Indy, Mountain Collective, and Club Med passes."

## Step 2: Add Project Knowledge (your files)

In the project view, look for the **knowledge base** panel (right side). Click the **"+"** button and upload these files from `~/Projects/powder-hunter/`:

1. **ski-resort-project-notes.md** — this is your memory file with everything we've built, data sources, known issues, and next steps. Upload this first — it's the most important one.
2. **ski-resorts.xlsx** — the 201-resort spreadsheet (5 tabs: Ikon, Epic, Indy, Mountain Collective, Club Med)
3. **index.html** — the single-file webapp prototype with Google Maps integration
4. **ski-resort-guide.html** — companion guide

## Step 3: Add Custom Instructions

Still in the project settings, find the **"Custom Instructions"** field. Paste something like this:

```
You are helping me build "Powder Hunter," a family ski trip planning webapp.

Key context:
- I'm based in the DC area (WAS airports)
- Focus is family trips: kids ski free, ski school, daycare are key fields
- We have a 201-resort spreadsheet across 5 ski passes
- The current prototype is a single-file HTML app with hardcoded data
- Next goal: turn this into a proper webapp that auto-updates resort data

Always reference ski-resort-project-notes.md for project history and decisions.
When suggesting code, assume we'll be using Claude Code for implementation.
```

## Step 4: Move Relevant Past Chats into the Project

1. Go back to your main Claude.ai chat list
2. Find any past conversations about the ski resort finder (search for "ski," "Ikon," "resort," etc.)
3. For each relevant chat: click the **three-dot menu (...)** on the conversation → **"Move to project"** → select your new Powder Hunter project

Note: Cowork sessions won't appear here — that's fine, the memory file captures everything important from those.

## Step 5: Start a New Conversation in the Project

1. Open the Powder Hunter project
2. Click **"New chat"** within the project
3. Try asking something like: *"Summarize what we've built so far and what the next steps are for the auto-updating webapp"*
4. Claude should reference your uploaded files and give you an accurate answer

If it does, you're all set.

---

## Later: Transitioning to Claude Code

When you're ready to start coding locally:

1. Open Terminal and `cd ~/Projects/powder-hunter`
2. Run `git init` to make it a git repo
3. Rename or copy your memory file to serve as the Claude Code config:
   ```
   cp ski-resort-project-notes.md CLAUDE.md
   ```
4. Edit `CLAUDE.md` to add any coding preferences (e.g., "Use React + Tailwind," "Deploy to Netlify," etc.)
5. Launch Claude Code from that directory — it will automatically read CLAUDE.md and have full context

That's it — you'll be up and running with the full project history intact.
