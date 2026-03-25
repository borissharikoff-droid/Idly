<div align="center">

<img src="docs/banner.png" alt="Grindly" width="100%">

<br>
<br>

**Your screen time, gamified.**<br>
XP, skills, loot drops, and arena battles — powered by what you actually do on your PC.

<br>

[![Download](https://img.shields.io/badge/Download-Windows-5865F2?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/lovepsm94/grindly/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)
[![Wiki](https://img.shields.io/badge/Wiki-Docs-f59e0b?style=for-the-badge)](https://lovepsm94.github.io/grindly-wiki)

</div>

---

## What is Grindly?

Grindly watches what you're doing on your Windows PC and turns it into an RPG — in real time.

Open VS Code for 3 hours → **Developer** skill levels up. Browse research tabs → **Researcher** XP. Play games → **Gamer**. Every active window is tracked and converted into progression.

<div align="center">
<img src="docs/core-loop.gif" alt="Core loop — session running, skills gaining XP, loot dropping" width="340">
</div>

---

## Features

| | |
|---|---|
| ⏱ **Session Tracker** | Start a grind session. Your active windows are tracked automatically. Stop and collect your rewards. |
| 🎮 **13 Skills** | Developer, Designer, Gamer, Researcher, Creator, Communicator, Learner, Listener, Farmer, Warrior, Crafter, Chef, Grindly. Each has 99 levels + prestige. |
| 🎁 **Loot Drops** | Sessions drop gear at 5 rarity tiers: Common → Rare → Epic → Legendary → Mythic. |
| ⚔️ **Arena** | Turn-based boss battles. Your equipped gear stats determine your ATK and HP. Unlock 6 zones. |
| ⚒️ **Crafting & Farming** | Salvage gear for materials. Grow plants. Craft better equipment. |
| 🏪 **Marketplace** | Player-to-player trading. Buy and sell loot for gold. |
| 👥 **Party System** | Add friends, see their sessions live, chat in real time. |
| 🎮 **Discord Rich Presence** | Your grind status shows on your Discord profile — skill, level, streak, timer. |
| 🔥 **Streak System** | Daily streaks with XP multipliers. Break it and you'll feel it. |

---

## Screenshots

<div align="center">
<img src="docs/screen-home.png" width="260" alt="Home — session running">
<img src="docs/screen-skills.png" width="260" alt="Skills — XP and levels">
<img src="docs/screen-arena.png" width="260" alt="Arena — boss fight">
</div>

---

## Download & Install

1. Go to **[Releases](https://github.com/lovepsm94/grindly/releases/latest)**
2. Download `Grindly-Setup-x.x.x.exe`
3. Run the installer — Windows may show a SmartScreen warning since the app isn't code-signed yet. Click **More info → Run anyway**.
4. Grindly starts in the system tray.

> **No account required.** Social features (friends, leaderboard, marketplace) are optional and require a free account.

---

## Why the SmartScreen warning?

Grindly is not code-signed (costs $300–$500/yr). The app is fully open source — you can read every line of code in this repo. If you're not comfortable, build it yourself:

```bash
git clone https://github.com/lovepsm94/grindly
cd grindly
npm install
npm run electron:dev
```

---

## Tech Stack

Electron · React · TypeScript · Tailwind CSS · SQLite · Supabase · Framer Motion

---

## License

MIT — free to use, modify, and distribute.
