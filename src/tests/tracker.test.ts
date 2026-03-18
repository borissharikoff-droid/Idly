import { describe, it, expect } from 'vitest'
import { categorizeMultiple } from '../main/tracker'

/** Helper: get first (primary) category from categorizeMultiple */
function categorize(appName: string, windowTitle: string): string {
  return categorizeMultiple(appName, windowTitle)[0]
}

describe('categorize', () => {
  // Coding
  it('categorizes VS Code as coding', () => {
    expect(categorize('Code', '')).toBe('coding')
  })

  it('categorizes Cursor as coding', () => {
    expect(categorize('Cursor', '')).toBe('coding')
  })

  it('categorizes IntelliJ IDEA as coding', () => {
    expect(categorize('idea', '')).toBe('coding')
  })

  it('categorizes by file extension in title', () => {
    expect(categorize('notepad', 'main.tsx - Notepad')).toBe('coding')
    expect(categorize('notepad', 'script.py - Notepad')).toBe('coding')
    expect(categorize('notepad', 'lib.rs - Editor')).toBe('coding')
  })

  it('categorizes Visual Studio as coding', () => {
    expect(categorize('devenv', '')).toBe('coding')
  })

  // Design
  it('categorizes Figma as design', () => {
    expect(categorize('figma', '')).toBe('design')
  })

  it('categorizes Photoshop as design', () => {
    expect(categorize('Photoshop', '')).toBe('design')
  })

  // Creative
  it('categorizes Blender as creative', () => {
    expect(categorize('blender', '')).toBe('creative')
  })

  it('categorizes OBS as creative', () => {
    expect(categorize('obs', '')).toBe('creative')
  })

  // Learning
  it('categorizes Notion as learning', () => {
    expect(categorize('Notion', '')).toBe('learning')
  })

  it('categorizes Obsidian as learning', () => {
    expect(categorize('Obsidian', '')).toBe('learning')
  })

  it('categorizes PDF files as learning', () => {
    expect(categorize('chrome', 'document.pdf - Chrome')).toBe('learning')
  })

  // Music
  it('categorizes Spotify as music', () => {
    expect(categorize('Spotify', '')).toBe('music')
  })

  // Games — launchers
  it('categorizes Steam as games', () => {
    expect(categorize('steam', '')).toBe('games')
  })

  it('categorizes Epic Games as games', () => {
    expect(categorize('EpicGamesLauncher', '')).toBe('games')
  })

  // Games — Valve
  it('categorizes Dota 2 as games', () => {
    expect(categorize('dota2', '')).toBe('games')
  })

  it('categorizes CS2 as games', () => {
    expect(categorize('cs2', '')).toBe('games')
  })

  // Games — WoW family (the reported bug)
  it('categorizes World of Warcraft as games (process: Wow.exe)', () => {
    expect(categorize('Wow', '')).toBe('games')
  })

  it('categorizes WoW Classic as games', () => {
    expect(categorize('WowClassic', '')).toBe('games')
  })

  it('categorizes WoW PTR as games', () => {
    expect(categorize('WowT', '')).toBe('games')
  })

  // Games — Path of Exile family (the reported bug)
  it('categorizes PathOfExile as games', () => {
    expect(categorize('PathOfExile', '')).toBe('games')
  })

  it('categorizes PathOfExileSteam as games', () => {
    expect(categorize('PathOfExileSteam', '')).toBe('games')
  })

  it('categorizes PathOfExile2 as games', () => {
    expect(categorize('PathOfExile2', '')).toBe('games')
  })

  // Games — popular RPG/Action
  it('categorizes Elden Ring as games', () => {
    expect(categorize('eldenring', '')).toBe('games')
  })

  it('categorizes Cyberpunk 2077 as games', () => {
    expect(categorize('Cyberpunk2077', '')).toBe('games')
  })

  it('categorizes Baldur\'s Gate 3 as games', () => {
    expect(categorize('bg3', '')).toBe('games')
  })

  it('categorizes The Witcher 3 as games', () => {
    expect(categorize('witcher3', '')).toBe('games')
  })

  it('categorizes Final Fantasy XIV as games', () => {
    expect(categorize('ffxiv_dx11', '')).toBe('games')
  })

  // Games — MMOs
  it('categorizes Lost Ark as games', () => {
    expect(categorize('LostArk', '')).toBe('games')
  })

  it('categorizes New World as games', () => {
    expect(categorize('NewWorld', '')).toBe('games')
  })

  it('categorizes ESO as games', () => {
    expect(categorize('eso64', '')).toBe('games')
  })

  // Games — Shooters
  it('categorizes Apex Legends as games', () => {
    expect(categorize('r5apex', '')).toBe('games')
  })

  it('categorizes Escape from Tarkov as games', () => {
    expect(categorize('EscapeFromTarkov', '')).toBe('games')
  })

  it('categorizes Destiny 2 as games', () => {
    expect(categorize('destiny2', '')).toBe('games')
  })

  it('categorizes Warframe as games', () => {
    expect(categorize('warframe', '')).toBe('games')
  })

  // Games — UE4/UE5 build suffix stripping
  it('categorizes Dead by Daylight (UE suffix) as games', () => {
    expect(categorize('DeadByDaylight-Win64-Shipping', '')).toBe('games')
  })

  it('categorizes Palworld (UE suffix) as games', () => {
    expect(categorize('Palworld-Win64-Shipping', '')).toBe('games')
  })

  // Games — title-based detection
  it('categorizes by game in title (Minecraft)', () => {
    expect(categorize('javaw', 'Minecraft Game Window')).toBe('games')
  })

  it('categorizes by game title: World of Warcraft (unknown process)', () => {
    expect(categorize('Unknown', 'World of Warcraft')).toBe('games')
  })

  it('categorizes by game title: Path of Exile (unknown process)', () => {
    expect(categorize('Unknown', 'Path of Exile')).toBe('games')
  })

  it('categorizes by game title: Elden Ring', () => {
    expect(categorize('someprocess', 'Elden Ring')).toBe('games')
  })

  it('categorizes by game title: Rocket League', () => {
    expect(categorize('rocketleague', '')).toBe('games')
  })

  // Social
  it('categorizes Discord as social', () => {
    expect(categorize('Discord', '')).toBe('social')
  })

  it('categorizes Telegram as social', () => {
    expect(categorize('Telegram', '')).toBe('social')
  })

  // Browsing
  it('categorizes Chrome as browsing', () => {
    expect(categorize('chrome', '')).toBe('browsing')
  })

  it('categorizes Firefox as browsing', () => {
    expect(categorize('firefox', '')).toBe('browsing')
  })

  it('categorizes Edge as browsing', () => {
    expect(categorize('msedge', '')).toBe('browsing')
  })

  it('categorizes Claude Code in browser as coding', () => {
    expect(categorize('chrome', 'Claude Code - claude.ai')).toBe('coding')
    expect(categorize('msedge', 'Claude - claude.ai/chat')).toBe('coding')
    expect(categorize('chrome', 'Code - code.claude.ai/session/123')).toBe('coding')
  })

  it('categorizes GitHub pages in browser as coding', () => {
    expect(categorize('chrome', 'Pull Request #123 - github.com')).toBe('coding')
  })

  it('categorizes browser figma as design', () => {
    expect(categorize('chrome', 'Figma - Design System - figma.com')).toBe('design')
  })

  it('categorizes browser social feeds as social', () => {
    expect(categorize('chrome', 'Home / X - x.com')).toBe('social')
    expect(categorize('msedge', 'Reddit - Dive into anything')).toBe('social')
  })

  it('categorizes browser entertainment as other', () => {
    expect(categorize('chrome', 'Netflix - Watch TV Shows Online')).toBe('other')
  })

  it('categorizes cloud IDE tabs as coding', () => {
    expect(categorize('chrome', 'my-repo - GitHub Codespaces')).toBe('coding')
    expect(categorize('chrome', 'index.ts - StackBlitz')).toBe('coding')
  })

  // Other
  it('categorizes unknown apps as other', () => {
    expect(categorize('randomapp', '')).toBe('other')
  })

  it('categorizes explorer as other (not browsing)', () => {
    expect(categorize('explorer', '')).toBe('other')
  })
})

describe('categorizeMultiple', () => {
  it('returns multiple categories for music in browser', () => {
    const cats = categorizeMultiple('chrome', 'Spotify - Web Player')
    expect(cats).toContain('music')
  })

  it('returns music + learning for podcast on music site', () => {
    const cats = categorizeMultiple('chrome', 'подкаст - Spotify')
    expect(cats).toContain('music')
    expect(cats).toContain('learning')
  })

  it('prioritizes coding over social when title is mixed', () => {
    expect(categorize('chrome', 'GitHub issue discussion - github.com')).toBe('coding')
  })

  it('categorizes lesson/tutorial pages in browser as learning', () => {
    expect(categorize('chrome', 'React Tutorial for Beginners - YouTube')).toBe('learning')
    expect(categorize('msedge', 'Lesson 5: Async JavaScript - Course')).toBe('learning')
  })

  it('strips .exe suffix from app name', () => {
    expect(categorize('Code.exe', '')).toBe('coding')
    expect(categorize('Discord.exe', '')).toBe('social')
  })
})
