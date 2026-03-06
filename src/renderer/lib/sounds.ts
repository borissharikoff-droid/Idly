// Web Audio API sound effects — no external files needed

let audioCtx: AudioContext | null = null
let cachedVolume = 0.15
let cachedMuted = false
let settingsLoaded = false

function loadSettings() {
  if (settingsLoaded) return
  settingsLoaded = true
  try {
    const v = localStorage.getItem('grindly_sound_volume')
    if (v !== null) cachedVolume = parseFloat(v)
    cachedMuted = localStorage.getItem('grindly_sound_muted') === 'true'
  } catch { /* ignore */ }
}

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  if (audioCtx.state === 'suspended') audioCtx.resume()
  return audioCtx
}

// Pre-warm audio context on first user gesture
export function warmUpAudio() {
  try {
    const ctx = getAudioCtx()
    // Create a silent buffer to unlock audio
    const buf = ctx.createBuffer(1, 1, 22050)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.start(0)
  } catch { /* ignore */ }
}

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', gainVal?: number) {
  loadSettings()
  if (cachedMuted) return
  const ctx = getAudioCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const vol = gainVal ?? cachedVolume
  osc.type = type
  osc.frequency.setValueAtTime(frequency, ctx.currentTime)
  gain.gain.setValueAtTime(vol * 0.3, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + duration)
}

export function playClickSound() {
  loadSettings()
  if (cachedMuted) return
  const ctx = getAudioCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(800, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.05)
  gain.gain.setValueAtTime(cachedVolume * 0.15, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.08)
}

export function playTabSound() {
  loadSettings()
  if (cachedMuted) return
  const ctx = getAudioCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const vol = cachedVolume * 0.4
  osc.type = 'sine'
  osc.frequency.setValueAtTime(520, ctx.currentTime)
  gain.gain.setValueAtTime(vol * 0.12, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.05)
}

export function playMessageSound() {
  loadSettings()
  if (cachedMuted) return
  const ctx = getAudioCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const vol = cachedVolume * 0.35
  osc.type = 'sine'
  osc.frequency.setValueAtTime(880, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(1109, ctx.currentTime + 0.08)
  gain.gain.setValueAtTime(vol * 0.2, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.12)
}

export function playSessionStartSound() {
  loadSettings()
  if (cachedMuted) return
  playTone(523, 0.2, 'sine', cachedVolume)
  setTimeout(() => playTone(659, 0.2, 'sine', cachedVolume), 100)
  setTimeout(() => playTone(784, 0.35, 'sine', cachedVolume), 200)
}

export function playSessionStopSound() {
  loadSettings()
  if (cachedMuted) return
  playTone(784, 0.25, 'sine', cachedVolume)
  setTimeout(() => playTone(523, 0.4, 'sine', cachedVolume), 150)
}

export function playSessionCompleteSound() {
  loadSettings()
  if (cachedMuted) return
  const notes = [523, 659, 784, 1047]
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.3, 'sine', cachedVolume), i * 120)
  })
}

export function playAchievementSound() {
  loadSettings()
  if (cachedMuted) return
  const notes = [880, 1109, 1319, 1568, 1760]
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.25, 'triangle', cachedVolume), i * 80)
  })
}

export function playLootRaritySound(rarity: string) {
  loadSettings()
  if (cachedMuted) return
  const key = String(rarity || '').toLowerCase()
  if (key === 'legendary' || key === 'mythical') {
    ;[784, 988, 1319, 1568].forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.2, 'triangle', cachedVolume * 1.05), i * 85)
    })
    return
  }
  if (key === 'epic') {
    ;[659, 880, 1175].forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.18, 'triangle', cachedVolume), i * 80)
    })
    return
  }
  if (key === 'rare') {
    ;[587, 740].forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.16, 'sine', cachedVolume * 0.9), i * 70)
    })
    return
  }
  playTone(523, 0.12, 'sine', cachedVolume * 0.75)
}

export function playPotionSound() {
  loadSettings()
  if (cachedMuted) return
  const ctx = getAudioCtx()
  // Bubbling gulp + ascending power-up flourish
  const vol = cachedVolume * 1.1
  // Bubble effect: rapid low-frequency pulses
  ;[0, 40, 80].forEach((delay) => {
    setTimeout(() => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(180 + Math.random() * 60, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(380, ctx.currentTime + 0.06)
      gain.gain.setValueAtTime(vol * 0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07)
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.08)
    }, delay)
  })
  // Power-up flourish after gulp
  const notes = [523, 659, 784, 988, 1175, 1397]
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.18, 'triangle', vol * 0.9), 140 + i * 55)
  })
}

