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
    const buf = ctx.createBuffer(1, 1, 22050)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.start(0)
  } catch { /* ignore */ }
}

// gainVal is the peak gain directly — no internal multiplier
function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', gainVal?: number) {
  loadSettings()
  if (cachedMuted) return
  const ctx = getAudioCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const vol = gainVal ?? cachedVolume * 0.25
  osc.type = type
  osc.frequency.setValueAtTime(frequency, ctx.currentTime)
  gain.gain.setValueAtTime(vol, ctx.currentTime)
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
  gain.gain.setValueAtTime(cachedVolume * 0.08, ctx.currentTime)
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
  osc.type = 'sine'
  osc.frequency.setValueAtTime(520, ctx.currentTime)
  gain.gain.setValueAtTime(cachedVolume * 0.06, ctx.currentTime)
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
  osc.type = 'sine'
  osc.frequency.setValueAtTime(880, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(1109, ctx.currentTime + 0.08)
  gain.gain.setValueAtTime(cachedVolume * 0.12, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.12)
}

export function playSessionStartSound() {
  loadSettings()
  if (cachedMuted) return
  playTone(523, 0.2, 'sine', cachedVolume * 0.25)
  setTimeout(() => playTone(659, 0.2, 'sine', cachedVolume * 0.25), 100)
  setTimeout(() => playTone(784, 0.35, 'sine', cachedVolume * 0.28), 200)
}

export function playSessionStopSound() {
  loadSettings()
  if (cachedMuted) return
  playTone(784, 0.25, 'sine', cachedVolume * 0.25)
  setTimeout(() => playTone(523, 0.4, 'sine', cachedVolume * 0.22), 150)
}

export function playSessionCompleteSound() {
  loadSettings()
  if (cachedMuted) return
  const notes = [523, 659, 784, 1047]
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.3, 'sine', cachedVolume * 0.28), i * 120)
  })
}

export function playAchievementSound() {
  loadSettings()
  if (cachedMuted) return
  playTone(261, 0.18, 'sine', cachedVolume * 0.2)
  playTone(392, 0.18, 'sine', cachedVolume * 0.18)
  setTimeout(() => {
    playTone(523, 0.22, 'sine', cachedVolume * 0.24)
    playTone(659, 0.18, 'sine', cachedVolume * 0.16)
  }, 90)
  setTimeout(() => {
    playTone(784, 0.28, 'sine', cachedVolume * 0.22)
    playTone(1047, 0.14, 'triangle', cachedVolume * 0.1)
  }, 200)
  setTimeout(() => playTone(1047, 0.12, 'triangle', cachedVolume * 0.08), 340)
}

export function playLootRaritySound(rarity: string) {
  loadSettings()
  if (cachedMuted) return
  const key = String(rarity || '').toLowerCase()
  if (key === 'legendary' || key === 'mythical') {
    ;[784, 988, 1319, 1568].forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.2, 'triangle', cachedVolume * 0.3), i * 85)
    })
    return
  }
  if (key === 'epic') {
    ;[659, 880, 1175].forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.18, 'triangle', cachedVolume * 0.26), i * 80)
    })
    return
  }
  if (key === 'rare') {
    ;[587, 740].forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.16, 'sine', cachedVolume * 0.22), i * 70)
    })
    return
  }
  playTone(523, 0.12, 'sine', cachedVolume * 0.18)
}

export function playPotionSound() {
  loadSettings()
  if (cachedMuted) return
  const ctx = getAudioCtx()
  // Bubble effect
  ;[0, 40, 80].forEach((delay) => {
    setTimeout(() => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(180 + Math.random() * 60, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(380, ctx.currentTime + 0.06)
      gain.gain.setValueAtTime(cachedVolume * 0.16, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07)
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.08)
    }, delay)
  })
  // Power-up flourish
  const notes = [523, 659, 784, 988, 1175, 1397]
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.18, 'triangle', cachedVolume * 0.24), 140 + i * 55)
  })
}

export function playArenaVictorySound() {
  loadSettings()
  if (cachedMuted) return
  const notes = [523, 659, 784, 1047, 1319]
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, i === notes.length - 1 ? 0.5 : 0.18, 'triangle', cachedVolume * 0.3), i * 90)
  })
}

export function playArenaDefeatSound() {
  loadSettings()
  if (cachedMuted) return
  const notes = [440, 370, 311, 277]
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.3, 'sawtooth', cachedVolume * 0.2), i * 110)
  })
}

export function playXpRevealSound() {
  loadSettings()
  if (cachedMuted) return
  playTone(620, 0.07, 'sine', cachedVolume * 0.1)
}

export function playLevelUpSound() {
  loadSettings()
  if (cachedMuted) return
  const notes = [659, 784, 988, 1319, 1568]
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.22, 'triangle', cachedVolume * 0.3), i * 70)
  })
}

export function playPauseSound() {
  loadSettings()
  if (cachedMuted) return
  playTone(440, 0.15, 'sine', cachedVolume * 0.12)
}

