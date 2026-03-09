import type { JazzChordFamily, JazzChordOption } from '../types'

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

export const toPitchClass = (midiNote: number) => {
  return ((midiNote % 12) + 12) % 12
}

export const toPitchClassName = (pitchClass: number) => {
  return NOTE_NAMES[toPitchClass(pitchClass)]
}

export const toNoteNames = (notes: number[]) => {
  return notes.map((note) => toNoteName(note))
}

type FreeHarmonyTemplate = {
  suffix: string
  family: JazzChordFamily
  functionLabel: string
  matchIntervals: number[]
  colorIntervals: number[]
  voicingIntervals: number[]
  reason: string
}

export type RankedChordSuggestion = JazzChordOption & {
  score: number
  matchedPitchClasses: number[]
}

const FREE_HARMONY_TEMPLATES: FreeHarmonyTemplate[] = [
  {
    suffix: 'maj9',
    family: 'major',
    functionLabel: 'majeur stable',
    matchIntervals: [0, 4, 11],
    colorIntervals: [2, 7, 9],
    voicingIntervals: [4, 7, 11, 14],
    reason: 'Bonne assise pour une phrase majeure claire, chantante et deja tres jazz.',
  },
  {
    suffix: 'maj9#11',
    family: 'major',
    functionLabel: 'majeur moderne',
    matchIntervals: [0, 4, 11],
    colorIntervals: [2, 6, 7, 9],
    voicingIntervals: [4, 11, 14, 18],
    reason: 'Lecture plus ouverte et contemporaine, utile quand la ligne appelle une vraie lumiere lydienne.',
  },
  {
    suffix: 'm9',
    family: 'minor',
    functionLabel: 'mineur souple',
    matchIntervals: [0, 3, 10],
    colorIntervals: [2, 5, 7],
    voicingIntervals: [3, 7, 10, 14],
    reason: 'Tres bon tapis pour une phrase mineure qui doit rester souple et vocale.',
  },
  {
    suffix: 'm11',
    family: 'minor',
    functionLabel: 'mineur ouvert',
    matchIntervals: [0, 3, 10],
    colorIntervals: [2, 5, 7],
    voicingIntervals: [3, 7, 10, 17],
    reason: 'Convient bien a une ligne mineure modale ou a une respiration plus large.',
  },
  {
    suffix: '9',
    family: 'dominant',
    functionLabel: 'dominante blues',
    matchIntervals: [0, 4, 10],
    colorIntervals: [2, 7, 9],
    voicingIntervals: [4, 10, 14, 19],
    reason: 'Bonne lecture quand la phrase porte deja une tension blues claire autour de la dominante.',
  },
  {
    suffix: '13',
    family: 'dominant',
    functionLabel: 'dominante mobile',
    matchIntervals: [0, 4, 10],
    colorIntervals: [2, 7, 9],
    voicingIntervals: [4, 10, 14, 21],
    reason: 'Bonne lecture quand la phrase appelle du mouvement, de la relance ou une cadence.',
  },
  {
    suffix: '7#9',
    family: 'dominant',
    functionLabel: 'blues tendu',
    matchIntervals: [0, 4, 10],
    colorIntervals: [3, 6, 9],
    voicingIntervals: [4, 10, 15, 21],
    reason: 'Tres fort candidat quand la phrase blues superpose tierce mineure et tierce majeure.',
  },
  {
    suffix: '7b9',
    family: 'altered',
    functionLabel: 'dominante tendue',
    matchIntervals: [0, 4, 10],
    colorIntervals: [1, 6, 9],
    voicingIntervals: [4, 10, 13, 21],
    reason: 'Lecture utile quand la phrase resserre la tension juste avant une resolution.',
  },
  {
    suffix: '13sus',
    family: 'suspended',
    functionLabel: 'suspendu moderne',
    matchIntervals: [0, 5, 10],
    colorIntervals: [2, 7, 9],
    voicingIntervals: [5, 10, 14, 21],
    reason: 'Marche bien quand la ligne evite la tierce et laisse une couleur suspendue.',
  },
  {
    suffix: '7alt',
    family: 'altered',
    functionLabel: 'dominante alteree',
    matchIntervals: [0, 4, 10],
    colorIntervals: [1, 3, 6, 8],
    voicingIntervals: [4, 10, 15, 20],
    reason: 'Lecture utile si ta phrase concentre des tensions qui veulent pousser la suite.',
  },
  {
    suffix: 'm7b5',
    family: 'half-diminished',
    functionLabel: 'demi-diminue',
    matchIntervals: [0, 3, 6, 10],
    colorIntervals: [1, 5, 8],
    voicingIntervals: [3, 6, 10, 13],
    reason: 'Bonne couleur si la ligne devient plus sombre ou prepare une dominante.',
  },
]

