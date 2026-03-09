export const TRAINING_RANGE = {
  start: 48,
  end: 84,
} as const

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const BLACK_KEY_OFFSETS = new Set([1, 3, 6, 8, 10])

export type PianoKeyLayout = {
  note: number
  noteName: string
  isBlack: boolean
  leftUnits: number
  widthUnits: number
}

export type KeyboardLayout = {
  whiteKeyCount: number
  keys: PianoKeyLayout[]
  noteLookup: Map<number, PianoKeyLayout>
}

export const isBlackKey = (midiNote: number) => {
  return BLACK_KEY_OFFSETS.has(midiNote % 12)
}

export const toNoteName = (midiNote: number) => {
  const octave = Math.floor(midiNote / 12) - 1
  const noteName = NOTE_NAMES[midiNote % 12]
  return `${noteName}${octave}`
}

export const createKeyboardLayout = (start: number, end: number): KeyboardLayout => {
  const keys: PianoKeyLayout[] = []
  const noteLookup = new Map<number, PianoKeyLayout>()
  let whiteKeyCount = 0

  for (let note = start; note <= end; note += 1) {
    const key = isBlackKey(note)
    const layout: PianoKeyLayout = {
      note,
      noteName: toNoteName(note),
      isBlack: key,
      leftUnits: key ? whiteKeyCount - 0.37 : whiteKeyCount,
      widthUnits: key ? 0.74 : 1,
    }

    keys.push(layout)
    noteLookup.set(note, layout)

    if (!key) {
      whiteKeyCount += 1
    }
  }

  return {
    whiteKeyCount,
    keys,
    noteLookup,
  }
}

export const KEYBOARD_LAYOUT = createKeyboardLayout(TRAINING_RANGE.start, TRAINING_RANGE.end)

export const getLaneCenterPercent = (note: number) => {
  const key = KEYBOARD_LAYOUT.noteLookup.get(note)

  if (!key) {
    return 0
  }

  return ((key.leftUnits + key.widthUnits / 2) / KEYBOARD_LAYOUT.whiteKeyCount) * 100
}
