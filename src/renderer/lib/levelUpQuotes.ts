/**
 * Quotes and copy for level-up modals (skill + global). All in English.
 */

export const SKILL_QUOTES: Record<string, string[]> = {
  developer: [
    "You're a real dev now. Ship it.",
    "Code compiled. Brain upgraded.",
    "The terminal fears you.",
    "10x engineer energy unlocked.",
  ],
  designer: [
    "Pixels bow to you.",
    "You're a real designer, bro.",
    "Figma is your playground.",
    "Clean UI runs in your veins.",
  ],
  gamer: [
    "GG. You're the main character.",
    "Level up IRL. Respect.",
    "The grind never stops. You know that.",
    "Pro gamer moves. Unlocked.",
  ],
  communicator: [
    "You're a real communicator, bro.",
    "Inbox zero? More like influence max.",
    "People listen when you talk.",
    "Networking level: expert.",
  ],
  researcher: [
    "You're a real researcher, bro.",
    "The internet is your library.",
    "Sources cited. Brain expanded.",
    "Deep dive champion.",
  ],
  creator: [
    "You're a real creator, bro.",
    "Ideas into pixels. Every time.",
    "The blank canvas fears you.",
    "Creative mode: unlocked.",
  ],
  learner: [
    "You're a real learner, bro.",
    "Knowledge is XP. You're farming it.",
    "Certified skill collector.",
    "Brain gains. No cap.",
  ],
  listener: [
    "You're a real listener, bro.",
    "Vibes: immaculate.",
    "The algorithm works for you.",
    "Ears upgraded. Taste unlocked.",
  ],
}

export const GLOBAL_LEVEL_QUOTES: string[] = [
  "Level up. Life up.",
  "The grind paid off. Again.",
  "You're built different.",
  "Another level. Same legend.",
  "XP doesn't lie. You earned this.",
  "Ranks don't define you. You define them.",
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function getSkillQuote(skillId: string): string {
  const quotes = SKILL_QUOTES[skillId] ?? SKILL_QUOTES.researcher
  return pick(quotes)
}

export function getGlobalLevelQuote(): string {
  return pick(GLOBAL_LEVEL_QUOTES)
}
