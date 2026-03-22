You are executing the `/x` command for the **Grindly** project.

You receive a topic/theme as the argument (e.g., "patch 4.0.0", "guilds", "hot zone"). Based on this, you produce either a single post or a thread — whichever format fits the content better. You also generate a matching image using the mascot.

---

## Step 1 — Gather context (run in parallel)

- `git log --oneline -20`
- `git describe --tags --abbrev=0`
- Read `C:\Users\fillo\.claude\projects\C--idly\memory\changelog_draft.md`

---

## Step 2 — Decide: single post or thread?

**Single post** if the topic is focused, punchy, or a specific mechanic/insight — one tweet captures it cleanly.

**Thread** if the topic is a major release, a complex system, or has 4+ distinct things to say.

Pick whichever format makes better content. Do not default to one or the other.

---

## Step 3 — Write the content

### Voice & style rules (apply to both formats):
- Write like a builder talking to other builders or players
- Hook in the first line — no "We're excited to announce" garbage
- Concrete and specific — name the feature, name the number, name the mechanic
- No corporate speak
- Max 1–2 emojis per tweet total
- Each tweet ≤ 280 characters

### Single post extras:
- End with an engagement hook (question, flex, or punchy one-liner)
- Pick 2–3 relevant hashtags from: `#indiedev` `#gamedev` `#buildinpublic` `#pixelart` `#productivity` — only ones that genuinely fit
- Hashtags go at the end on their own line

### Thread extras:
- Number tweets `1/N, 2/N, ...`
- Structure: hook → one tweet per major point → rapid-fire "plus" tweet → CTA with hashtags
- Hashtags only in the last tweet

---

## Step 4 — Generate image via OpenAI API

**Mascot:** `C:\Users\fillo\OneDrive\Рабочий стол\1.png`
Tiny cute pixel-art purple square character, round eyes, stubby legs, color `#9b59ff`. Always use as reference.

Compose an image prompt that matches the post's content and mood:
- Mascot doing something thematically tied to the topic
- Hype/release → action pose or celebration
- Mechanic explanation → thinking or pointing at something
- Specific scene (e.g. "mascot standing at a forge crafting glowing armor", "mascot leading a party into a dungeon")
- End every prompt with: `pixel art style, 32-bit, dark background #1a1a2e, clean composition, no text`
- Under 80 words

**Run this to generate** (fill in PROMPT):

```bash
cd C:/idly && export OPENAI_API_KEY=$(grep OPENAI_API_KEY .env | cut -d= -f2-) && \
node --input-type=module << 'EOF'
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';

const apiKey = process.env.OPENAI_API_KEY;
const prompt = `PROMPT`;
const outDir = 'C:/idly/x_images';
fs.mkdirSync(outDir, { recursive: true });

const form = new FormData();
form.append('model', 'gpt-image-1');
form.append('prompt', prompt);
form.append('image[]', fs.createReadStream('C:/Users/fillo/OneDrive/Рабочий стол/1.png'));
form.append('size', '1024x1024');

const res = await fetch('https://api.openai.com/v1/images/edits', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + apiKey, ...form.getHeaders() },
  body: form
});
const json = await res.json();
if (json.error) { console.error('Error:', json.error.message); process.exit(1); }
const buf = Buffer.from(json.data[0].b64_json, 'base64');
const outPath = path.join(outDir, 'tweet_1.png');
fs.writeFileSync(outPath, buf);
console.log('Saved:', outPath);
EOF
```

For threads: run once per tweet, changing `tweet_1.png` → `tweet_N.png` for each.

---

## Step 5 — Write to file

Write all content to `C:\idly\x_post.md`. Format:

```markdown
# X — [topic] — [YYYY-MM-DD]

[tweet text, or numbered tweets for thread]

---
Image: x_images/tweet_1.png
Prompt: [prompt used]
```

---

## Step 6 — Output to user

1. Report: `✓ x_post.md` and `✓ x_images/tweet_1.png` (or list of images for thread)
2. Print the post(s) in a plain code block — clean, copyable, no markdown decoration around the tweet text itself