export function playResumeSound() {
  loadSettings()
  if (cachedMuted) return
  playTone(440, 0.1, 'sine', cachedVolume * 0.12)
  setTimeout(() => playTone(554, 0.15, 'sine', cachedVolume * 0.14), 80)
}

export function playCraftCompleteSound() {
  loadSettings()
  if (cachedMuted) return
  playTone(220, 0.08, 'square', cachedVolume * 0.16)
  setTimeout(() => playTone(440, 0.12, 'triangle', cachedVolume * 0.2), 60)
  setTimeout(() => playTone(660, 0.15, 'triangle', cachedVolume * 0.24), 140)
  setTimeout(() => playTone(880, 0.2, 'sine', cachedVolume * 0.28), 230)
}

export function playChestOpeningSound(rarity: string) {
  loadSettings()
  if (cachedMuted) return
  const ctx = getAudioCtx()
  const key = String(rarity || '').toLowerCase()

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
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(80, ctx.currentTime)
    gain.gain.setValueAtTime(cachedVolume * 0.28, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.1)
    osc.connect(gain); gain.connect(ctx.destination)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 1.15)
    ;[220, 330, 440, 550, 660].forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.22, 'triangle', cachedVolume * (0.16 + i * 0.03)), i * 200)
    })
    return
  }

  if (key === 'epic') {
    playThud(120, 0.28, 0)
    playThud(110, 0.24, 120)
    setTimeout(() => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(150, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(350, ctx.currentTime + 0.38)
      gain.gain.setValueAtTime(cachedVolume * 0.18, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.42)
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.45)
    }, 60)
    return
  }

  if (key === 'rare') {
    playThud(120, 0.22, 0)
    setTimeout(() => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(120, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.28)
      gain.gain.setValueAtTime(cachedVolume * 0.14, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.32)
    }, 40)
    return
  }

  // common
  playThud(120, 0.18, 0)
}

// ── Cooking sounds ──────────────────────────────────────────────────────────

export function playCookChopSound() {
  loadSettings()
  if (cachedMuted) return
  const ctx = getAudioCtx()
  const noise = ctx.createBufferSource()
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.15))
  noise.buffer = buf
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 3200
  bp.Q.value = 1.5
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(cachedVolume * 0.22, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06)
  noise.connect(bp); bp.connect(gain); gain.connect(ctx.destination)
  noise.start(ctx.currentTime); noise.stop(ctx.currentTime + 0.06)
  const osc = ctx.createOscillator()
  const g2 = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(180, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.05)
  g2.gain.setValueAtTime(cachedVolume * 0.14, ctx.currentTime)
  g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07)
  osc.connect(g2); g2.connect(ctx.destination)
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.08)
}

export function playCookSizzleSound() {
  loadSettings()
  if (cachedMuted) return
  const ctx = getAudioCtx()
  const noise = ctx.createBufferSource()
  const dur = 0.18
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    const t = i / data.length
    data[i] = (Math.random() * 2 - 1) * Math.sin(t * Math.PI) * 0.5
  }
  noise.buffer = buf
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 4000
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(cachedVolume * 0.14, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
  noise.connect(hp); hp.connect(gain); gain.connect(ctx.destination)
  noise.start(ctx.currentTime); noise.stop(ctx.currentTime + dur + 0.01)
}

export function playCookBubbleSound() {
  loadSettings()
  if (cachedMuted) return
  const ctx = getAudioCtx()
  ;[0, 45, 100].forEach((delay, i) => {
    setTimeout(() => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const freq = 260 + i * 80 + Math.random() * 40
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(freq * 1.8, ctx.currentTime + 0.04)
      gain.gain.setValueAtTime(cachedVolume * 0.14, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06)
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.07)
    }, delay)
  })
}

export function playCookGrindSound() {
  loadSettings()
  if (cachedMuted) return
  const ctx = getAudioCtx()
  const osc = ctx.createOscillator()
  const g1 = ctx.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(90, ctx.currentTime)
  osc.frequency.linearRampToValueAtTime(60, ctx.currentTime + 0.12)
  g1.gain.setValueAtTime(cachedVolume * 0.1, ctx.currentTime)
  g1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14)
  osc.connect(g1); g1.connect(ctx.destination)
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15)
  const noise = ctx.createBufferSource()
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.3
  noise.buffer = buf
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 2
  const g2 = ctx.createGain()
  g2.gain.setValueAtTime(cachedVolume * 0.12, ctx.currentTime)
  g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1)
  noise.connect(bp); bp.connect(g2); g2.connect(ctx.destination)
  noise.start(ctx.currentTime); noise.stop(ctx.currentTime + 0.11)
}

export function playCookOvenSound() {
  loadSettings()
  if (cachedMuted) return
  const ctx = getAudioCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(120, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.2)
  gain.gain.setValueAtTime(cachedVolume * 0.12, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
  osc.connect(gain); gain.connect(ctx.destination)
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.32)
  setTimeout(() => {
    const n = ctx.createBufferSource()
    const b = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.3)) * 0.2
    n.buffer = b
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'; lp.frequency.value = 2000
    const g = ctx.createGain()
    g.gain.setValueAtTime(cachedVolume * 0.08, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)
    n.connect(lp); lp.connect(g); g.connect(ctx.destination)
    n.start(ctx.currentTime); n.stop(ctx.currentTime + 0.09)
  }, 100)
}

