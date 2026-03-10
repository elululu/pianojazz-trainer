import { startTransition, useEffect, useRef, useState } from 'react'
import { modernExercises as exercises } from './data/modernExercises'
import { modeChallenges } from './data/modeChallenges'
import { useMidi, type MidiNoteEvent } from './hooks/useMidi'
import type {
  ArtistSceneFamily,
  Exercise,
  ExerciseEvent,
  ExerciseLessonKind,
  ExerciseStandardSection,
  ExerciseStep,
  ExerciseTrack,
  GuidedChordRecipeId,
  ModeGeneratedColor,
  ModeGuidedProgression,
  ModeRhythmGuide,
  ModeRhythmSubdivision,
  StepMatchMode,
} from './types'
import {
  createKeyboardLayout,
  KEYBOARD_LAYOUT,
  TRAINING_RANGE,
  getChordSuggestions,
  getFreeHarmonyChordOptions,
  isNoteInPitchClassSet,
  normalizeVoicingBelowSplit,
  toNoteName,
  toNoteNames,
  toPitchClassName,
} from './lib/music'

const VISIBLE_HISTORY = 1
const VISIBLE_STEPS = 5
const ROLL_STEP_GAP = 14
const ROLL_TARGET_BOTTOM = -4
const ROLL_LEAD_IN = 18
const ROLL_RELEASE_TRAVEL = 14
const ROLL_NOTE_HEIGHT_PER_BEAT = 11
const ROLL_ENTRY_FADE_WINDOW = 10
const ROLL_ENTRY_LIFT_PX = 18
const ROLL_TARGET_FLOAT_PX = 4
const MAX_RESUMED_SCROLL_PROGRESS = 0.58
const CALL_RESPONSE_LENGTH = 3
const PROMPT_NOTE_RELEASE_MS = 90
const RIGHT_HAND_HISTORY_LIMIT = 6
const IMPRO_STREAK_TARGET = 8
const WRONG_NOTE_FLASH_MS = 260
const ALERT_NOTE_COOLDOWN_MS = 140
const PROGRESS_STORAGE_KEY = 'pianojazz-progress-v1'
const LAB_PREFERENCES_STORAGE_KEY = 'pianojazz-lab-preferences-v1'
const FREE_HARMONY_LAB_ID = 'free-harmony-lab'
const FREE_HARMONY_SPLIT_NOTE = 60
const LEFT_HAND_MIN_START = 24
const LEFT_HAND_DEFAULT_WINDOW = 24
const RIGHT_HAND_DEFAULT_WINDOW = 25
const KEYBOARD_WINDOW_MIN = 18
const KEYBOARD_WINDOW_MAX = 36
const KEYBOARD_WINDOW_STEP = 6
const ARTIST_FILTER_ALL = 'Tous'

type PracticeSurface = 'courses' | 'improv-lab'
type CourseWorkspaceMode = 'browser' | 'practice'
type LessonMode = 'guided' | 'call-response'
type CallResponseState = 'idle' | 'playing' | 'waiting' | 'success'
type ImprovLabMode = 'modal-training' | 'free-harmony'
type GuidedProgressionSource = 'written' | 'generated'
type LeftHandDensityMode = 'shell' | 'dense'
type ArtistFilterValue = typeof ARTIST_FILTER_ALL | ArtistSceneFamily

type PracticeProgress = {
  bestAccuracy: number
  bestCompletedRuns: number
  masteryRank: number
  masteryLabel: string
  tempoBonus: number
  lastMode: string
  lastPracticedAt: string
  bestStreak?: number
  bestVoicingHits?: number
  bestGrooveScore?: number
  lastVariationTitle?: string
  lastArtistFamily?: ArtistSceneFamily
}

type ProgressStore = Record<string, PracticeProgress>

type LabPreferences = {
  selectedArtistFamily: ArtistFilterValue
  guidedAutoAdvance: boolean
  leftHandDensityMode: LeftHandDensityMode
  improvLeftHandStart: number
  improvLeftHandWindow: number
  improvRightHandStart: number
  improvRightHandWindow: number
}

const GUIDED_CHORD_RECIPES: Record<GuidedChordRecipeId, {
  suffix: string
  leftIntervals: number[]
  rightIntervals: number[]
}> = {
  minor9Add11: {
    suffix: 'm9 add11',
    leftIntervals: [0, 12],
    rightIntervals: [14, 17, 19, 24],
  },
  sus13: {
    suffix: '13sus',
    leftIntervals: [0, 10],
    rightIntervals: [14, 17, 21, 24],
  },
  major9: {
    suffix: 'maj9',
    leftIntervals: [0, 11],
    rightIntervals: [14, 16, 19, 23],
  },
  major9Sharp11: {
    suffix: 'maj9#11',
    leftIntervals: [0, 11],
    rightIntervals: [14, 18, 19, 23],
  },
  neoSoulMinor11: {
    suffix: 'neo m11',
    leftIntervals: [0, 7],
    rightIntervals: [15, 19, 22, 26],
  },
  glasperMajor9Sharp11: {
    suffix: 'halo maj9#11',
    leftIntervals: [0, 7],
    rightIntervals: [11, 14, 18, 21],
  },
  fkjSus13: {
    suffix: 'fkj sus13',
    leftIntervals: [0, 7],
    rightIntervals: [10, 14, 17, 21],
  },
  clusterMinorMaj9: {
    suffix: 'cluster mMaj9',
    leftIntervals: [0, 11],
    rightIntervals: [14, 15, 19, 23],
  },
  fusionDominantSharp11: {
    suffix: 'fusion 7#11',
    leftIntervals: [0, 10],
    rightIntervals: [16, 18, 21, 26],
  },
  minor11: {
    suffix: 'm11',
    leftIntervals: [0, 10],
    rightIntervals: [15, 17, 19, 24],
  },
  minorMaj9: {
    suffix: 'mMaj9',
    leftIntervals: [0, 11],
    rightIntervals: [15, 16, 19, 23],
  },
  altDominant: {
    suffix: '7alt',
    leftIntervals: [0, 10],
    rightIntervals: [13, 16, 20, 25],
  },
  dominantSharp11: {
    suffix: '7#11',
    leftIntervals: [0, 10],
    rightIntervals: [16, 18, 21, 24],
  },
  halfDiminished11: {
    suffix: 'm11b5',
    leftIntervals: [0, 10],
    rightIntervals: [14, 17, 18, 21],
  },
  pedalMinor11: {
    suffix: 'pedal m11',
    leftIntervals: [0, 12],
    rightIntervals: [15, 17, 19, 24],
  },
  pedalMajor9Sharp11: {
    suffix: 'pedal maj9#11',
    leftIntervals: [0, 12],
    rightIntervals: [14, 18, 19, 23],
  },
}

const sortedNotes = (notes: Iterable<number>) => {
  return [...notes].sort((left, right) => left - right)
}

const clamp01 = (value: number) => {
  return Math.max(0, Math.min(value, 1))
}

const easeOutCubic = (value: number) => {
  const clamped = clamp01(value)

  return 1 - (1 - clamped) ** 3
}

const easeInOutCubic = (value: number) => {
  const clamped = clamp01(value)

  if (clamped < 0.5) {
    return 4 * clamped ** 3
  }

  return 1 - ((-2 * clamped + 2) ** 3) / 2
}

const getLoopedStep = <T,>(items: T[], index: number) => {
  if (items.length === 0) {
    return undefined
  }

  const normalizedIndex = ((index % items.length) + items.length) % items.length

  return items[normalizedIndex]
}

const buildGeneratedProgression = (generatedColor: ModeGeneratedColor): ModeGuidedProgression => {
  return {
    id: generatedColor.id,
    title: generatedColor.title,
    description: generatedColor.description,
    steps: generatedColor.steps.map((step) => {
      const recipe = GUIDED_CHORD_RECIPES[step.recipeId]

      return {
        id: step.id,
        label: `${step.rootName}${recipe.suffix}`,
        leftHandVoicing: recipe.leftIntervals.map((interval) => step.rootMidi + interval),
        rightHandVoicing: recipe.rightIntervals.map((interval) => step.rootMidi + interval),
        cue: step.cue,
      }
    }),
  }
}

const noteSetMatches = (pressedNotes: Set<number>, expectedNotes: number[]) => {
  return pressedNotes.size === expectedNotes.length && expectedNotes.every((note) => pressedNotes.has(note))
}

const getStepEvents = (step?: ExerciseStep): ExerciseEvent[] => {
  if (!step) {
    return []
  }

  if (step.events && step.events.length > 0) {
    return step.events
  }

  return [{
    notes: step.notes,
    hand: step.hand ?? 'both',
    offsetBeats: step.offsetBeats ?? 0,
    durationBeats: step.durationBeats ?? step.beatSpan,
    label: step.label,
    matchMode: step.matchMode,
  }]
}

const getStepExpectedNotes = (step?: ExerciseStep) => {
  return sortedNotes(new Set(getStepEvents(step).flatMap((event) => event.notes)))
}

const getStepMatchMode = (step?: ExerciseStep): StepMatchMode => {
  if (!step) {
    return 'exact'
  }

  if (step.matchMode) {
    return step.matchMode
  }

  const stepEvents = getStepEvents(step)

  if (stepEvents.length > 1) {
    return 'contains'
  }

  return stepEvents[0]?.matchMode ?? 'exact'
}

const isStepNoteExpected = (step: ExerciseStep | undefined, note: number) => {
  return getStepExpectedNotes(step).includes(note)
}

const doesStepMatch = (pressedNotes: Set<number>, step?: ExerciseStep) => {
  if (!step) {
    return false
  }

  const expectedNotes = getStepExpectedNotes(step)

  if (getStepMatchMode(step) === 'contains') {
    return expectedNotes.every((note) => pressedNotes.has(note))
  }

  return noteSetMatches(pressedNotes, expectedNotes)
}

const getBeatOffsetToStep = (steps: Array<{ beatSpan: number }>, currentIndex: number, stepIndex: number) => {
  if (stepIndex === currentIndex) {
    return 0
  }

  if (stepIndex > currentIndex) {
    return steps.slice(currentIndex, stepIndex).reduce((total, step) => total + step.beatSpan, 0)
  }

  return -steps.slice(stepIndex, currentIndex).reduce((total, step) => total + step.beatSpan, 0)
}

const getCumulativeBeatOffset = (steps: Array<{ beatSpan: number }>, endIndex: number) => {
  return steps.slice(0, endIndex).reduce((total, step) => total + step.beatSpan, 0)
}

const compareExercises = (left: Exercise, right: Exercise) => {
  return left.phaseOrder - right.phaseOrder || left.order - right.order || getModuleOrder(left.module) - getModuleOrder(right.module)
}

const getLessonKindLabel = (lessonKind: ExerciseLessonKind) => {
  switch (lessonKind) {
    case 'standard':
      return 'Scene'
    case 'mini-piece':
      return 'Etude'
    default:
      return 'Concept'
  }
}

const getCategoryLabel = (category: Exercise['category']) => {
  switch (category) {
    case 'color':
      return 'Couleur'
    case 'motif':
      return 'Motif'
    case 'pocket':
      return 'Pocket'
    case 'rhythm':
      return 'Rythme'
    case 'texture':
      return 'Texture'
    default:
      return 'Voicings'
  }
}

const getSceneSectionLabel = (section?: ExerciseStandardSection) => {
  switch (section) {
    case 'build':
      return 'Montee'
    case 'capsule':
      return 'Capsule'
    case 'loop':
      return 'Loop'
    case 'release':
      return 'Retombee'
    case 'scene':
      return 'Scene'
    default:
      return 'Vamp'
  }
}

const getTrackLabel = (track: ExerciseTrack) => {
  switch (track) {
    case 'comping':
      return 'Comping'
    case 'two-hands':
      return 'Deux mains'
    default:
      return 'Impro'
  }
}

const getMasteryState = (noteOnCount: number, completedRuns: number, accuracy: number, mistakes: number) => {
  if (noteOnCount === 0) {
    return {
      label: 'A lancer',
      detail: 'Demarre lentement et vise d abord une boucle propre.',
      rank: 0,
    }
  }

  if (completedRuns >= 3 && accuracy >= 92) {
    return {
      label: 'Integre',
      detail: `${completedRuns} boucles propres: tu peux deja etendre la matiere musicale.`,
      rank: 3,
    }
  }

  if (completedRuns >= 1 && accuracy >= 82) {
    return {
      label: 'Stable',
      detail: `${completedRuns} boucle(s) validee(s): consolide avant d accelerer.`,
      rank: 2,
    }
  }

  if (mistakes === 0) {
    return {
      label: 'En place',
      detail: 'Les notes sont justes, installe maintenant la pulsation et le son.',
      rank: 1,
    }
  }

  return {
    label: 'En chantier',
    detail: 'Ralentis et privilegie l oreille avant la vitesse.',
    rank: 0,
  }
}

const getLiveTempoBonus = (completedRuns: number, accuracy: number) => {
  if (completedRuns >= 4 && accuracy >= 92) {
    return 8
  }

  if (completedRuns >= 2 && accuracy >= 88) {
    return 4
  }

  return 0
}

const getTimingFromTempo = (tempo: number) => {
  const beatMs = 60000 / tempo

  return {
    previewMs: Math.round(beatMs * 3.1),
    advanceMs: Math.round(beatMs * 0.45),
    promptStepMs: beatMs,
  }
}

const midiToFrequency = (note: number) => {
  return 440 * 2 ** ((note - 69) / 12)
}

