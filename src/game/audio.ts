/**
 * ARENA audio — fully procedural WebAudio synthesis.
 * No audio assets are required: impacts, blocks, whooshes, UI, announcer stabs,
 * menu drone and the fight loop are all generated. Volumes are driven live by
 * the settings store.
 */

export type MusicMode = 'menu' | 'fight'

class AudioSystem {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private music: GainNode | null = null
  private sfx: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private vol = { master: 0.8, music: 0.55, sfx: 0.9 }
  private wantedMusic: MusicMode | null = null
  private musicNodes: Array<OscillatorNode | AudioBufferSourceNode> = []
  private musicTimer: ReturnType<typeof setInterval> | null = null
  private musicBeat = 0
  private unlocked = false

  /** Must be called from a user gesture (autoplay policy). */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      this.ctx = new Ctx()
      this.master = this.ctx.createGain()
      this.music = this.ctx.createGain()
      this.sfx = this.ctx.createGain()
      this.music.connect(this.master)
      this.sfx.connect(this.master)
      this.master.connect(this.ctx.destination)
      this.applyVolumes()
      this.noiseBuf = this.makeNoise()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    if (!this.unlocked) {
      this.unlocked = true
      if (this.wantedMusic) this.startMusic(this.wantedMusic)
    }
  }

  get ready() { return this.unlocked && this.ctx !== null }

  setVolumes(v: { master?: number; music?: number; sfx?: number }) {
    Object.assign(this.vol, v)
    this.applyVolumes()
  }

  private applyVolumes() {
    if (!this.ctx || !this.master || !this.music || !this.sfx) return
    const t = this.ctx.currentTime
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05)
    this.music.gain.setTargetAtTime(this.vol.music * 0.6, t, 0.05)
    this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05)
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    return buf
  }

  private noise(dur: number, gain: number, filter?: { type: BiquadFilterType; from: number; to: number; q?: number }, delay = 0) {
    if (!this.ctx || !this.noiseBuf || !this.sfx) return
    const ctx = this.ctx
    const t = ctx.currentTime + delay
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    let node: AudioNode = src
    if (filter) {
      const f = ctx.createBiquadFilter()
      f.type = filter.type
      f.Q.value = filter.q ?? 1
      f.frequency.setValueAtTime(filter.from, t)
      f.frequency.exponentialRampToValueAtTime(Math.max(40, filter.to), t + dur)
      src.connect(f)
      node = f
    }
    node.connect(g)
    g.connect(this.sfx)
    src.start(t)
    src.stop(t + dur + 0.02)
  }

  private tone(type: OscillatorType, from: number, to: number, dur: number, gain: number, delay = 0) {
    if (!this.ctx || !this.sfx) return
    const ctx = this.ctx
    const t = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(from, t)
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g)
    g.connect(this.sfx)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  // ── SFX ─────────────────────────────────────────────────────────────────────
  whoosh(heavy: boolean) {
    this.noise(heavy ? 0.22 : 0.12, heavy ? 0.16 : 0.1, { type: 'bandpass', from: heavy ? 500 : 900, to: heavy ? 140 : 300, q: 1.4 })
  }

  hit(heavy: boolean, blocked: boolean) {
    if (blocked) {
      this.tone('square', 820, 700, 0.09, 0.1)
      this.tone('square', 1230, 980, 0.07, 0.06)
      this.noise(0.08, 0.12, { type: 'highpass', from: 2000, to: 3000 })
      return
    }
    if (heavy) {
      this.tone('sine', 150, 42, 0.28, 0.55)
      this.tone('sawtooth', 220, 60, 0.16, 0.18)
      this.noise(0.16, 0.3, { type: 'lowpass', from: 2600, to: 300 })
    } else {
      this.tone('sine', 210, 70, 0.14, 0.4)
      this.noise(0.09, 0.22, { type: 'lowpass', from: 3400, to: 600 })
    }
  }

  exHit() {
    this.tone('sine', 120, 30, 0.5, 0.7)
    this.tone('sawtooth', 400, 90, 0.3, 0.25)
    this.noise(0.4, 0.35, { type: 'lowpass', from: 4000, to: 200 })
    this.tone('square', 1600, 400, 0.18, 0.08, 0.04)
  }

  ko() {
    this.tone('sine', 90, 26, 0.9, 0.8)
    this.tone('sawtooth', 300, 40, 0.5, 0.3)
    this.noise(0.7, 0.4, { type: 'lowpass', from: 5000, to: 120 })
    this.tone('square', 120, 30, 0.5, 0.15, 0.1)
  }

  exReady() {
    this.tone('triangle', 520, 880, 0.12, 0.16)
    this.tone('triangle', 780, 1320, 0.14, 0.14, 0.08)
  }

  announce(kind: 'fight' | 'ko' | 'win' | 'round') {
    const base = kind === 'ko' ? 98 : kind === 'fight' ? 147 : kind === 'win' ? 131 : 110
    const gain = kind === 'ko' ? 0.34 : 0.22
    this.tone('sawtooth', base, base * 0.985, 0.4, gain)
    this.tone('sawtooth', base * 1.5, base * 1.495, 0.4, gain * 0.6)
    this.tone('sine', base / 2, base / 2, 0.5, gain)
    if (kind === 'ko') this.noise(0.5, 0.2, { type: 'lowpass', from: 3000, to: 200 }, 0.02)
  }

  ui(kind: 'hover' | 'click') {
    if (kind === 'hover') this.tone('sine', 480, 520, 0.05, 0.05)
    else {
      this.tone('square', 640, 320, 0.08, 0.09)
      this.noise(0.05, 0.06, { type: 'highpass', from: 3000, to: 5000 })
    }
  }

  // ── music ───────────────────────────────────────────────────────────────────
  setScreenMusic(mode: MusicMode | null) {
    this.wantedMusic = mode
    if (!this.ready) return
    if (mode) this.startMusic(mode)
    else this.stopMusic()
  }

  private stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null }
    for (const n of this.musicNodes) { try { n.stop() } catch { /* already stopped */ } }
    this.musicNodes = []
  }

  private startMusic(mode: MusicMode) {
    if (!this.ctx || !this.music) return
    this.stopMusic()
    const ctx = this.ctx
    if (mode === 'menu') {
      // slow detuned drone with a breathing filter
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 240
      filter.Q.value = 2.2
      const g = ctx.createGain()
      g.gain.value = 0.16
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.07
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = 120
      lfo.connect(lfoGain)
      lfoGain.connect(filter.frequency)
      filter.connect(g)
      g.connect(this.music)
      for (const f of [55, 55.6, 110.3]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = f
        o.connect(filter)
        o.start()
        this.musicNodes.push(o)
      }
      lfo.start()
      this.musicNodes.push(lfo)
    } else {
      // fight loop: 132 BPM — kick, offbeat hat, two-note bass pulse
      const beatDur = 60 / 132
      this.musicBeat = 0
      const schedule = () => {
        if (!this.ctx || !this.music || !this.noiseBuf) return
        const ahead = this.ctx.currentTime + 0.35
        while (this.nextTime < ahead) {
          const b = this.musicBeat % 8
          const t = this.nextTime
          // kick on 0 and 4
          if (b === 0 || b === 4) {
            const o = this.ctx.createOscillator()
            o.type = 'sine'
            o.frequency.setValueAtTime(120, t)
            o.frequency.exponentialRampToValueAtTime(44, t + 0.16)
            const g = this.ctx.createGain()
            g.gain.setValueAtTime(0.5, t)
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
            o.connect(g); g.connect(this.music)
            o.start(t); o.stop(t + 0.22)
          }
          // offbeat hat
          if (b % 2 === 1) {
            const src = this.ctx.createBufferSource()
            src.buffer = this.noiseBuf
            const f = this.ctx.createBiquadFilter()
            f.type = 'highpass'; f.frequency.value = 7000
            const g = this.ctx.createGain()
            g.gain.setValueAtTime(0.05, t)
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
            src.connect(f); f.connect(g); g.connect(this.music)
            src.start(t); src.stop(t + 0.06)
          }
          // alternating bass note
          if (b === 0 || b === 3 || b === 6) {
            const o = this.ctx.createOscillator()
            o.type = 'sawtooth'
            o.frequency.value = b === 6 ? 43.65 : 55
            const f = this.ctx.createBiquadFilter()
            f.type = 'lowpass'; f.frequency.value = 300
            const g = this.ctx.createGain()
            g.gain.setValueAtTime(0.16, t)
            g.gain.exponentialRampToValueAtTime(0.001, t + beatDur * 0.9)
            o.connect(f); f.connect(g); g.connect(this.music)
            o.start(t); o.stop(t + beatDur)
          }
          this.nextTime += beatDur / 2
          this.musicBeat++
        }
      }
      this.nextTime = ctx.currentTime + 0.1
      schedule()
      this.musicTimer = setInterval(schedule, 120)
    }
  }

  private nextTime = 0
}

export const audio = new AudioSystem()