export function playCookMixSound() {
  loadSettings()
  if (cachedMuted) return
  const ctx = getAudioCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(300, ctx.currentTime)
  osc.frequency.linearRampToValueAtTime(500, ctx.currentTime + 0.06)
  osc.frequency.linearRampToValueAtTime(280, ctx.currentTime + 0.12)
  gain.gain.setValueAtTime(cachedVolume * 0.1, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14)
  osc.connect(gain); gain.connect(ctx.destination)
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15)
}

export function playCookAdvanceSound() {
  loadSettings()
  if (cachedMuted) return
  playTone(440, 0.12, 'sine', cachedVolume * 0.18)
  setTimeout(() => playTone(660, 0.18, 'triangle', cachedVolume * 0.22), 60)
  setTimeout(() => playTone(880, 0.12, 'sine', cachedVolume * 0.14), 130)
}

export function playCookSoundForInstrument(instrument: string) {
  switch (instrument) {
    case 'knife': return playCookChopSound()
    case 'pan': return playCookSizzleSound()
    case 'pot': return playCookBubbleSound()
    case 'mortar': return playCookGrindSound()
    case 'oven': return playCookOvenSound()
    case 'bowl': return playCookMixSound()
    default: return playCookChopSound()
  }
}

export function playTapHitSound() {
  loadSettings()
  if (cachedMuted) return
  playTone(880, 0.08, 'sine', cachedVolume * 0.16)
  setTimeout(() => playTone(1100, 0.12, 'triangle', cachedVolume * 0.22), 50)
  setTimeout(() => playTone(1320, 0.15, 'sine', cachedVolume * 0.14), 110)
}

export function playTapMissSound() {
  loadSettings()
  if (cachedMuted) return
  playTone(180, 0.12, 'sine', cachedVolume * 0.1)
  setTimeout(() => playTone(120, 0.08, 'triangle', cachedVolume * 0.07), 40)
}

// ── Cooking polish sounds ────────────────────────────────────────────────────

export function playCookErrorSound() {
  loadSettings()
  if (cachedMuted) return
  playTone(350, 0.1, 'sine', cachedVolume * 0.14)
  setTimeout(() => playTone(220, 0.12, 'sine', cachedVolume * 0.12), 100)
}

export function playCookCompleteSound(rarity: string = 'common') {
  loadSettings()
  if (cachedMuted) return
  const ctx = getAudioCtx()
  const key = String(rarity || '').toLowerCase()

  if (key === 'legendary' || key === 'mythic') {
    const notes = [523, 659, 784, 1047]
    notes.forEach((freq, i) => {
      setTimeout(() => {
        playTone(freq, 0.25, 'triangle', cachedVolume * 0.28)
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq * 1.005, ctx.currentTime)
        gain.gain.setValueAtTime(cachedVolume * 0.05, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
        osc.connect(gain); gain.connect(ctx.destination)
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.26)
      }, i * 100)
    })
    return
  }
  if (key === 'epic') {
    const notes = [587, 740, 988]
    notes.forEach((freq, i) => {
      setTimeout(() => playTone(freq, 0.2, 'triangle', cachedVolume * 0.24), i * 90)
    })
    setTimeout(() => playTone(1976, 0.15, 'sine', cachedVolume * 0.06), 270)
    return
  }
  if (key === 'rare') {
    playTone(523, 0.15, 'sine', cachedVolume * 0.2)
    setTimeout(() => playTone(659, 0.2, 'triangle', cachedVolume * 0.24), 100)
    return
  }
  // common
  playTone(523, 0.2, 'triangle', cachedVolume * 0.18)
}

export function playCookDiscoverySound() {
  loadSettings()
  if (cachedMuted) return
  const notes = [523, 659, 784, 1047, 1319]
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.22, 'triangle', cachedVolume * (0.18 + i * 0.024)), i * 75)
  })
}

export function playCookBurnSound() {
  loadSettings()
  if (cachedMuted) return
  const ctx = getAudioCtx()
  const noise = ctx.createBufferSource()
  const dur = 0.1
  const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    const t = i / data.length
    data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 3) * 0.4
  }
  noise.buffer = buf
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 4000
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(cachedVolume * 0.2, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
  noise.connect(hp); hp.connect(gain); gain.connect(ctx.destination)
  noise.start(ctx.currentTime); noise.stop(ctx.currentTime + dur + 0.01)
  setTimeout(() => {
    const osc = ctx.createOscillator()
    const g2 = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(400, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.12)
    g2.gain.setValueAtTime(cachedVolume * 0.22, ctx.currentTime)
    g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14)
    osc.connect(g2); g2.connect(ctx.destination)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15)
  }, 60)
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