const getPromptIndices = (stepCount: number, startIndex: number) => {
  const promptLength = Math.min(CALL_RESPONSE_LENGTH, stepCount)

  return Array.from({ length: promptLength }, (_, index) => (startIndex + index) % stepCount)
}

const average = (values: number[]) => {
  if (values.length === 0) {
    return 0
  }

  return values.reduce((total, value) => total + value, 0) / values.length
}

const median = (values: number[]) => {
  if (values.length === 0) {
    return 0
  }

  const ordered = [...values].sort((left, right) => left - right)
  const middleIndex = Math.floor(ordered.length / 2)

  if (ordered.length % 2 === 0) {
    return (ordered[middleIndex - 1] + ordered[middleIndex]) / 2
  }

  return ordered[middleIndex]
}

const standardDeviation = (values: number[]) => {
  if (values.length <= 1) {
    return 0
  }

  const mean = average(values)
  const variance = average(values.map((value) => (value - mean) ** 2))

  return Math.sqrt(variance)
}

const getSubdivisionMultiplier = (subdivision: ModeRhythmSubdivision) => {
  switch (subdivision) {
    case 'sixteenths':
      return 0.25
    case 'triplets':
      return 1 / 3
    case 'eighths':
      return 0.5
    default:
      return 1
  }
}

const getSubdivisionLabel = (subdivision: ModeRhythmSubdivision) => {
  switch (subdivision) {
    case 'sixteenths':
      return '16e'
    case 'triplets':
      return 'triolet'
    case 'eighths':
      return 'croches'
    default:
      return 'temps'
  }
}

const getGrooveAssessment = (noteTimestamps: number[], rhythmGuide: ModeRhythmGuide) => {
  const intervals = noteTimestamps.slice(1).map((timestamp, index) => timestamp - noteTimestamps[index])

  if (intervals.length < 2) {
    return {
      label: 'Pulse a poser',
      detail: `${rhythmGuide.countPattern} · ${rhythmGuide.placementHint}`,
      score: 0,
    }
  }

  const beatMs = 60000 / rhythmGuide.pulseBpm
  const targetInterval = beatMs * getSubdivisionMultiplier(rhythmGuide.subdivision)
  const medianInterval = median(intervals)
  const distance = Math.abs(medianInterval - targetInterval) / targetInterval
  const spread = standardDeviation(intervals) / Math.max(medianInterval, 1)
  const score = Math.max(0, Math.round(100 - distance * 70 - spread * 80))

  if (score >= 78) {
    return {
      label: 'Pocket solide',
      detail: `${getSubdivisionLabel(rhythmGuide.subdivision)} lisibles autour de ${rhythmGuide.pulseBpm} BPM. ${rhythmGuide.pocketHint}`,
      score,
    }
  }

  if (score >= 52) {
    return {
      label: 'Pulse lisible',
      detail: `Le debit est proche du cadre. Resserre encore ${rhythmGuide.countPattern.toLowerCase()}.`,
      score,
    }
  }

  return {
    label: 'Placement flottant',
    detail: `${rhythmGuide.placementHint} Reviens a ${rhythmGuide.countPattern.toLowerCase()}.`,
    score,
  }
}

const getDensityAssessment = (noteCount: number, minPhraseNotes: number, maxPhraseNotes: number) => {
  if (noteCount === 0) {
    return 'Phrase vide pour l instant'
  }

  if (noteCount < minPhraseNotes) {
    return 'Encore un peu court: ajoute juste une petite reponse.'
  }

  if (noteCount > maxPhraseNotes) {
    return 'Phrase un peu dense: coupe avant la derniere idee.'
  }

  return 'Densite juste: la phrase garde de l air.'
}

const getColorAssessment = (notes: number[], focusPitchClasses: number[]) => {
  if (notes.length === 0) {
    return 'Couleur encore muette.'
  }

  const matchedFocus = new Set(notes.map((note) => note % 12).filter((pitchClass) => focusPitchClasses.includes(pitchClass))).size

  if (matchedFocus >= 2) {
    return 'Couleur bien visee: les notes-signature sont la.'
  }

  if (matchedFocus === 1) {
    return 'Une note-signature est la: renforce-la dans la phrase.'
  }

  return 'Bonne matiere, mais la couleur-cle n est pas encore assez nette.'
}

const getVoiceLeadingAssessment = (previousVoicing: number[], currentVoicing: number[]) => {
  if (previousVoicing.length === 0 || currentVoicing.length === 0) {
    return 'Le prochain accord dira la conduite.'
  }

  const commonTones = currentVoicing.filter((note) => previousVoicing.includes(note)).length
  const averageMotion = average(currentVoicing.map((note) => {
    return Math.min(...previousVoicing.map((previousNote) => Math.abs(previousNote - note)))
  }))

  if (commonTones >= 2 || averageMotion <= 2.5) {
    return 'Conduite fluide: garde cette logique de glissement.'
  }

  if (averageMotion <= 5) {
    return 'Conduite correcte: tu peux encore lisser le passage.'
  }

  return 'Saut assez large: cherche une voix commune ou un demi-ton de plus.'
}

const readSavedProgress = () => {
  try {
    const rawValue = window.localStorage.getItem(PROGRESS_STORAGE_KEY)

    if (!rawValue) {
      return {}
    }

    return JSON.parse(rawValue) as ProgressStore
  } catch {
    return {}
  }
}

const readSavedLabPreferences = (): LabPreferences => {
  const defaults: LabPreferences = {
    selectedArtistFamily: ARTIST_FILTER_ALL,
    guidedAutoAdvance: true,
    leftHandDensityMode: 'shell',
    improvLeftHandStart: 36,
    improvLeftHandWindow: LEFT_HAND_DEFAULT_WINDOW,
    improvRightHandStart: FREE_HARMONY_SPLIT_NOTE,
    improvRightHandWindow: RIGHT_HAND_DEFAULT_WINDOW,
  }

  try {
    const rawValue = window.localStorage.getItem(LAB_PREFERENCES_STORAGE_KEY)

    if (!rawValue) {
      return defaults
    }

    return {
      ...defaults,
      ...(JSON.parse(rawValue) as Partial<LabPreferences>),
    }
  } catch {
    return defaults
  }
}

const getModuleOrder = (moduleLabel: string) => {
  const match = moduleLabel.match(/(\d+)/)

  return Number(match?.[1] ?? 0)
}

const getLeftHandFingerMap = (voicing: number[]) => {
  const orderedVoicing = sortedNotes(voicing)

  if (orderedVoicing.length === 0) {
    return new Map<number, number>()
  }

  const span = orderedVoicing[orderedVoicing.length - 1] - orderedVoicing[0]
  let fingers: number[]

  if (orderedVoicing.length === 1) {
    fingers = [1]
  } else if (orderedVoicing.length === 2) {
    fingers = [5, 1]
  } else if (orderedVoicing.length === 3) {
    fingers = span >= 10 ? [5, 2, 1] : [5, 3, 1]
  } else if (orderedVoicing.length === 4) {
    fingers = span <= 6 ? [5, 4, 2, 1] : [5, 3, 2, 1]
  } else {
    fingers = [5, 4, 3, 2, 1]
  }

  return new Map(orderedVoicing.map((note, index) => [note, fingers[index] ?? 1]))
}

const fitNoteIntoLeftHandRange = (note: number, splitNote: number) => {
  let fittedNote = note

  while (fittedNote >= splitNote) {
    fittedNote -= 12
  }

  while (fittedNote < LEFT_HAND_MIN_START) {
    fittedNote += 12
  }

  return fittedNote
}

const buildDenseLeftHandVoicing = (baseVoicing: number[], rightHandVoicing: number[], splitNote: number) => {
  const orderedBase = sortedNotes(baseVoicing)

  if (orderedBase.length === 0) {
    return []
  }

  const shiftedRightHand = rightHandVoicing
    .map((note) => fitNoteIntoLeftHandRange(note, splitNote))
    .filter((note) => note < splitNote)
    .sort((left, right) => left - right)

  const extraNotes = shiftedRightHand.filter((note) => {
    return !orderedBase.includes(note) && !orderedBase.some((baseNote) => Math.abs(baseNote - note) <= 1)
  })

  const targetSize = orderedBase.length <= 2 ? 3 : 4
  const denseVoicing = [...orderedBase]

  extraNotes.forEach((note) => {
    if (denseVoicing.length < targetSize) {
      denseVoicing.push(note)
    }
  })

  return sortedNotes(denseVoicing)
}