export function playArenaVictorySound() {
  loadSettings()
  if (cachedMuted) return
  // Triumphant fanfare: rising arpeggio then sustained high note
  const notes = [523, 659, 784, 1047, 1319]
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, i === notes.length - 1 ? 0.5 : 0.18, 'triangle', cachedVolume * 1.1), i * 90)
  })
}

export function playArenaDefeatSound() {
  loadSettings()
  if (cachedMuted) return
  // Descending doom: falling minor chord
  const notes = [440, 370, 311, 277]
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.3, 'sawtooth', cachedVolume * 0.7), i * 110)
  })
}

export function playXpRevealSound() {
  loadSettings()
  if (cachedMuted) return
  playTone(620, 0.07, 'sine', cachedVolume * 0.35)
}

export function playLevelUpSound() {
  loadSettings()
  if (cachedMuted) return
  // Bright ascending flourish, distinct from session complete
  const notes = [659, 784, 988, 1319, 1568]
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.22, 'triangle', cachedVolume * 1.05), i * 70)
  })
}

export function playPauseSound() {
  loadSettings()
  if (cachedMuted) return
  playTone(440, 0.15, 'sine')
}

export function playResumeSound() {
  loadSettings()
  if (cachedMuted) return
  playTone(440, 0.1, 'sine', cachedVolume)
  setTimeout(() => playTone(554, 0.15, 'sine', cachedVolume), 80)
}

export function playCraftCompleteSound() {
  loadSettings()
  if (cachedMuted) return
  // Anvil strike → ascending chime: metallic hit + bright resolution
  const vol = cachedVolume
  playTone(220, 0.08, 'square', vol * 0.6)
  setTimeout(() => playTone(440, 0.12, 'triangle', vol * 0.8), 60)
  setTimeout(() => playTone(660, 0.15, 'triangle', vol * 0.9), 140)
  setTimeout(() => playTone(880, 0.2, 'sine', vol), 230)
}

export function playChestOpeningSound(rarity: string) {
  loadSettings()
  if (cachedMuted) return
  const ctx = getAudioCtx()
  const key = String(rarity || '').toLowerCase()

  // Deep bass thud helper
  function playThud(freqHz: number, gainMul: number, delayMs: number) {
    setTimeout(() => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(freqHz, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(freqHz * 0.6, ctx.currentTime + 0.18)
      gain.gain.setValueAtTime(cachedVolume * gainMul, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22)
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.22)
    }, delayMs)
  }

  if (key === 'legendary' || key === 'mythic') {
    // Deep bass rumble (80Hz sawtooth)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(80, ctx.currentTime)
    gain.gain.setValueAtTime(cachedVolume * 0.38, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.1)
    osc.connect(gain); gain.connect(ctx.destination)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 1.15)
    // Rising harmonic chord buildup
    ;[220, 330, 440, 550, 660].forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.22, 'triangle', cachedVolume * (0.28 + i * 0.04)), i * 200)
    })
    return
  }

  if (key === 'epic') {
    // Double thud + whoosh sweep
    playThud(120, 0.32, 0)
    playThud(110, 0.28, 120)
    setTimeout(() => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(150, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(350, ctx.currentTime + 0.38)
      gain.gain.setValueAtTime(cachedVolume * 0.22, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.42)
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.45)
    }, 60)
    return
  }

  if (key === 'rare') {
    // Low thud + short rising sweep
    playThud(120, 0.22, 0)
    setTimeout(() => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(120, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.28)
      gain.gain.setValueAtTime(cachedVolume * 0.16, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.32)
    }, 40)
    return
  }

  // common: single quiet low thud
  playThud(120, 0.18, 0)
}

export function setSoundVolume(volume: number) {
  cachedVolume = Math.max(0, Math.min(1, volume))
  localStorage.setItem('grindly_sound_volume', String(cachedVolume))
}

export function setSoundMuted(muted: boolean) {
  cachedMuted = muted
  localStorage.setItem('grindly_sound_muted', String(muted))
}

export function getSoundSettings(): { volume: number; muted: boolean } {
  loadSettings()
  return { volume: cachedVolume, muted: cachedMuted }
}