const sortAscending = (notes: number[]) => {
  return [...notes].sort((left, right) => left - right)
}

const transposePitchClasses = (intervals: number[], rootPitchClass: number) => {
  return intervals.map((interval) => toPitchClass(rootPitchClass + interval))
}

export const normalizeVoicingBelowSplit = (voicing: number[], splitNote: number) => {
  return sortAscending(voicing.map((note) => {
    let normalizedNote = note

    while (normalizedNote >= splitNote) {
      normalizedNote -= 12
    }

    while (normalizedNote < TRAINING_RANGE.start) {
      normalizedNote += 12
    }

    return normalizedNote
  }))
}

export const isNoteInPitchClassSet = (midiNote: number, pitchClasses: number[]) => {
  const pitchClass = toPitchClass(midiNote)

  return pitchClasses.includes(pitchClass)
}

export const getFreeHarmonyChordOptions = (splitNote: number) => {
  return NOTE_NAMES.flatMap((rootName, rootPitchClass) => {
    const anchorNote = splitNote - 12 + rootPitchClass

    return FREE_HARMONY_TEMPLATES.map((template) => ({
      label: `${rootName}${template.suffix}`,
      family: template.family,
      functionLabel: template.functionLabel,
      rootPitchClass,
      leftHandVoicing: normalizeVoicingBelowSplit(
        template.voicingIntervals.map((interval) => anchorNote + interval),
        splitNote,
      ),
      matchPitchClasses: transposePitchClasses(template.matchIntervals, rootPitchClass),
      colorPitchClasses: transposePitchClasses(template.colorIntervals, rootPitchClass),
      reason: template.reason,
    }))
  })
}

const getIntervalPresence = (recentPitchClasses: number[], rootPitchClass: number, interval: number) => {
  return recentPitchClasses.includes(toPitchClass(rootPitchClass + interval))
}