export default function App() {
  const [practiceSurface, setPracticeSurface] = useState<PracticeSurface>('courses')
  const [courseWorkspaceMode, setCourseWorkspaceMode] = useState<CourseWorkspaceMode>('browser')
  const [selectedExerciseId, setSelectedExerciseId] = useState(() => [...exercises].sort(compareExercises)[0]?.id ?? exercises[0].id)
  const [selectedChallengeId, setSelectedChallengeId] = useState(modeChallenges[0].id)
  const [improvLabMode, setImprovLabMode] = useState<ImprovLabMode>('modal-training')
  const [lessonMode, setLessonMode] = useState<LessonMode>('guided')
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [pressedNotes, setPressedNotes] = useState<number[]>([])
  const [demoNotes, setDemoNotes] = useState<number[]>([])
  const [lastInputLabel, setLastInputLabel] = useState('Aucune note recue')
  const [noteOnCount, setNoteOnCount] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [completedRuns, setCompletedRuns] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [advanceStartedAt, setAdvanceStartedAt] = useState<number | null>(null)
  const [callResponseState, setCallResponseState] = useState<CallResponseState>('idle')
  const [promptStepIndices, setPromptStepIndices] = useState<number[]>([])
  const [responseStepCursor, setResponseStepCursor] = useState(0)
  const [activePromptPosition, setActivePromptPosition] = useState<number | null>(null)
  const [progressStore, setProgressStore] = useState<ProgressStore>(() => readSavedProgress())
  const [improvRightHandHistory, setImprovRightHandHistory] = useState<number[]>([])
  const [improvValidNotes, setImprovValidNotes] = useState(0)
  const [improvWrongNotes, setImprovWrongNotes] = useState(0)
  const [improvCleanPhrases, setImprovCleanPhrases] = useState(0)
  const [improvStreak, setImprovStreak] = useState(0)
  const [improvFeedbackLabel, setImprovFeedbackLabel] = useState('Choisis un mode puis improvise main droite.')
  const [improvAlertNote, setImprovAlertNote] = useState<number | null>(null)
  const [selectedArtistFamily, setSelectedArtistFamily] = useState<ArtistFilterValue>(() => readSavedLabPreferences().selectedArtistFamily)
  const [guidedChordStepIndex, setGuidedChordStepIndex] = useState(0)
  const [guidedProgressionSource, setGuidedProgressionSource] = useState<GuidedProgressionSource>('written')
  const [selectedGuidedProgressionId, setSelectedGuidedProgressionId] = useState(modeChallenges[0].guidedProgressions[0]?.id ?? '')
  const [selectedGeneratedColorId, setSelectedGeneratedColorId] = useState(modeChallenges[0].generatedColors[0]?.id ?? '')
  const [guidedAutoAdvance, setGuidedAutoAdvance] = useState(() => readSavedLabPreferences().guidedAutoAdvance)
  const [guidedVoicingHits, setGuidedVoicingHits] = useState(0)
  const [leftHandDensityMode, setLeftHandDensityMode] = useState<LeftHandDensityMode>(() => readSavedLabPreferences().leftHandDensityMode)
  const [improvLeftHandStart, setImprovLeftHandStart] = useState(() => readSavedLabPreferences().improvLeftHandStart)
  const [improvLeftHandWindow, setImprovLeftHandWindow] = useState(() => readSavedLabPreferences().improvLeftHandWindow)
  const [improvRightHandStart, setImprovRightHandStart] = useState(() => readSavedLabPreferences().improvRightHandStart)
  const [improvRightHandWindow, setImprovRightHandWindow] = useState(() => readSavedLabPreferences().improvRightHandWindow)
  const [showUpcomingNotes, setShowUpcomingNotes] = useState(true)
  const [improvNoteTimestamps, setImprovNoteTimestamps] = useState<number[]>([])
  const [improvBestStreak, setImprovBestStreak] = useState(0)
  const pressedNotesRef = useRef(new Set<number>())
  const activeNoteSourcesRef = useRef(new Map<number, Set<string>>())
  const pointerHeldNotesRef = useRef(new Set<number>())
  const stepActivatedAtRef = useRef(Date.now())
  const advanceTimeoutRef = useRef<number | null>(null)
  const promptTimeoutsRef = useRef<number[]>([])
  const alertTimeoutRef = useRef<number | null>(null)
  const guidedAdvanceTimeoutRef = useRef<number | null>(null)
  const lastAlertAtRef = useRef(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const demoNotesRef = useRef(new Set<number>())
  const isAdvancingRef = useRef(false)
  const completedGuidedStepRef = useRef<string | null>(null)
  const [stableChordLabel, setStableChordLabel] = useState<string | null>(null)

  const orderedExercises = [...exercises].sort(compareExercises)
  const exerciseLookup = new Map(orderedExercises.map((exercise) => [exercise.id, exercise]))
  const selectedExercise = exercises.find((exercise) => exercise.id === selectedExerciseId) ?? exercises[0]
  const artistFamilies = [
    ARTIST_FILTER_ALL,
    ...Array.from(new Set(modeChallenges.flatMap((challenge) => challenge.artistFamilies))),
  ] as ArtistFilterValue[]
  const filteredChallenges = selectedArtistFamily === ARTIST_FILTER_ALL
    ? modeChallenges
    : modeChallenges.filter((challenge) => challenge.artistFamilies.includes(selectedArtistFamily))
  const selectedChallenge = filteredChallenges.find((challenge) => challenge.id === selectedChallengeId)
    ?? filteredChallenges[0]
    ?? modeChallenges[0]
  const savedModuleProgress = progressStore[selectedExerciseId]
  const isCourseBrowser = practiceSurface === 'courses' && courseWorkspaceMode === 'browser'
  const isCoursePractice = practiceSurface === 'courses' && courseWorkspaceMode === 'practice'
  const isFreeHarmonyMode = improvLabMode === 'free-harmony'
  const improvSplitNote = isFreeHarmonyMode ? FREE_HARMONY_SPLIT_NOTE : selectedChallenge.splitNote
  const improvModeName = isFreeHarmonyMode ? 'Libre harmonique' : selectedChallenge.modeName
  const improvTitle = isFreeHarmonyMode ? 'Mode libre harmonique' : selectedChallenge.title
  const improvDifficultyLabel = isFreeHarmonyMode ? 'libre' : selectedChallenge.difficulty
  const improvHandFocusLabel = isFreeHarmonyMode ? 'main droite -> accords main gauche' : selectedChallenge.handFocus
  const improvPrompt = isFreeHarmonyMode
    ? 'Joue les notes que tu veux main droite. Le labo lit la couleur de ta phrase et te propose les accords jazz les plus credibles main gauche.'
    : selectedChallenge.improvPrompt
  const improvTargetColor = isFreeHarmonyMode
    ? 'Vise une cellule claire de 3 a 6 notes: je traduis ensuite cette couleur en voicing jazz main gauche.'
    : selectedChallenge.targetColor
  const defaultImprovFeedbackLabel = isFreeHarmonyMode
    ? `Mode libre actif: joue une phrase main droite au-dessus de ${toNoteName(improvSplitNote)} pour recevoir un accord jazz main gauche.`
    : `Scene guidee active: ${selectedChallenge.modeName}. Improvise main droite au-dessus de ${toNoteName(selectedChallenge.splitNote)}.`
  const improvChordOptions = isFreeHarmonyMode
    ? getFreeHarmonyChordOptions(improvSplitNote)
    : selectedChallenge.chordOptions
  const selectedWrittenProgression = selectedChallenge.guidedProgressions.find((progression) => progression.id === selectedGuidedProgressionId)
    ?? selectedChallenge.guidedProgressions[0]
  const selectedGeneratedColor = selectedChallenge.generatedColors.find((color) => color.id === selectedGeneratedColorId)
    ?? selectedChallenge.generatedColors[0]
  const hasWrittenProgressions = selectedChallenge.guidedProgressions.length > 0
  const hasGeneratedColors = selectedChallenge.generatedColors.length > 0
  const effectiveGuidedSource = hasWrittenProgressions
    ? guidedProgressionSource
    : hasGeneratedColors
      ? 'generated'
      : 'written'
  const generatedGuidedProgression = selectedGeneratedColor ? buildGeneratedProgression(selectedGeneratedColor) : undefined
  const guidedProgression = isFreeHarmonyMode
    ? null
    : effectiveGuidedSource === 'generated'
      ? generatedGuidedProgression ?? selectedWrittenProgression ?? null
      : selectedWrittenProgression ?? generatedGuidedProgression ?? null
  const guidedProgressionSteps = guidedProgression?.steps ?? []
  const activeGuidedStep = guidedProgressionSteps.length > 0
    ? guidedProgressionSteps[guidedChordStepIndex % guidedProgressionSteps.length]
    : undefined
  const previousGuidedStep = guidedProgressionSteps.length > 0
    ? guidedProgressionSteps[(guidedChordStepIndex - 1 + guidedProgressionSteps.length) % guidedProgressionSteps.length]
    : undefined
  const nextGuidedStep = guidedProgressionSteps.length > 0
    ? guidedProgressionSteps[(guidedChordStepIndex + 1) % guidedProgressionSteps.length]
    : undefined
  const savedImprovProgress = progressStore[isFreeHarmonyMode ? FREE_HARMONY_LAB_ID : selectedChallengeId]

  const accuracy = noteOnCount === 0 ? 100 : Math.max(0, Math.round(((noteOnCount - mistakes) / noteOnCount) * 100))
  const courseMasteryState = getMasteryState(noteOnCount, completedRuns, accuracy, mistakes)
  const tempoBonus = Math.max(savedModuleProgress?.tempoBonus ?? 0, getLiveTempoBonus(completedRuns, accuracy))
  const adaptiveTempo = selectedExercise.tempo + tempoBonus
  const { previewMs: stepPreviewMs, advanceMs: stepAdvanceMs, promptStepMs } = getTimingFromTempo(adaptiveTempo)
  const previewNow = advanceStartedAt ?? now
  const rawScrollProgress = clamp01((previewNow - stepActivatedAtRef.current) / stepPreviewMs)
  const scrollProgress = easeOutCubic(rawScrollProgress)
  const rawAdvanceProgress = advanceStartedAt === null ? 0 : clamp01((now - advanceStartedAt) / stepAdvanceMs)
  const advanceProgress = easeInOutCubic(rawAdvanceProgress)
  const queueLeadInOffset = (1 - scrollProgress) ** 2 * ROLL_LEAD_IN
  const currentStepBeatSpan = selectedExercise.steps[currentStepIndex]?.beatSpan ?? 1
  const advancedBeatOffset = advanceProgress * currentStepBeatSpan
  const visibleStartIndex = Math.max(0, currentStepIndex - VISIBLE_HISTORY)
  const visibleEndIndex = Math.min(selectedExercise.steps.length, currentStepIndex + VISIBLE_STEPS + 2)
  const visibleSteps = selectedExercise.steps.slice(visibleStartIndex, visibleEndIndex)
  const currentBeatCursor = getCumulativeBeatOffset(selectedExercise.steps, currentStepIndex) + advancedBeatOffset
  const visibleBeatCeiling = selectedExercise.steps
    .slice(currentStepIndex, visibleEndIndex)
    .reduce((total, step) => total + step.beatSpan, 0)
  const rollBeatMarkers = Array.from({ length: Math.max(0, Math.ceil(visibleBeatCeiling) + 2) }, (_, index) => {
    const beatOffset = index - advancedBeatOffset
    const absoluteBeat = Math.floor(currentBeatCursor) + index

    return {
      id: `beat-${absoluteBeat}-${index}`,
      beatOffset,
      absoluteBeat,
      label: (absoluteBeat % 4) + 1,
      isBar: absoluteBeat % 4 === 0,
    }
  })
  const promptSteps = promptStepIndices.map((stepIndex) => selectedExercise.steps[stepIndex]).filter(Boolean)
  const activePromptStep = activePromptPosition === null ? undefined : promptSteps[activePromptPosition]
  const responseStep = promptSteps[responseStepCursor]
  const anticipatedGuidedStep = advanceStartedAt === null
    ? selectedExercise.steps[currentStepIndex]
    : getLoopedStep(selectedExercise.steps, currentStepIndex + 1)
  const anticipatedGuidedUpcomingStep = advanceStartedAt === null
    ? selectedExercise.steps[currentStepIndex + 1]
    : getLoopedStep(selectedExercise.steps, currentStepIndex + 2)
  const displayedStep = lessonMode === 'call-response' && promptSteps.length > 0
    ? callResponseState === 'playing'
      ? activePromptStep ?? responseStep ?? selectedExercise.steps[currentStepIndex]
      : responseStep ?? selectedExercise.steps[currentStepIndex]
    : anticipatedGuidedStep
  const displayedNextStep = lessonMode === 'call-response' && promptSteps.length > 0
    ? callResponseState === 'playing'
      ? promptSteps[(activePromptPosition ?? 0) + 1]
      : promptSteps[responseStepCursor + 1]
    : anticipatedGuidedUpcomingStep
  const expectedNotes = getStepExpectedNotes(displayedStep)
  const upcomingNotes = getStepExpectedNotes(displayedNextStep)
  const courseDisplayedPressedNotes = sortedNotes(new Set([...pressedNotes, ...demoNotes]))
  const targetLabel = displayedStep
    ? getStepEvents(displayedStep)
        .map((event) => {
          const handLabel = event.hand === 'left' ? 'MG' : event.hand === 'right' ? 'MD' : '2M'
          const notesLabel = event.label ?? event.notes.map((note) => toNoteName(note)).join(' + ')

          return `${handLabel}: ${notesLabel}`
        })
        .join(' · ')
    : 'En attente'
  const contextLabel = displayedStep?.chord ?? displayedStep?.label ?? 'Repere en cours'
  const actionLabel = lessonMode === 'call-response'
    ? callResponseState === 'playing'
      ? 'Ecoute, memorise la couleur, puis rejoue la phrase.'
      : callResponseState === 'waiting'
        ? displayedStep?.tips ?? 'Rejoue la phrase sans casser la pulsation.'
        : callResponseState === 'success'
          ? 'Reponse validee. Relance une nouvelle phrase ou accelere legerement.'
          : 'Lance une phrase, ecoute-la, puis rejoue-la de memoire.'
    : displayedStep?.tips ?? 'Garde un son stable et vise la note suivante.'
  const stabilizedModules = exercises.filter((exercise) => (progressStore[exercise.id]?.masteryRank ?? 0) >= 2).length
  const courseProgress = Math.round((stabilizedModules / exercises.length) * 100)

  const improvTotalNotes = improvValidNotes + improvWrongNotes
  const improvAccuracy = improvTotalNotes === 0 ? 100 : Math.round((improvValidNotes / improvTotalNotes) * 100)
  const improvMasteryState = getMasteryState(improvTotalNotes, improvCleanPhrases, improvAccuracy, improvWrongNotes)
  const improvChordSuggestionCandidates = improvRightHandHistory.length === 0 && isFreeHarmonyMode
    ? []
    : getChordSuggestions(improvRightHandHistory, improvChordOptions)
  const improvFallbackChordSuggestion = isFreeHarmonyMode
    ? {
        label: 'En attente',
        functionLabel: 'analyse harmonique',
        leftHandVoicing: [] as number[],
        matchPitchClasses: [] as number[],
        colorPitchClasses: [] as number[],
        reason: 'Joue une petite cellule main droite et je te proposerai une lecture harmonique jazz main gauche.',
        score: 0,
        matchedPitchClasses: [] as number[],
      }
    : {
        ...improvChordOptions[0],
        score: 0,
        matchedPitchClasses: [] as number[],
      }
  const improvChordSuggestion = improvChordSuggestionCandidates[0] ?? null
  const lockedChordSuggestion = isFreeHarmonyMode || stableChordLabel === null
    ? null
    : improvChordOptions.find((option) => option.label === stableChordLabel) ?? null
  const activeChordSuggestion = improvChordSuggestion !== null && improvChordSuggestion.score >= 6
    ? improvChordSuggestion
    : lockedChordSuggestion !== null
      ? { ...lockedChordSuggestion, score: 0, matchedPitchClasses: [] as number[] }
      : improvFallbackChordSuggestion
  const freeHarmonyAlternatives = isFreeHarmonyMode
    ? improvChordSuggestionCandidates.filter((option) => option.label !== activeChordSuggestion.label).slice(0, 3)
    : []
  const suggestedLeftHandVoicing = normalizeVoicingBelowSplit(activeChordSuggestion.leftHandVoicing, improvSplitNote)
  const baseGuidedLeftHandVoicing = isFreeHarmonyMode
    ? suggestedLeftHandVoicing
    : activeGuidedStep?.leftHandVoicing ?? suggestedLeftHandVoicing
  const guidedRightHandVoicing = isFreeHarmonyMode ? [] : activeGuidedStep?.rightHandVoicing ?? []
  const guidedLeftHandVoicing = leftHandDensityMode === 'dense' && !isFreeHarmonyMode
    ? buildDenseLeftHandVoicing(baseGuidedLeftHandVoicing, guidedRightHandVoicing, improvSplitNote)
    : baseGuidedLeftHandVoicing
  const leftHandFingerMap = getLeftHandFingerMap(guidedLeftHandVoicing)
  const improvRightHandPressedNotes = pressedNotes.filter((note) => note >= improvSplitNote)
  const improvLeftHandPressedNotes = pressedNotes.filter((note) => note < improvSplitNote)
  const clampedLeftHandWindow = Math.max(KEYBOARD_WINDOW_MIN, Math.min(improvLeftHandWindow, KEYBOARD_WINDOW_MAX))
  const leftHandMaxStart = Math.max(LEFT_HAND_MIN_START, improvSplitNote - clampedLeftHandWindow)
  const clampedImprovLeftHandStart = Math.max(LEFT_HAND_MIN_START, Math.min(improvLeftHandStart, leftHandMaxStart))
  const improvLeftHandEnd = Math.min(improvSplitNote - 1, clampedImprovLeftHandStart + clampedLeftHandWindow - 1)
  const improvLeftHandLayout = createKeyboardLayout(clampedImprovLeftHandStart, improvLeftHandEnd)
  const clampedRightHandWindow = Math.max(KEYBOARD_WINDOW_MIN, Math.min(improvRightHandWindow, KEYBOARD_WINDOW_MAX))
  const rightHandMinStart = improvSplitNote
  const rightHandMaxStart = Math.max(rightHandMinStart, TRAINING_RANGE.end - clampedRightHandWindow + 1)
  const clampedImprovRightHandStart = Math.max(rightHandMinStart, Math.min(improvRightHandStart, rightHandMaxStart))
  const improvRightHandEnd = Math.min(TRAINING_RANGE.end, clampedImprovRightHandStart + clampedRightHandWindow - 1)
  const improvRightHandLayout = createKeyboardLayout(clampedImprovRightHandStart, improvRightHandEnd)
  const canShiftLeftHandLower = clampedImprovLeftHandStart > LEFT_HAND_MIN_START
  const canShiftLeftHandHigher = clampedImprovLeftHandStart < leftHandMaxStart
  const canShowMoreLeftHandNotes = clampedLeftHandWindow < KEYBOARD_WINDOW_MAX
  const canShowFewerLeftHandNotes = clampedLeftHandWindow > KEYBOARD_WINDOW_MIN
  const canShiftRightHandLower = clampedImprovRightHandStart > rightHandMinStart
  const canShiftRightHandHigher = clampedImprovRightHandStart < rightHandMaxStart
  const canShowMoreRightHandNotes = clampedRightHandWindow < KEYBOARD_WINDOW_MAX
  const canShowFewerRightHandNotes = clampedRightHandWindow > KEYBOARD_WINDOW_MIN
  const improvLeftHandRangeLabel = `${toNoteName(clampedImprovLeftHandStart)} → ${toNoteName(improvLeftHandEnd)}`
  const improvRightHandRangeLabel = `${toNoteName(clampedImprovRightHandStart)} → ${toNoteName(improvRightHandEnd)}`
  const chordVoicingLabel = toNoteNames(guidedLeftHandVoicing).join(' · ')
  const guidedRightHandLabel = guidedRightHandVoicing.length > 0 ? toNoteNames(guidedRightHandVoicing).join(' · ') : 'En attente'
  const guidedLeftHandMatched = !isFreeHarmonyMode
    && guidedLeftHandVoicing.length > 0
    && guidedLeftHandVoicing.every((note) => improvLeftHandPressedNotes.includes(note))
  const guidedRightHandMatched = !isFreeHarmonyMode
    && guidedRightHandVoicing.length > 0
    && guidedRightHandVoicing.every((note) => improvRightHandPressedNotes.includes(note))
  const guidedStepMatched = !isFreeHarmonyMode
    && (guidedLeftHandVoicing.length === 0 || guidedLeftHandMatched)
    && (guidedRightHandVoicing.length === 0 || guidedRightHandMatched)
  const guidedMatchSummary = isFreeHarmonyMode
    ? ''
    : guidedStepMatched
      ? 'Voicing complet valide'
      : guidedRightHandMatched && !guidedLeftHandMatched
        ? 'Main droite valide · ajoute la main gauche'
        : guidedLeftHandMatched && !guidedRightHandMatched
          ? 'Main gauche posee · ajoute la main droite'
          : 'Vise les deux blocs pour verrouiller l accord'
  const guidedProgressionSummary = activeGuidedStep
    ? `${activeGuidedStep.label}${nextGuidedStep ? ` → ${nextGuidedStep.label}` : ''}`
    : selectedChallenge.modeName
  const guidedProgressionMeta = isFreeHarmonyMode
    ? null
    : effectiveGuidedSource === 'generated'
      ? selectedGeneratedColor
      : guidedProgression
  const matchedPitchClassLabel = activeChordSuggestion.matchedPitchClasses.length > 0
    ? activeChordSuggestion.matchedPitchClasses.map((pitchClass) => toPitchClassName(pitchClass)).join(' · ')
    : 'Joue une courte phrase main droite pour recevoir une lecture harmonique.'
  const activeRhythmGuide = isFreeHarmonyMode
    ? {
        pulseBpm: 88,
        subdivision: 'eighths' as const,
        countPattern: '1 + · 2 + · laisse respirer',
        placementHint: 'Garde une petite cellule claire et laisse-la vivre avant la suivante.',
        pocketHint: 'Le mode libre gagne quand la phrase reste courte et bien placee.',
      }
    : selectedChallenge.rhythmGuide
  const activePracticeProfile = isFreeHarmonyMode
    ? { minPhraseNotes: 3, maxPhraseNotes: 6, focusPitchClasses: activeChordSuggestion.matchedPitchClasses }
    : selectedChallenge.practiceProfile
  const grooveAssessment = getGrooveAssessment(improvNoteTimestamps, activeRhythmGuide)
  const densityAssessment = getDensityAssessment(improvRightHandHistory.length, activePracticeProfile.minPhraseNotes, activePracticeProfile.maxPhraseNotes)
  const colorAssessment = isFreeHarmonyMode
    ? improvRightHandHistory.length === 0
      ? 'Joue une petite phrase pour stabiliser une lecture harmonique.'
      : `Lecture couleur: ${matchedPitchClassLabel}. Garde la meme cellule une fois de plus pour verrouiller le son.`
    : getColorAssessment(improvRightHandHistory, activePracticeProfile.focusPitchClasses)
  const previousCombinedVoicing = previousGuidedStep
    ? [...previousGuidedStep.leftHandVoicing, ...previousGuidedStep.rightHandVoicing]
    : []
  const currentCombinedVoicing = activeGuidedStep
    ? [...guidedLeftHandVoicing, ...guidedRightHandVoicing]
    : []
  const voiceLeadingAssessment = isFreeHarmonyMode
    ? 'Mode libre: privilegie surtout une couleur simple et stable.'
    : getVoiceLeadingAssessment(previousCombinedVoicing, currentCombinedVoicing)
  const progressionArtistLabel = guidedProgressionMeta?.artistTag ?? selectedChallenge.artistFamilies[0]
  const progressionFormLabel = guidedProgressionMeta?.formLabel ?? `${guidedProgressionSteps.length} accords`
  const progressionEnergyLabel = guidedProgressionMeta?.energyLabel ?? selectedChallenge.grooveLabel
  const masteredScenesCount = modeChallenges.filter((challenge) => (progressStore[challenge.id]?.masteryRank ?? 0) >= 2).length
  const lastScenePracticeLabel = savedImprovProgress?.lastPracticedAt
    ? new Date(savedImprovProgress.lastPracticedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
    : 'jamais'

  const activePracticeKey = practiceSurface === 'courses'
    ? selectedExerciseId
    : isFreeHarmonyMode
      ? FREE_HARMONY_LAB_ID
      : selectedChallengeId
  const activeAccuracy = practiceSurface === 'courses' ? accuracy : improvAccuracy
  const activeCompletedRuns = practiceSurface === 'courses' ? completedRuns : improvCleanPhrases
  const activeNoteCount = practiceSurface === 'courses' ? noteOnCount : improvTotalNotes
  const activeMasteryState = practiceSurface === 'courses' ? courseMasteryState : improvMasteryState
  const activeTempoBonus = practiceSurface === 'courses' ? getLiveTempoBonus(completedRuns, accuracy) : 0
  const activeModeLabel = practiceSurface === 'courses' ? lessonMode : improvLabMode
  const activeSurfaceLabel = practiceSurface === 'courses'
    ? courseWorkspaceMode === 'browser'
      ? 'Parcours modern jazz'
      : 'Session guidee'
    : isFreeHarmonyMode
      ? 'Color Lab libre'
      : 'Color Lab guide'
  const activeCourseStepLabel = `${selectedExercise.phase} · Etape ${String(selectedExercise.order).padStart(2, '0')}`
  const isExerciseUnlocked = (exercise: Exercise) => {
    return (exercise.prerequisiteIds ?? []).every((exerciseId) => (progressStore[exerciseId]?.masteryRank ?? 0) >= 1)
  }
  const coursePhases = orderedExercises.reduce<Array<{ phase: string, phaseOrder: number, courses: Exercise[] }>>((groups, exercise) => {
    const existingGroup = groups[groups.length - 1]

    if (!existingGroup || existingGroup.phase !== exercise.phase) {
      groups.push({ phase: exercise.phase, phaseOrder: exercise.phaseOrder, courses: [exercise] })
      return groups
    }

    existingGroup.courses.push(exercise)
    return groups
  }, [])
  const unlockedExercises = orderedExercises.filter((exercise) => isExerciseUnlocked(exercise))
  const nextRecommendedExercise = orderedExercises.find((exercise) => {
    return isExerciseUnlocked(exercise) && (progressStore[exercise.id]?.masteryRank ?? 0) < 2
  }) ?? unlockedExercises[0] ?? orderedExercises[0]
  const selectedCompanionExercises = (selectedExercise.companionExerciseIds ?? [])
    .map((exerciseId) => exerciseLookup.get(exerciseId))
    .filter((exercise): exercise is Exercise => Boolean(exercise))
  const selectedPrerequisiteExercises = (selectedExercise.prerequisiteIds ?? [])
    .map((exerciseId) => exerciseLookup.get(exerciseId))
    .filter((exercise): exercise is Exercise => Boolean(exercise))

  const clearPressedState = () => {
    activeNoteSourcesRef.current = new Map<number, Set<string>>()
    pointerHeldNotesRef.current = new Set<number>()
    pressedNotesRef.current = new Set<number>()
    setPressedNotes([])
  }

  const clearPromptPlayback = () => {
    promptTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    promptTimeoutsRef.current = []
    demoNotesRef.current = new Set<number>()
    setDemoNotes([])
    setActivePromptPosition(null)
  }

  const updateDemoNotes = (notes: number[], isActive: boolean) => {
    const nextDemoNotes = new Set(demoNotesRef.current)

    notes.forEach((note) => {
      if (isActive) {
        nextDemoNotes.add(note)
      } else {
        nextDemoNotes.delete(note)
      }
    })

    demoNotesRef.current = nextDemoNotes
    setDemoNotes(sortedNotes(nextDemoNotes))
  }

  const clearAlertFlash = () => {
    if (alertTimeoutRef.current !== null) {
      window.clearTimeout(alertTimeoutRef.current)
      alertTimeoutRef.current = null
    }

    setImprovAlertNote(null)
  }

  const flashWrongNote = (note: number) => {
    clearAlertFlash()
    setImprovAlertNote(note)
    alertTimeoutRef.current = window.setTimeout(() => {
      setImprovAlertNote(null)
      alertTimeoutRef.current = null
    }, WRONG_NOTE_FLASH_MS)
  }

  const resetCourseSession = () => {
    if (advanceTimeoutRef.current !== null) {
      window.clearTimeout(advanceTimeoutRef.current)
      advanceTimeoutRef.current = null
    }

    clearPromptPlayback()
    clearPressedState()
    isAdvancingRef.current = false
    stepActivatedAtRef.current = Date.now()
    setAdvanceStartedAt(null)
    setCurrentStepIndex(0)
    setNoteOnCount(0)
    setMistakes(0)
    setCompletedRuns(0)
    setPromptStepIndices([])
    setResponseStepCursor(0)
    setCallResponseState('idle')
  }

  const resetImprovSession = () => {
    clearAlertFlash()
    if (guidedAdvanceTimeoutRef.current !== null) {
      window.clearTimeout(guidedAdvanceTimeoutRef.current)
      guidedAdvanceTimeoutRef.current = null
    }
    completedGuidedStepRef.current = null
    clearPressedState()
    setImprovRightHandHistory([])
    setImprovNoteTimestamps([])
    setImprovValidNotes(0)
    setImprovWrongNotes(0)
    setImprovCleanPhrases(0)
    setImprovStreak(0)
    setImprovBestStreak(0)
    setGuidedVoicingHits(0)
    setImprovFeedbackLabel(defaultImprovFeedbackLabel)
  }

  useEffect(() => {
    resetCourseSession()
  }, [selectedExerciseId, lessonMode])

  useEffect(() => {
    resetImprovSession()
  }, [defaultImprovFeedbackLabel, selectedChallengeId, improvLabMode])

  useEffect(() => {
    if (filteredChallenges.length === 0) {
      return
    }

    if (!filteredChallenges.some((challenge) => challenge.id === selectedChallengeId)) {
      setSelectedChallengeId(filteredChallenges[0].id)
    }
  }, [filteredChallenges, selectedChallengeId])

  useEffect(() => {
    const nextWrittenProgressionId = selectedChallenge.guidedProgressions[0]?.id ?? ''
    const nextGeneratedColorId = selectedChallenge.generatedColors[0]?.id ?? ''

    setGuidedChordStepIndex(0)
    setGuidedProgressionSource(selectedChallenge.guidedProgressions.length > 0 ? 'written' : 'generated')
    setSelectedGuidedProgressionId(nextWrittenProgressionId)
    setSelectedGeneratedColorId(nextGeneratedColorId)
  }, [selectedChallengeId, improvLabMode])

  useEffect(() => {
    setGuidedChordStepIndex(0)
  }, [guidedProgressionSource, selectedGuidedProgressionId, selectedGeneratedColorId])

  useEffect(() => {
    const nextPreferences: LabPreferences = {
      selectedArtistFamily,
      guidedAutoAdvance,
      leftHandDensityMode,
      improvLeftHandStart,
      improvLeftHandWindow,
      improvRightHandStart,
      improvRightHandWindow,
    }

    window.localStorage.setItem(LAB_PREFERENCES_STORAGE_KEY, JSON.stringify(nextPreferences))
  }, [
    guidedAutoAdvance,
    improvLeftHandStart,
    improvLeftHandWindow,
    improvRightHandStart,
    improvRightHandWindow,
    leftHandDensityMode,
    selectedArtistFamily,
  ])

  useEffect(() => {
    setImprovLeftHandStart((currentStart) => {
      return Math.max(LEFT_HAND_MIN_START, Math.min(currentStart, Math.max(LEFT_HAND_MIN_START, improvSplitNote - clampedLeftHandWindow)))
    })
    setImprovRightHandStart((currentStart) => {
      return Math.max(improvSplitNote, Math.min(currentStart, Math.max(improvSplitNote, TRAINING_RANGE.end - clampedRightHandWindow + 1)))
    })
  }, [clampedLeftHandWindow, clampedRightHandWindow, improvSplitNote])

  useEffect(() => {
    completedGuidedStepRef.current = null
  }, [activeGuidedStep?.id, guidedProgression?.id])

  useEffect(() => {
    setStableChordLabel(null)
  }, [selectedChallengeId, improvLabMode])

  useEffect(() => {
    if (!isFreeHarmonyMode && improvChordSuggestion !== null && improvChordSuggestion.score >= 8) {
      setStableChordLabel(improvChordSuggestion.label)
    }
  }, [improvChordSuggestion, isFreeHarmonyMode])

  useEffect(() => {
    if (practiceSurface !== 'improv-lab' || !isFreeHarmonyMode) {
      return
    }

    if (improvRightHandHistory.length === 0) {
      setImprovFeedbackLabel(defaultImprovFeedbackLabel)
      return
    }

    const lastNote = improvRightHandHistory[improvRightHandHistory.length - 1]

    if (activeChordSuggestion.label === 'En attente') {
      setImprovFeedbackLabel(`${toNoteName(lastNote)} captee. Continue la phrase pour stabiliser une lecture harmonique.`)
      return
    }

    setImprovFeedbackLabel(
      `${toNoteName(lastNote)} captee. Lecture probable: ${activeChordSuggestion.label}. ${activeChordSuggestion.reason}`,
    )
  }, [activeChordSuggestion.label, activeChordSuggestion.reason, defaultImprovFeedbackLabel, improvRightHandHistory, isFreeHarmonyMode, practiceSurface])

  useEffect(() => {
    if (practiceSurface !== 'improv-lab' || isFreeHarmonyMode || !activeGuidedStep) {
      return
    }

    if (guidedStepMatched) {
      setImprovFeedbackLabel(
        guidedAutoAdvance
          ? `${activeGuidedStep.label} valide. Accord suivant dans la boucle.`
          : `${activeGuidedStep.label} valide. Passe au suivant quand tu veux.`,
      )
      return
    }

    if (guidedRightHandMatched && !guidedLeftHandMatched) {
      setImprovFeedbackLabel(`Main droite valide sur ${activeGuidedStep.label}. Ajoute maintenant ${chordVoicingLabel || 'la main gauche'}.`)
      return
    }

    if (guidedLeftHandMatched && !guidedRightHandMatched) {
      setImprovFeedbackLabel(`Main gauche posee sur ${activeGuidedStep.label}. Vise maintenant ${guidedRightHandLabel}.`)
      return
    }

    if (improvRightHandHistory.length === 0 && improvLeftHandPressedNotes.length === 0) {
      setImprovFeedbackLabel(defaultImprovFeedbackLabel)
      return
    }

    setImprovFeedbackLabel(`Travaille ${activeGuidedStep.label} par couches: ${guidedRightHandLabel} puis ${chordVoicingLabel || 'main gauche'}.`)
  }, [
    activeGuidedStep,
    chordVoicingLabel,
    defaultImprovFeedbackLabel,
    guidedAutoAdvance,
    guidedLeftHandMatched,
    guidedRightHandLabel,
    guidedRightHandMatched,
    guidedStepMatched,
    improvLeftHandPressedNotes.length,
    improvRightHandHistory.length,
    isFreeHarmonyMode,
    practiceSurface,
  ])

  useEffect(() => {
    if (practiceSurface !== 'improv-lab' || isFreeHarmonyMode || !activeGuidedStep || !guidedStepMatched) {
      if (!guidedStepMatched) {
        completedGuidedStepRef.current = null
      }
      return
    }

    const completionKey = `${guidedProgression?.id ?? 'guided'}:${activeGuidedStep.id}`

    if (completedGuidedStepRef.current === completionKey) {
      return
    }

    completedGuidedStepRef.current = completionKey
    setGuidedVoicingHits((value) => value + 1)

    if (!guidedAutoAdvance || guidedProgressionSteps.length <= 1) {
      return
    }

    if (guidedAdvanceTimeoutRef.current !== null) {
      window.clearTimeout(guidedAdvanceTimeoutRef.current)
    }

    guidedAdvanceTimeoutRef.current = window.setTimeout(() => {
      setGuidedChordStepIndex((value) => (value + 1) % guidedProgressionSteps.length)
      guidedAdvanceTimeoutRef.current = null
    }, 260)
  }, [activeGuidedStep, guidedAutoAdvance, guidedProgression?.id, guidedProgressionSteps.length, guidedStepMatched, isFreeHarmonyMode, practiceSurface])

  useEffect(() => {
    clearPromptPlayback()
    clearAlertFlash()
    clearPressedState()
    setDemoNotes([])

    if (isCourseBrowser) {
      setLastInputLabel('Selection de cours active')
    } else if (practiceSurface === 'courses') {
      setLastInputLabel('Mode cours actif')
    } else {
      setLastInputLabel(isFreeHarmonyMode ? 'Color Lab libre actif' : 'Color Lab guide actif')
    }
  }, [courseWorkspaceMode, isCourseBrowser, isFreeHarmonyMode, practiceSurface])

  useEffect(() => {
    if (!isCoursePractice) {
      return
    }

    let animationFrameId = 0

    const updateFrame = () => {
      setNow(Date.now())
      animationFrameId = window.requestAnimationFrame(updateFrame)
    }

    setNow(Date.now())
    animationFrameId = window.requestAnimationFrame(updateFrame)

    return () => {
      window.cancelAnimationFrame(animationFrameId)
    }
  }, [isCoursePractice])

  useEffect(() => {
    return () => {
      if (advanceTimeoutRef.current !== null) {
        window.clearTimeout(advanceTimeoutRef.current)
      }

      clearPromptPlayback()
      clearAlertFlash()
      audioContextRef.current?.close().catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    if (activeNoteCount === 0 && activeCompletedRuns === 0) {
      return
    }

    setProgressStore((currentStore) => {
      const currentEntry = currentStore[activePracticeKey]
      const nextEntry: PracticeProgress = {
        bestAccuracy: Math.max(currentEntry?.bestAccuracy ?? 0, activeAccuracy),
        bestCompletedRuns: Math.max(currentEntry?.bestCompletedRuns ?? 0, activeCompletedRuns),
        masteryRank: Math.max(currentEntry?.masteryRank ?? 0, activeMasteryState.rank),
        masteryLabel: activeMasteryState.label,
        tempoBonus: Math.max(currentEntry?.tempoBonus ?? 0, activeTempoBonus),
        lastMode: activeModeLabel,
        lastPracticedAt: new Date().toISOString(),
        bestStreak: Math.max(currentEntry?.bestStreak ?? 0, practiceSurface === 'improv-lab' ? improvBestStreak : 0),
        bestVoicingHits: Math.max(currentEntry?.bestVoicingHits ?? 0, practiceSurface === 'improv-lab' ? guidedVoicingHits : 0),
        bestGrooveScore: Math.max(currentEntry?.bestGrooveScore ?? 0, practiceSurface === 'improv-lab' ? grooveAssessment.score : 0),
        lastVariationTitle: practiceSurface === 'improv-lab' ? guidedProgressionMeta?.title ?? undefined : currentEntry?.lastVariationTitle,
        lastArtistFamily: practiceSurface === 'improv-lab' ? progressionArtistLabel : currentEntry?.lastArtistFamily,
      }

      const unchanged = currentEntry
        && currentEntry.bestAccuracy === nextEntry.bestAccuracy
        && currentEntry.bestCompletedRuns === nextEntry.bestCompletedRuns
        && currentEntry.masteryRank === nextEntry.masteryRank
        && currentEntry.masteryLabel === nextEntry.masteryLabel
        && currentEntry.tempoBonus === nextEntry.tempoBonus
        && currentEntry.lastMode === nextEntry.lastMode
        && currentEntry.bestStreak === nextEntry.bestStreak
        && currentEntry.bestVoicingHits === nextEntry.bestVoicingHits
        && currentEntry.bestGrooveScore === nextEntry.bestGrooveScore
        && currentEntry.lastVariationTitle === nextEntry.lastVariationTitle
        && currentEntry.lastArtistFamily === nextEntry.lastArtistFamily

      if (unchanged) {
        return currentStore
      }

      return {
        ...currentStore,
        [activePracticeKey]: nextEntry,
      }
    })
  }, [
    activeAccuracy,
    activeCompletedRuns,
    activeMasteryState.label,
    activeMasteryState.rank,
    activeModeLabel,
    activeNoteCount,
    activePracticeKey,
    activeTempoBonus,
    grooveAssessment.score,
    guidedProgressionMeta?.title,
    guidedVoicingHits,
    improvBestStreak,
    practiceSurface,
    progressionArtistLabel,
  ])

  useEffect(() => {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progressStore))
  }, [progressStore])

  const ensureAudioContext = async () => {
    if (!window.AudioContext) {
      return null
    }

    if (audioContextRef.current === null) {
      audioContextRef.current = new window.AudioContext()
    }

    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume()
    }

    return audioContextRef.current
  }

  const schedulePromptNote = (audioContext: AudioContext, note: number, startAt: number, durationMs: number) => {
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    const stopAt = startAt + durationMs / 1000

    oscillator.type = 'triangle'
    oscillator.frequency.value = midiToFrequency(note)
    gainNode.gain.setValueAtTime(0.0001, startAt)
    gainNode.gain.exponentialRampToValueAtTime(0.12, startAt + 0.02)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, stopAt)

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    oscillator.start(startAt)
    oscillator.stop(stopAt + 0.03)
  }

  const playAlertTone = async () => {
    const nowTimestamp = Date.now()

    if (nowTimestamp - lastAlertAtRef.current < ALERT_NOTE_COOLDOWN_MS) {
      return
    }

    lastAlertAtRef.current = nowTimestamp

    const audioContext = await ensureAudioContext()

    if (!audioContext) {
      return
    }

    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    const startAt = audioContext.currentTime
    const stopAt = startAt + 0.16

    oscillator.type = 'square'
    oscillator.frequency.setValueAtTime(880, startAt)
    oscillator.frequency.exponentialRampToValueAtTime(220, startAt + 0.14)
    gainNode.gain.setValueAtTime(0.0001, startAt)
    gainNode.gain.exponentialRampToValueAtTime(0.08, startAt + 0.01)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, stopAt)

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    oscillator.start(startAt)
    oscillator.stop(stopAt + 0.03)
  }

  const advanceExercise = () => {
    if (isAdvancingRef.current) {
      return
    }

    const frozenScrollProgress = rawScrollProgress

    isAdvancingRef.current = true
    setAdvanceStartedAt(Date.now())

    advanceTimeoutRef.current = window.setTimeout(() => {
      startTransition(() => {
        if (currentStepIndex >= selectedExercise.steps.length - 1) {
          setCompletedRuns((value) => value + 1)
          setCurrentStepIndex(0)
          stepActivatedAtRef.current = Date.now()
        } else {
          const resumedScrollProgress = Math.min(frozenScrollProgress, MAX_RESUMED_SCROLL_PROGRESS)

          setCurrentStepIndex((value) => value + 1)
          stepActivatedAtRef.current = Date.now() - resumedScrollProgress * stepPreviewMs
        }

        setAdvanceStartedAt(null)
      })

      isAdvancingRef.current = false
      advanceTimeoutRef.current = null
    }, stepAdvanceMs)
  }

  const playPrompt = async () => {
    clearPromptPlayback()

    const indices = getPromptIndices(selectedExercise.steps.length, currentStepIndex)

    if (indices.length === 0) {
      return
    }

    const audioContext = await ensureAudioContext()
    const startAt = audioContext?.currentTime ?? 0
    let elapsedMs = 0

    setPromptStepIndices(indices)
    setResponseStepCursor(0)
    setCallResponseState('playing')
    setLastInputLabel('Le coach joue la phrase. Ecoute et memorise.')

    indices.forEach((stepIndex, position) => {
      const step = selectedExercise.steps[stepIndex]
      const durationMs = Math.max(180, Math.round(promptStepMs * step.beatSpan))
      const showStepTimeoutId = window.setTimeout(() => {
        setActivePromptPosition(position)
      }, elapsedMs)

      promptTimeoutsRef.current.push(showStepTimeoutId)

      getStepEvents(step).forEach((stepEvent) => {
        const eventDurationMs = Math.max(120, Math.round(promptStepMs * stepEvent.durationBeats))
        const releaseMs = Math.min(PROMPT_NOTE_RELEASE_MS, Math.max(70, eventDurationMs - 40))
        const eventStartMs = elapsedMs + Math.round(promptStepMs * stepEvent.offsetBeats)
        const showTimeoutId = window.setTimeout(() => {
          updateDemoNotes(stepEvent.notes, true)
        }, eventStartMs)
        const hideTimeoutId = window.setTimeout(() => {
          updateDemoNotes(stepEvent.notes, false)
        }, eventStartMs + eventDurationMs - releaseMs)

        promptTimeoutsRef.current.push(showTimeoutId, hideTimeoutId)

        if (audioContext) {
          stepEvent.notes.forEach((note) => {
            schedulePromptNote(audioContext, note, startAt + eventStartMs / 1000, eventDurationMs - 20)
          })
        }
      })

      elapsedMs += durationMs
    })

    const finishTimeoutId = window.setTimeout(() => {
      demoNotesRef.current = new Set<number>()
      setDemoNotes([])
      setActivePromptPosition(null)
      setResponseStepCursor(0)
      setCallResponseState('waiting')
      setLastInputLabel('A ton tour: rejoue la phrase.')
    }, elapsedMs + 40)

    promptTimeoutsRef.current.push(finishTimeoutId)
  }

  const handleGuidedNote = (event: MidiNoteEvent, nextPressed: Set<number>) => {
    const currentStep = selectedExercise.steps[currentStepIndex]

    if (event.type !== 'noteon' || !currentStep || isAdvancingRef.current) {
      return
    }

    setNoteOnCount((value) => value + 1)

    if (!isStepNoteExpected(currentStep, event.note)) {
      setMistakes((value) => value + 1)
      return
    }

    const stepMatched = doesStepMatch(nextPressed, currentStep)

    if (stepMatched) {
      advanceExercise()
    }
  }

  const handleCallResponseNote = (event: MidiNoteEvent, nextPressed: Set<number>) => {
    if (event.type !== 'noteon' || callResponseState !== 'waiting') {
      return
    }

    const targetStep = promptSteps[responseStepCursor]

    if (!targetStep) {
      return
    }

    setNoteOnCount((value) => value + 1)

    if (!isStepNoteExpected(targetStep, event.note)) {
      setMistakes((value) => value + 1)
      setResponseStepCursor(0)
      setCallResponseState('idle')
      setLastInputLabel('Phrase ratee. Relance le call and response.')
      return
    }

    const stepMatched = doesStepMatch(nextPressed, targetStep)

    if (!stepMatched) {
      return
    }

    if (responseStepCursor >= promptSteps.length - 1) {
      setCompletedRuns((value) => value + 1)
      setCallResponseState('success')
      setLastInputLabel('Phrase rejouee proprement.')
      setCurrentStepIndex((value) => (value + promptSteps.length) % selectedExercise.steps.length)
      stepActivatedAtRef.current = Date.now()
      window.setTimeout(() => {
        setPromptStepIndices([])
        setResponseStepCursor(0)
        setCallResponseState('idle')
      }, 420)
      return
    }

    setResponseStepCursor((value) => value + 1)
  }

  const handleImprovNote = (event: MidiNoteEvent) => {
    if (event.type !== 'noteon') {
      return
    }

    const isRightHandNote = event.note >= improvSplitNote

    if (!isRightHandNote) {
      return
    }

    setImprovNoteTimestamps((history) => [...history, Date.now()].slice(-8))

    if (isFreeHarmonyMode) {
      clearAlertFlash()
      setImprovValidNotes((value) => value + 1)
      setImprovRightHandHistory((history) => [...history, event.note].slice(-RIGHT_HAND_HISTORY_LIMIT))
      setImprovStreak((value) => {
        const nextValue = value + 1

        setImprovBestStreak((currentBest) => Math.max(currentBest, nextValue))

        if (nextValue >= IMPRO_STREAK_TARGET) {
          setImprovCleanPhrases((count) => count + 1)
          return 0
        }

        return nextValue
      })
      return
    }

    const inMode = isNoteInPitchClassSet(event.note, selectedChallenge.notePitchClasses)

    if (!inMode) {
      setImprovWrongNotes((value) => value + 1)
      setImprovStreak(0)
      setImprovFeedbackLabel(`${toNoteName(event.note)} sort du cadre ${selectedChallenge.modeName}. Reviens sur ${selectedChallenge.noteNames.join(' · ')}.`)
      flashWrongNote(event.note)
      void playAlertTone()
      return
    }

    setImprovValidNotes((value) => value + 1)
    setImprovFeedbackLabel(`${toNoteName(event.note)} fonctionne dans ${selectedChallenge.modeName}. ${selectedChallenge.targetColor}`)
    setImprovRightHandHistory((history) => [...history, event.note].slice(-RIGHT_HAND_HISTORY_LIMIT))
    setImprovStreak((value) => {
      const nextValue = value + 1

      setImprovBestStreak((currentBest) => Math.max(currentBest, nextValue))

      if (nextValue >= IMPRO_STREAK_TARGET) {
        setImprovCleanPhrases((count) => count + 1)
        return 0
      }

      return nextValue
    })
  }

  const handleNoteEvent = (event: MidiNoteEvent) => {
    if (isCourseBrowser) {
      setLastInputLabel(`${toNoteName(event.note)} via ${event.inputName}`)
      return
    }

    const nextNoteSources = new Map(activeNoteSourcesRef.current)
    const nextSourcesForNote = new Set(nextNoteSources.get(event.note) ?? [])

    if (event.type === 'noteon') {
      nextSourcesForNote.add(event.inputName)
    } else {
      nextSourcesForNote.delete(event.inputName)
    }

    if (nextSourcesForNote.size > 0) {
      nextNoteSources.set(event.note, nextSourcesForNote)
    } else {
      nextNoteSources.delete(event.note)
    }

    activeNoteSourcesRef.current = nextNoteSources
    const nextPressed = new Set(nextNoteSources.keys())
    pressedNotesRef.current = nextPressed
    setPressedNotes(sortedNotes(nextPressed))
    setLastInputLabel(`${toNoteName(event.note)} via ${event.inputName}`)

    if (practiceSurface === 'improv-lab') {
      handleImprovNote(event)
      return
    }

    if (lessonMode === 'call-response') {
      handleCallResponseNote(event, nextPressed)
      return
    }

    handleGuidedNote(event, nextPressed)
  }

  const midiState = useMidi(handleNoteEvent)

  const triggerVirtualKey = (note: number, type: 'noteon' | 'noteoff') => {
    handleNoteEvent({
      note,
      type,
      velocity: type === 'noteon' ? 110 : 0,
      inputName: 'Clavier visuel',
    })
  }

  const pressVirtualKey = (note: number) => {
    pointerHeldNotesRef.current.add(note)
    triggerVirtualKey(note, 'noteon')
  }

  const releaseVirtualKey = (note: number) => {
    if (!pointerHeldNotesRef.current.has(note)) {
      return
    }

    pointerHeldNotesRef.current.delete(note)
    triggerVirtualKey(note, 'noteoff')
  }

  const renderKeyboard = (options: {
    activeNotes: number[]
    targetNotes?: number[]
    upcomingNotes?: number[]
    scalePitchClasses?: number[]
    alertNote?: number | null
    fingerNumbers?: Map<number, number>
    frameClassName?: string
    layout?: typeof KEYBOARD_LAYOUT
  }) => {
    const layout = options.layout ?? KEYBOARD_LAYOUT

    return (
      <div className={`keyboard-frame ${options.frameClassName ?? ''}`.trim()}>
        <div className="keyboard" role="presentation">
          {layout.keys.map((key) => {
            const widthPercent = (key.widthUnits / layout.whiteKeyCount) * 100
            const leftPercent = (key.leftUnits / layout.whiteKeyCount) * 100
            const isPressed = options.activeNotes.includes(key.note)
            const isTarget = options.targetNotes?.includes(key.note) ?? false
            const isUpcoming = options.upcomingNotes?.includes(key.note) ?? false
            const isScaleTone = options.scalePitchClasses?.includes(key.note % 12) ?? false
            const isAlerted = options.alertNote === key.note
            const isTargetHeld = isTarget && isPressed
            const fingerNumber = options.fingerNumbers?.get(key.note)

            return (
              <button
                key={key.note}
                type="button"
                className={[
                  'piano-key',
                  key.isBlack ? 'piano-key--black' : 'piano-key--white',
                  isPressed ? 'is-pressed' : '',
                  isTarget ? 'is-target' : '',
                  isTargetHeld ? 'is-target-held' : '',
                  isUpcoming ? 'is-upcoming' : '',
                  isScaleTone ? 'is-scale-tone' : '',
                  isAlerted ? 'is-alerted' : '',
                ].join(' ')}
                style={{
                  left: `${leftPercent}%`,
                  width: `${widthPercent}%`,
                }}
                onContextMenu={(event) => event.preventDefault()}
                onPointerDown={(event) => {
                  event.preventDefault()
                  pressVirtualKey(key.note)
                }}
                onPointerUp={() => releaseVirtualKey(key.note)}
                onPointerLeave={() => releaseVirtualKey(key.note)}
                onPointerCancel={() => releaseVirtualKey(key.note)}
              >
                {fingerNumber !== undefined && isTarget && <span className="piano-key-finger">{fingerNumber}</span>}
                <span className="piano-key-label">{key.noteName}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="app-topbar panel">
        <div className="app-topbar-copy">
          <p className="eyebrow">PianoJazz Trainer</p>
          <h1>Joue d abord. Lis seulement ce qui aide le prochain geste.</h1>
          <p className="hero-copy">
            Parcours modern jazz, scenes jouables, Color Lab guide et harmonique, et claviers penses pour le son, le geste et le groove.
          </p>
        </div>

        <div className="app-topbar-actions">
          <div className="practice-switch" role="tablist" aria-label="Destination principale">
            <button
              type="button"
              className={`mode-button ${practiceSurface === 'courses' ? 'is-active' : ''}`}
              onClick={() => {
                setPracticeSurface('courses')
                setCourseWorkspaceMode('browser')
              }}
            >
              Parcours
            </button>
            <button
              type="button"
              className={`mode-button ${practiceSurface === 'improv-lab' ? 'is-active' : ''}`}
              onClick={() => setPracticeSurface('improv-lab')}
            >
              Color Lab
            </button>
          </div>

          <div className="hero-status hero-status--compact">
            <div className="status-card">
              <span className="status-label">Vue</span>
              <strong>{activeSurfaceLabel}</strong>
            </div>
            <div className="status-card">
              <span className="status-label">MIDI</span>
              <strong>{midiState.statusMessage}</strong>
            </div>
            <div className="status-card">
              <span className="status-label">Derniere note</span>
              <strong>{lastInputLabel}</strong>
            </div>
          </div>
        </div>
      </header>

      {isCourseBrowser ? (
        <main className="browser-shell">
          <section className="panel browser-hero">
            <div>
              <p className="section-kicker">Modern Jazz Texture Lab</p>
              <h2>Travaille par phases: pocket, couleur, motif, rythme puis texture de performance.</h2>
              <p className="lesson-mission">
                Chaque phase melange comping, improvisation et scenes jouables. Suis la recommandation du moment ou ouvre une etape compagne pour relier voicings, motif et groove.
              </p>
              {nextRecommendedExercise ? (
                <div className="browser-hero-callout">
                  <span className="status-label">A jouer maintenant</span>
                  <strong>{nextRecommendedExercise.title}</strong>
                  <small>
                    {getLessonKindLabel(nextRecommendedExercise.lessonKind)} · {getTrackLabel(nextRecommendedExercise.primaryTrack)}
                  </small>
                </div>
              ) : null}
            </div>

            <div className="browser-hero-stats">
              <div className="status-card">
                <span className="status-label">Modules stabilises</span>
                <strong>{stabilizedModules} / {exercises.length}</strong>
              </div>
              <div className="status-card">
                <span className="status-label">Progression globale</span>
                <strong>{courseProgress}%</strong>
              </div>
              <div className="status-card">
                <span className="status-label">Color Lab libre</span>
                <strong>{progressStore[FREE_HARMONY_LAB_ID]?.masteryLabel ?? 'A lancer'}</strong>
              </div>
            </div>
          </section>

          <section className="browser-lanes">
            {coursePhases.map((phase) => {
              const stabilizedInPhase = phase.courses.filter((exercise) => (progressStore[exercise.id]?.masteryRank ?? 0) >= 2).length

              return (
              <article key={phase.phase} className="panel browser-lane browser-phase-card">
                <div className="section-head section-head-tight">
                  <div>
                    <p className="section-kicker">Phase {String(phase.phaseOrder).padStart(2, '0')}</p>
                    <h2>{phase.phase}</h2>
                  </div>
                  <span className="pill">{stabilizedInPhase} / {phase.courses.length} stabilisees</span>
                </div>

                <div className="phase-summary">
                  <span className="exercise-support">Alterne concepts, scenes et etudes pour transformer un geste en vraie matiere musicale.</span>
                </div>

                <div className="browser-step-list">
                  {phase.courses.map((exercise) => {
                    const savedProgress = progressStore[exercise.id]
                    const isLocked = !isExerciseUnlocked(exercise)
                    const companionTitles = (exercise.companionExerciseIds ?? [])
                      .map((exerciseId) => exerciseLookup.get(exerciseId)?.title)
                      .filter(Boolean)
                      .join(' · ')
                    const prerequisiteTitles = (exercise.prerequisiteIds ?? [])
                      .map((exerciseId) => exerciseLookup.get(exerciseId)?.title)
                      .filter(Boolean)
                      .join(' · ')

                    return (
                      <button
                        key={exercise.id}
                        type="button"
                        className={`browser-step-card ${exercise.id === selectedExerciseId ? 'is-selected' : ''} ${isLocked ? 'is-locked' : ''} ${exercise.id === nextRecommendedExercise?.id ? 'is-recommended' : ''}`}
                        disabled={isLocked}
                        onClick={() => {
                          setSelectedExerciseId(exercise.id)
                          setCourseWorkspaceMode('practice')
                        }}
                      >
                        <div className="browser-step-head">
                          <span className="exercise-card-index">{String(exercise.order).padStart(2, '0')}</span>
                          <div className="exercise-card-copy">
                            <div className="inline-pills">
                              <span className="tag">{getLessonKindLabel(exercise.lessonKind)}</span>
                              <span className="tag">{getTrackLabel(exercise.primaryTrack)}</span>
                              <span className="tempo">{exercise.tempo} BPM</span>
                              {exercise.standardTitle ? <span className="tag">{exercise.standardTitle}</span> : null}
                            </div>
                            <span className="exercise-support">{exercise.module}</span>
                            <strong>{exercise.title}</strong>
                          </div>
                        </div>
                        <p className="exercise-mission">{exercise.mission}</p>
                        <div className="browser-step-meta">
                          <span className="exercise-focus">{exercise.handFocus}</span>
                          <span className="exercise-focus">{exercise.rangeLabel}</span>
                          <span className="exercise-focus">{getCategoryLabel(exercise.category)}</span>
                          <span className="exercise-focus">{exercise.feel ?? 'straight'}</span>
                        </div>
                        {prerequisiteTitles ? (
                          <p className="exercise-support">Prerequis: {prerequisiteTitles}</p>
                        ) : null}
                        {companionTitles ? (
                          <p className="exercise-support">Cours compagnon: {companionTitles}</p>
                        ) : null}
                        <div className="exercise-card-progress">
                          <span>{isLocked ? 'A debloquer' : savedProgress?.masteryLabel ?? 'Pret a decouvrir'}</span>
                          <span>{exercise.masteryGoal}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </article>
            )})}
          </section>
        </main>
      ) : isCoursePractice ? (
        <main className="practice-shell practice-shell--wide">
          <section className="panel stage-panel stage-panel--focus">
            <div className="practice-header">
              <div className="practice-header-main">
                <button className="ghost-button" type="button" onClick={() => setCourseWorkspaceMode('browser')}>
                  Retour aux parcours
                </button>
                <div>
                  <p className="section-kicker">{activeCourseStepLabel}</p>
                  <h2>{selectedExercise.title}</h2>
                </div>
              </div>

              <div className="practice-header-side">
                <span className="pill">{getLessonKindLabel(selectedExercise.lessonKind)}</span>
                <span className="pill">{getTrackLabel(selectedExercise.primaryTrack)}</span>
                <span className="pill">{selectedExercise.handFocus}</span>
                <span className="pill">{selectedExercise.difficulty}</span>
                <span className="pill">{adaptiveTempo} BPM</span>
              </div>
            </div>

            <div className="parcours-context-grid">
              <div className="parcours-context-card">
                <span className="status-label">Position dans le parcours</span>
                <strong>{selectedExercise.phase}</strong>
                <small>{selectedExercise.module}</small>
              </div>
              <div className="parcours-context-card">
                <span className="status-label">Scene cible</span>
                <strong>{selectedExercise.standardTitle ?? 'Capsule de concept'}</strong>
                <small>{selectedExercise.standardSection ? getSceneSectionLabel(selectedExercise.standardSection) : selectedExercise.nextUnlock}</small>
              </div>
              <div className="parcours-context-card">
                <span className="status-label">Cours compagnons</span>
                <strong>{selectedCompanionExercises.length > 0 ? selectedCompanionExercises.map((exercise) => exercise.title).join(' · ') : 'Aucun pour l instant'}</strong>
                <small>
                  {selectedPrerequisiteExercises.length > 0
                    ? `Prerequis: ${selectedPrerequisiteExercises.map((exercise) => exercise.title).join(' · ')}`
                    : 'Aucun prerequis bloque ce module.'}
                </small>
              </div>
            </div>

            <div className="practice-command-bar">
              <div className="play-card play-card--target">
                <span className="expected-label">Cible</span>
                <strong>{targetLabel}</strong>
                <small>{contextLabel}</small>
              </div>
              <div className="play-card play-card--focus">
                <span className="expected-label">Geste</span>
                <strong>{actionLabel}</strong>
                <small>{selectedExercise.listenFor}</small>
              </div>
            </div>

            <div className="lesson-controls lesson-controls--compact">
              <div className="mode-switch" role="tablist" aria-label="Mode de cours">
                <button
                  type="button"
                  className={`mode-button ${lessonMode === 'guided' ? 'is-active' : ''}`}
                  onClick={() => setLessonMode('guided')}
                >
                  Guide pas a pas
                </button>
                <button
                  type="button"
                  className={`mode-button ${lessonMode === 'call-response' ? 'is-active' : ''}`}
                  onClick={() => setLessonMode('call-response')}
                >
                  Call and response
                </button>
              </div>

              <div className="lesson-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={playPrompt}
                  disabled={lessonMode !== 'call-response' || callResponseState === 'playing'}
                >
                  {callResponseState === 'playing' ? 'Le coach joue...' : 'Ecouter la phrase'}
                </button>
                <button type="button" className="ghost-button" onClick={resetCourseSession}>
                  Reinitialiser
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setShowUpcomingNotes((value) => !value)}
                >
                  {showUpcomingNotes ? 'Masquer les notes suivantes' : 'Afficher les notes suivantes'}
                </button>
              </div>
            </div>

            <div className="trainer-surface trainer-surface--focus">
              <div className="keyboard-stage keyboard-stage--course">
                <div className="piano-roll">
                  <div className="roll-grid" />
                  {rollBeatMarkers.map((marker) => {
                    const bottom = ROLL_TARGET_BOTTOM + marker.beatOffset * ROLL_STEP_GAP + queueLeadInOffset
                    const opacity = marker.beatOffset < 0
                      ? 0.12
                      : 0.18 + (1 - clamp01(marker.beatOffset / 10)) * 0.38

                    return (
                      <div
                        key={marker.id}
                        className={`roll-beat-guide ${marker.isBar ? 'is-bar' : ''}`}
                        style={{
                          bottom: `${bottom}%`,
                          opacity,
                        }}
                      >
                        <span className="roll-beat-guide__label">{marker.label}</span>
                      </div>
                    )
                  })}
                  <div className="strike-line">
                    <span>Impact clavier</span>
                  </div>

                  {visibleSteps.map((step, stepOffset) => {
                    const stepIndex = visibleStartIndex + stepOffset
                    const stepBeatOffset = getBeatOffsetToStep(selectedExercise.steps, currentStepIndex, stepIndex) - advancedBeatOffset

                    return getStepEvents(step).flatMap((stepEvent, eventIndex) => {
                      const beatOffset = stepBeatOffset + stepEvent.offsetBeats
                      const noteSpan = Math.max(stepEvent.durationBeats, 1)
                      const height = Math.max(12, noteSpan * ROLL_NOTE_HEIGHT_PER_BEAT)

                      return stepEvent.notes.map((note) => {
                      const keyLayout = KEYBOARD_LAYOUT.noteLookup.get(note)

                      if (!keyLayout) {
                        return null
                      }

                      const keyWidthPercent = (keyLayout.widthUnits / KEYBOARD_LAYOUT.whiteKeyCount) * 100
                      const keyLeftPercent = (keyLayout.leftUnits / KEYBOARD_LAYOUT.whiteKeyCount) * 100
                      const laneInset = keyLayout.isBlack ? 0.08 : 0.14
                      const noteWidthPercent = keyWidthPercent * (1 - laneInset * 2)
                      const noteLeftPercent = keyLeftPercent + keyWidthPercent * laneInset
                      const leadDistance = Math.max(0, beatOffset)
                      const passedDistance = Math.max(0, -beatOffset)
                      const passedProgress = clamp01(passedDistance / noteSpan)
                      const entryProgress = 1 - clamp01(leadDistance / ROLL_ENTRY_FADE_WINDOW)
                      const targetProximity = 1 - clamp01(Math.abs(beatOffset) / noteSpan)
                      const visualState = beatOffset < -0.12
                        ? 'is-played'
                        : beatOffset < Math.max(0.72, noteSpan * 0.45)
                          ? 'is-target'
                          : 'is-queued'
                      const bottom = beatOffset < 0
                        ? ROLL_TARGET_BOTTOM - easeOutCubic(passedProgress) * ROLL_RELEASE_TRAVEL - (1 - targetProximity) * 2
                        : ROLL_TARGET_BOTTOM + beatOffset * ROLL_STEP_GAP + queueLeadInOffset
                      const opacity = beatOffset < 0
                        ? 0.14 + (1 - passedProgress) * 0.28
                        : 0.24 + entryProgress * 0.76
                      const translateY = beatOffset < 0
                        ? easeOutCubic(passedProgress) * 10
                        : (1 - entryProgress) * -ROLL_ENTRY_LIFT_PX - targetProximity * ROLL_TARGET_FLOAT_PX
                      const scale = beatOffset < 0
                        ? 0.94 + (1 - passedProgress) * 0.04
                        : 0.92 + entryProgress * 0.08 + targetProximity * 0.02

                      return (
                        <div
                          key={`${step.id}-${eventIndex}-${note}`}
                          className={`roll-note ${visualState} ${keyLayout.isBlack ? 'is-black-lane' : 'is-white-lane'} hand-${stepEvent.hand}`}
                          style={{
                            left: `${noteLeftPercent}%`,
                            width: `${noteWidthPercent}%`,
                            bottom: `${bottom}%`,
                            height: `${height}%`,
                            opacity,
                            transform: `translate3d(0, ${translateY}px, 0) scale(${Math.min(scale, 1.02)})`,
                          }}
                        >
                          <span>{toNoteName(note)}</span>
                        </div>
                      )
                    })
                    })
                  })}
                </div>

                {renderKeyboard({
                  activeNotes: courseDisplayedPressedNotes,
                  targetNotes: expectedNotes,
                  upcomingNotes: showUpcomingNotes ? upcomingNotes : undefined,
                })}
              </div>

              <div className="compact-stats-row">
                <article className="metric-card compact-stat">
                  <span>Etape</span>
                  <strong>{currentStepIndex + 1} / {selectedExercise.steps.length}</strong>
                  <small>{Math.round(((currentStepIndex + 1) / selectedExercise.steps.length) * 100)}%</small>
                </article>
                <article className="metric-card compact-stat">
                  <span>Precision</span>
                  <strong>{accuracy}%</strong>
                  <small>{mistakes} erreur(s)</small>
                </article>
                <article className="metric-card compact-stat is-highlight">
                  <span>Etat</span>
                  <strong>{courseMasteryState.label}</strong>
                  <small>{courseMasteryState.detail}</small>
                </article>
                <article className="metric-card compact-stat">
                  <span>Parcours</span>
                  <strong>{courseProgress}%</strong>
                  <small>{stabilizedModules} modules solides</small>
                </article>
              </div>
            </div>
          </section>

        </main>
      ) : (
        <main className="practice-shell practice-shell--wide">
          <section className="panel stage-panel stage-panel--focus">
            <div className="practice-header">
              <div className="practice-header-main">
                <div>
                  <p className="section-kicker">{isFreeHarmonyMode ? 'Color Lab libre' : 'Color Lab guide'}</p>
                  <h2>{improvTitle}</h2>
                </div>
              </div>

              <div className="practice-header-side">
                <span className="pill">{improvModeName}</span>
                <span className="pill">{improvDifficultyLabel}</span>
                <span className="pill">{improvHandFocusLabel}</span>
                <span className="pill">Split {toNoteName(improvSplitNote)}</span>
              </div>
            </div>

            <div className="lab-toolbar lab-toolbar--polished">
              <div className="lab-topline">
                <div className="practice-switch practice-switch--compact" role="tablist" aria-label="Sous-mode du laboratoire">
                  <button
                    type="button"
                    className={`mode-button ${improvLabMode === 'modal-training' ? 'is-active' : ''}`}
                    onClick={() => setImprovLabMode('modal-training')}
                  >
                    Mode guide
                  </button>
                  <button
                    type="button"
                    className={`mode-button ${improvLabMode === 'free-harmony' ? 'is-active' : ''}`}
                    onClick={() => setImprovLabMode('free-harmony')}
                  >
                    Mode libre harmonique
                  </button>
                </div>

                <div className="lesson-actions lesson-actions--compact lab-hero-actions">
                  <button type="button" className="ghost-button" onClick={resetImprovSession}>
                    Reinitialiser
                  </button>
                  {!isFreeHarmonyMode && (
                    <button
                      type="button"
                      className={`ghost-button ${guidedAutoAdvance ? 'is-active' : ''}`}
                      onClick={() => setGuidedAutoAdvance((value) => !value)}
                    >
                      Auto-chain {guidedAutoAdvance ? 'on' : 'off'}
                    </button>
                  )}
                  {!isFreeHarmonyMode && (
                    <div className="practice-switch practice-switch--compact" role="tablist" aria-label="Densite main gauche guidee">
                      <button
                        type="button"
                        className={`mode-button ${leftHandDensityMode === 'shell' ? 'is-active' : ''}`}
                        onClick={() => setLeftHandDensityMode('shell')}
                      >
                        MG shell
                      </button>
                      <button
                        type="button"
                        className={`mode-button ${leftHandDensityMode === 'dense' ? 'is-active' : ''}`}
                        onClick={() => setLeftHandDensityMode('dense')}
                      >
                        MG dense
                      </button>
                    </div>
                  )}
                  {!isFreeHarmonyMode && guidedProgressionSteps.length > 0 && (
                    <>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setGuidedChordStepIndex((value) => (value - 1 + guidedProgressionSteps.length) % guidedProgressionSteps.length)}
                      >
                        ← Accord
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setGuidedChordStepIndex((value) => (value + 1) % guidedProgressionSteps.length)}
                      >
                        Accord →
                      </button>
                    </>
                  )}
                </div>
              </div>

              {!isFreeHarmonyMode && (
                <section className="lab-selector-panel">
                  <div className="lab-inline-section">
                    <span className="lab-inline-label">Famille</span>
                    <div className="selector-strip selector-strip--grouped" role="tablist" aria-label="Filtre par famille artistique">
                      {artistFamilies.map((family) => (
                        <button
                          key={family}
                          type="button"
                          className={`selector-chip ${family === selectedArtistFamily ? 'is-active' : ''}`}
                          onClick={() => setSelectedArtistFamily(family)}
                        >
                          {family}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="lab-inline-section">
                    <span className="lab-inline-label">Scene</span>
                    <div className="selector-strip selector-strip--grouped" role="tablist" aria-label="Choix de la scene guidee">
                      {filteredChallenges.map((challenge) => (
                        <button
                          key={challenge.id}
                          type="button"
                          className={`selector-chip ${challenge.id === selectedChallengeId ? 'is-active' : ''}`}
                          onClick={() => setSelectedChallengeId(challenge.id)}
                        >
                          {challenge.modeName}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="lab-inline-section lab-inline-section--narrow">
                    <span className="lab-inline-label">Source</span>
                    <div className="selector-strip selector-strip--grouped" role="tablist" aria-label="Type d enchainement guide">
                      {hasWrittenProgressions && (
                        <button
                          type="button"
                          className={`selector-chip ${effectiveGuidedSource === 'written' ? 'is-active' : ''}`}
                          onClick={() => setGuidedProgressionSource('written')}
                        >
                          Variantes ecrites
                        </button>
                      )}
                      {hasGeneratedColors && (
                        <button
                          type="button"
                          className={`selector-chip ${effectiveGuidedSource === 'generated' ? 'is-active' : ''}`}
                          onClick={() => setGuidedProgressionSource('generated')}
                        >
                          Generateur couleur
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="lab-inline-section lab-inline-section--wide">
                    <span className="lab-inline-label">Variation</span>
                    <div className="selector-strip selector-strip--grouped" role="tablist" aria-label="Selection de variante guidee">
                      {(effectiveGuidedSource === 'generated' ? selectedChallenge.generatedColors : selectedChallenge.guidedProgressions).map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className={`selector-chip ${(effectiveGuidedSource === 'generated' ? selectedGeneratedColorId : selectedGuidedProgressionId) === option.id ? 'is-active' : ''}`}
                          onClick={() => {
                            if (effectiveGuidedSource === 'generated') {
                              setSelectedGeneratedColorId(option.id)
                            } else {
                              setSelectedGuidedProgressionId(option.id)
                            }
                          }}
                        >
                          {option.title}
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              <section className="lab-summary-card lab-summary-card--compact">
                <strong>{guidedProgressionMeta?.title ?? improvModeName}</strong>
                <span>{guidedProgressionSteps.length} accords</span>
                {!isFreeHarmonyMode && <span>{progressionArtistLabel}</span>}
                {!isFreeHarmonyMode && <span>{progressionFormLabel}</span>}
                {!isFreeHarmonyMode && <span>{progressionEnergyLabel}</span>}
                <span>{leftHandDensityMode === 'dense' ? 'MG dense' : 'MG shell'}</span>
                <span>{guidedAutoAdvance ? 'Auto-chain' : 'Manuel'}</span>
                {!isFreeHarmonyMode && <span>{selectedChallenge.modeName}</span>}
                {!isFreeHarmonyMode && <span>{masteredScenesCount} scenes stabilisees</span>}
              </section>
            </div>

            <div className="practice-command-bar">
              <div className="play-card play-card--target">
                <span className="expected-label">Lecture</span>
                <strong>{isFreeHarmonyMode ? activeChordSuggestion.label : activeGuidedStep?.label ?? improvFeedbackLabel}</strong>
                <small>{isFreeHarmonyMode ? (chordVoicingLabel || 'Joue une petite cellule') : activeGuidedStep?.cue ?? guidedProgressionMeta?.description ?? improvTargetColor}</small>
              </div>
              <div className="play-card play-card--focus">
                <span className="expected-label">Repere</span>
                <strong>{isFreeHarmonyMode ? improvTargetColor : guidedRightHandLabel}</strong>
                <small>{isFreeHarmonyMode ? matchedPitchClassLabel : `${guidedProgressionMeta?.title ?? 'Enchainement'}: ${guidedProgressionSummary} · ${improvTargetColor}`}</small>
              </div>
            </div>

            <div className="improv-mode-map improv-mode-map--compact">
              {isFreeHarmonyMode
                ? [activeChordSuggestion, ...freeHarmonyAlternatives].map((option) => (
                    <span key={option.label} className="mode-note-chip">{option.label}</span>
                  ))
                : guidedProgressionSteps.map((step, index) => (
                    <button
                      key={step.id}
                      type="button"
                      className={`selector-chip ${index === guidedChordStepIndex ? 'is-active' : ''}`}
                      onClick={() => setGuidedChordStepIndex(index)}
                    >
                      {step.label}
                    </button>
                  ))}
            </div>

            <div className="history-strip">
              <span className="expected-label">Phrase captee</span>
              <p className="history-strip-copy">{improvPrompt}</p>
              <div className="note-badge-row">
                {(improvRightHandHistory.length > 0 ? improvRightHandHistory : []).map((note, index) => (
                  <span key={`${note}-${index}`} className="note-badge">{toNoteName(note)}</span>
                ))}
                {improvRightHandHistory.length === 0 && <span className="note-badge note-badge--muted">Aucune phrase</span>}
              </div>
              {!isFreeHarmonyMode && (
                <div className="note-badge-row">
                  <span className={`note-badge ${guidedLeftHandMatched ? '' : 'note-badge--muted'}`}>MG {guidedLeftHandMatched ? 'ok' : 'a poser'}</span>
                  <span className={`note-badge ${guidedRightHandMatched ? '' : 'note-badge--muted'}`}>MD {guidedRightHandMatched ? 'ok' : 'a poser'}</span>
                  <span className={`note-badge ${guidedStepMatched ? '' : 'note-badge--muted'}`}>{guidedMatchSummary}</span>
                </div>
              )}
            </div>

            <div className="lab-insight-grid">
              <article className="lab-insight-card">
                <span className="expected-label">ADN scene</span>
                <strong>{isFreeHarmonyMode ? 'Libre harmonique moderne' : `${selectedChallenge.artistFamilies.join(' · ')}`}</strong>
                <small>{isFreeHarmonyMode ? 'Construis une petite cellule, puis laisse l harmonie proposer un cadre.' : selectedChallenge.transferHint}</small>
              </article>
              <article className="lab-insight-card">
                <span className="expected-label">Groove</span>
                <strong>{grooveAssessment.label}</strong>
                <small>{activeRhythmGuide.countPattern} · {grooveAssessment.detail}</small>
              </article>
              <article className="lab-insight-card">
                <span className="expected-label">Feedback musical</span>
                <strong>{densityAssessment}</strong>
                <small>{colorAssessment} {!isFreeHarmonyMode ? voiceLeadingAssessment : ''}</small>
              </article>
              <article className="lab-insight-card">
                <span className="expected-label">Memoire eleve</span>
                <strong>{savedImprovProgress?.masteryLabel ?? 'A construire'}</strong>
                <small>
                  {savedImprovProgress?.bestStreak ?? 0} streak max · groove {savedImprovProgress?.bestGrooveScore ?? 0}% · vu {lastScenePracticeLabel}
                </small>
              </article>
            </div>

            <div className="keyboard-stage keyboard-stage--improv keyboard-stage--wide">
              <div className="dual-keyboard-grid dual-keyboard-grid--wide dual-keyboard-grid--continuous">
                <div className="keyboard-stack-panel">
                  <div className="keyboard-hint keyboard-hint--subtle keyboard-hint--left-hand">
                    <div className="keyboard-hint-head">
                      <div className="keyboard-hint-copy">
                        <span className="expected-label">Main gauche</span>
                        <strong>{isFreeHarmonyMode ? activeChordSuggestion.label : activeGuidedStep?.label} · {chordVoicingLabel || 'en attente'}</strong>
                      </div>
                      <div className="keyboard-range-controls keyboard-range-controls--compact">
                        <div className="keyboard-range-group">
                          <button
                            type="button"
                            className="ghost-button keyboard-range-button"
                            onClick={() => setImprovLeftHandStart((value) => Math.max(LEFT_HAND_MIN_START, value - 1))}
                            disabled={!canShiftLeftHandLower}
                          >
                            ←
                          </button>
                          <span className="keyboard-range-label">{improvLeftHandRangeLabel}</span>
                          <button
                            type="button"
                            className="ghost-button keyboard-range-button"
                            onClick={() => setImprovLeftHandStart((value) => Math.min(leftHandMaxStart, value + 1))}
                            disabled={!canShiftLeftHandHigher}
                          >
                            →
                          </button>
                        </div>
                        <div className="keyboard-range-group">
                          <button
                            type="button"
                            className="ghost-button keyboard-range-button"
                            onClick={() => setImprovLeftHandWindow((value) => Math.min(KEYBOARD_WINDOW_MAX, value + KEYBOARD_WINDOW_STEP))}
                            disabled={!canShowMoreLeftHandNotes}
                          >
                            + notes
                          </button>
                          <span className="keyboard-range-label">{clampedLeftHandWindow} notes</span>
                          <button
                            type="button"
                            className="ghost-button keyboard-range-button"
                            onClick={() => setImprovLeftHandWindow((value) => Math.max(KEYBOARD_WINDOW_MIN, value - KEYBOARD_WINDOW_STEP))}
                            disabled={!canShowFewerLeftHandNotes}
                          >
                            − notes
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  {renderKeyboard({
                    activeNotes: improvLeftHandPressedNotes,
                    targetNotes: guidedLeftHandVoicing,
                    fingerNumbers: leftHandFingerMap,
                    frameClassName: 'keyboard-frame--left-hand keyboard-frame--split-left',
                    layout: improvLeftHandLayout,
                  })}
                </div>

                <div className="keyboard-stack-panel">
                  <div className="keyboard-hint keyboard-hint--subtle keyboard-hint--right-hand">
                    <div className="keyboard-hint-head">
                      <div className="keyboard-hint-copy">
                        <span className="expected-label">Main droite</span>
                        <strong>{isFreeHarmonyMode ? 'Impro libre sans filtre modal' : `${selectedChallenge.modeName} · accord guide`}</strong>
                      </div>
                      <div className="keyboard-range-controls keyboard-range-controls--compact">
                        <div className="keyboard-range-group">
                          <button
                            type="button"
                            className="ghost-button keyboard-range-button"
                            onClick={() => setImprovRightHandStart((value) => Math.max(rightHandMinStart, value - 1))}
                            disabled={!canShiftRightHandLower}
                          >
                            ←
                          </button>
                          <span className="keyboard-range-label">{improvRightHandRangeLabel}</span>
                          <button
                            type="button"
                            className="ghost-button keyboard-range-button"
                            onClick={() => setImprovRightHandStart((value) => Math.min(rightHandMaxStart, value + 1))}
                            disabled={!canShiftRightHandHigher}
                          >
                            →
                          </button>
                        </div>
                        <div className="keyboard-range-group">
                          <button
                            type="button"
                            className="ghost-button keyboard-range-button"
                            onClick={() => setImprovRightHandWindow((value) => Math.min(KEYBOARD_WINDOW_MAX, value + KEYBOARD_WINDOW_STEP))}
                            disabled={!canShowMoreRightHandNotes}
                          >
                            + notes
                          </button>
                          <span className="keyboard-range-label">{clampedRightHandWindow} notes</span>
                          <button
                            type="button"
                            className="ghost-button keyboard-range-button"
                            onClick={() => setImprovRightHandWindow((value) => Math.max(KEYBOARD_WINDOW_MIN, value - KEYBOARD_WINDOW_STEP))}
                            disabled={!canShowFewerRightHandNotes}
                          >
                            − notes
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  {renderKeyboard({
                    activeNotes: improvRightHandPressedNotes,
                    targetNotes: guidedRightHandVoicing,
                    scalePitchClasses: isFreeHarmonyMode ? undefined : selectedChallenge.notePitchClasses,
                    alertNote: isFreeHarmonyMode ? null : improvAlertNote,
                    frameClassName: 'keyboard-frame--practice keyboard-frame--split-right',
                    layout: improvRightHandLayout,
                  })}
                </div>
              </div>

              <div className="compact-stats-row compact-stats-row--improv">
                <article className="metric-card compact-stat">
                  <span>Streak</span>
                  <strong>{improvStreak}</strong>
                  <small>best {Math.max(improvBestStreak, savedImprovProgress?.bestStreak ?? 0)} · objectif {IMPRO_STREAK_TARGET}</small>
                </article>
                <article className="metric-card compact-stat">
                  <span>Groove</span>
                  <strong>{grooveAssessment.score}%</strong>
                  <small>{grooveAssessment.label}</small>
                </article>
                <article className="metric-card compact-stat is-highlight">
                  <span>Etat</span>
                  <strong>{improvMasteryState.label}</strong>
                  <small>{isFreeHarmonyMode ? activeChordSuggestion.functionLabel : activeGuidedStep?.cue ?? improvFeedbackLabel}</small>
                </article>
                {!isFreeHarmonyMode && (
                  <article className="metric-card compact-stat">
                    <span>Voicings</span>
                    <strong>{guidedVoicingHits}</strong>
                    <small>best {savedImprovProgress?.bestVoicingHits ?? 0} · {guidedAutoAdvance ? 'auto-chain actif' : 'navigation manuelle'}</small>
                  </article>
                )}
                <article className="metric-card compact-stat">
                  <span>Memoire</span>
                  <strong>{savedImprovProgress?.masteryLabel ?? 'A construire'}</strong>
                  <small>{savedImprovProgress?.lastVariationTitle ?? 'variation a construire'} · {savedImprovProgress?.lastArtistFamily ?? progressionArtistLabel}</small>
                </article>
              </div>
            </div>
          </section>
        </main>
      )}
    </div>
  )
}