const getStyleBonus = (option: JazzChordOption, recentPitchClasses: number[]) => {
  const rootPitchClass = option.rootPitchClass

  if (rootPitchClass === undefined || option.family === undefined) {
    return 0
  }

  const hasMajorThird = getIntervalPresence(recentPitchClasses, rootPitchClass, 4)
  const hasMinorThird = getIntervalPresence(recentPitchClasses, rootPitchClass, 3)
  const hasFlatSeven = getIntervalPresence(recentPitchClasses, rootPitchClass, 10)
  const hasNaturalSeven = getIntervalPresence(recentPitchClasses, rootPitchClass, 11)
  const hasNinth = getIntervalPresence(recentPitchClasses, rootPitchClass, 2)
  const hasEleventh = getIntervalPresence(recentPitchClasses, rootPitchClass, 5)
  const hasSharpEleven = getIntervalPresence(recentPitchClasses, rootPitchClass, 6)
  const hasFlatFive = getIntervalPresence(recentPitchClasses, rootPitchClass, 6)
  const hasThirteenth = getIntervalPresence(recentPitchClasses, rootPitchClass, 9)
  const hasFlatNine = getIntervalPresence(recentPitchClasses, rootPitchClass, 1)
  const hasSharpNine = getIntervalPresence(recentPitchClasses, rootPitchClass, 3)
  const hasSuspendedFourth = getIntervalPresence(recentPitchClasses, rootPitchClass, 5)

  switch (option.family) {
    case 'dominant': {
      let bonus = 0

      if (hasMajorThird && hasFlatSeven) {
        bonus += 9
      }

      if (hasMinorThird && hasMajorThird) {
        bonus += 7
      }

      if (hasFlatFive) {
        bonus += 4
      }

      if (hasNinth || hasThirteenth) {
        bonus += 3
      }

      if (!hasFlatSeven) {
        bonus -= 3
      }

      return bonus
    }
    case 'altered': {
      let bonus = 0

      if (hasMajorThird && hasFlatSeven) {
        bonus += 7
      }

      if (hasFlatNine || hasSharpNine || hasSharpEleven) {
        bonus += 6
      }

      if (!hasFlatNine && !hasSharpNine && !hasSharpEleven) {
        bonus -= 4
      }

      return bonus
    }
    case 'suspended': {
      let bonus = 0

      if (hasSuspendedFourth && hasFlatSeven) {
        bonus += 7
      }

      if (hasNinth || hasThirteenth) {
        bonus += 4
      }

      if (hasMajorThird) {
        bonus -= 5
      }

      return bonus
    }
    case 'minor': {
      let bonus = 0

      if (hasMinorThird && hasFlatSeven) {
        bonus += 7
      }

      if (hasEleventh || hasNinth) {
        bonus += 2
      }

      if (hasMajorThird && !hasMinorThird) {
        bonus -= 4
      }

      return bonus
    }
    case 'major': {
      let bonus = 0

      if (hasMajorThird && hasNaturalSeven) {
        bonus += 7
      }

      if (hasSharpEleven) {
        bonus += 2
      }

      if (hasMinorThird && hasFlatSeven && !hasNaturalSeven) {
        bonus -= 7
      }

      return bonus
    }
    case 'half-diminished':
      return hasMinorThird && hasFlatFive && hasFlatSeven ? 6 : -2
    default:
      return 0
  }
}

export const getChordSuggestions = (recentNotes: number[], chordOptions: JazzChordOption[]) => {
  if (chordOptions.length === 0) {
    return [] as RankedChordSuggestion[]
  }

  const pitchClassWeights = [...recentNotes].reverse().reduce((weights, note, index) => {
    const pitchClass = toPitchClass(note)

    if (!weights.has(pitchClass)) {
      weights.set(pitchClass, recentNotes.length - index)
    }

    return weights
  }, new Map<number, number>())
  const recentPitchClasses = [...pitchClassWeights.keys()]

  if (recentPitchClasses.length === 0) {
    return [
      {
        ...chordOptions[0],
        score: 0,
        matchedPitchClasses: [] as number[],
      },
    ]
  }

  return chordOptions
    .map((option) => {
      const matchedPitchClasses = recentPitchClasses.filter((pitchClass) => {
        return option.matchPitchClasses.includes(pitchClass) || option.colorPitchClasses.includes(pitchClass)
      })
      const matchWeight = recentPitchClasses.reduce((total, pitchClass) => {
        return option.matchPitchClasses.includes(pitchClass)
          ? total + (pitchClassWeights.get(pitchClass) ?? 0)
          : total
      }, 0)
      const colorWeight = recentPitchClasses.reduce((total, pitchClass) => {
        return option.colorPitchClasses.includes(pitchClass)
          ? total + (pitchClassWeights.get(pitchClass) ?? 0)
          : total
      }, 0)
      const unsupportedWeight = recentPitchClasses.reduce((total, pitchClass) => {
        return matchedPitchClasses.includes(pitchClass)
          ? total
          : total + (pitchClassWeights.get(pitchClass) ?? 0)
      }, 0)
      const styleBonus = getStyleBonus(option, recentPitchClasses)

      return {
        ...option,
        score: matchWeight * 3 + colorWeight * 2 - unsupportedWeight * 2 + styleBonus,
        matchedPitchClasses,
      }
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return right.matchedPitchClasses.length - left.matchedPitchClasses.length
    })
}

export const getChordSuggestion = (recentNotes: number[], chordOptions: JazzChordOption[]) => {
  return getChordSuggestions(recentNotes, chordOptions)[0] ?? null
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
