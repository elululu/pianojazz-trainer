import { startTransition, useEffect, useRef, useState } from 'react'
import { exercises } from './data/exercises'
import { modeChallenges } from './data/modeChallenges'
import { useMidi, type MidiNoteEvent } from './hooks/useMidi'
import type { Exercise, ExerciseLessonKind, ExerciseTrack } from './types'
import {
  KEYBOARD_LAYOUT,
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
const FREE_HARMONY_LAB_ID = 'free-harmony-lab'
const FREE_HARMONY_SPLIT_NOTE = 60

type PracticeSurface = 'courses' | 'improv-lab'
type CourseWorkspaceMode = 'browser' | 'practice'
type LessonMode = 'guided' | 'call-response'
type CallResponseState = 'idle' | 'playing' | 'waiting' | 'success'
type ImprovLabMode = 'modal-training' | 'free-harmony'

type PracticeProgress = {
  bestAccuracy: number
  bestCompletedRuns: number
  masteryRank: number
  masteryLabel: string
  tempoBonus: number
  lastMode: string
  lastPracticedAt: string
}

type ProgressStore = Record<string, PracticeProgress>

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

const noteSetMatches = (pressedNotes: Set<number>, expectedNotes: number[]) => {
  return pressedNotes.size === expectedNotes.length && expectedNotes.every((note) => pressedNotes.has(note))
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
      return 'Standard'
    case 'mini-piece':
      return 'Mini-piece'
    default:
      return 'Concept'
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
  const pressedNotesRef = useRef(new Set<number>())
  const activeNoteSourcesRef = useRef(new Map<number, Set<string>>())
  const pointerHeldNotesRef = useRef(new Set<number>())
  const stepActivatedAtRef = useRef(Date.now())
  const advanceTimeoutRef = useRef<number | null>(null)
  const promptTimeoutsRef = useRef<number[]>([])
  const alertTimeoutRef = useRef<number | null>(null)
  const lastAlertAtRef = useRef(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const isAdvancingRef = useRef(false)
  const [stableChordLabel, setStableChordLabel] = useState<string | null>(null)

  const orderedExercises = [...exercises].sort(compareExercises)
  const exerciseLookup = new Map(orderedExercises.map((exercise) => [exercise.id, exercise]))
  const selectedExercise = exercises.find((exercise) => exercise.id === selectedExerciseId) ?? exercises[0]
  const selectedChallenge = modeChallenges.find((challenge) => challenge.id === selectedChallengeId) ?? modeChallenges[0]
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
  const improvDescription = isFreeHarmonyMode
    ? 'Aucune note interdite. Tu joues une cellule, puis l outil te renvoie une lecture harmonique exploitable tout de suite.'
    : selectedChallenge.description
  const improvTargetColor = isFreeHarmonyMode
    ? 'Vise une cellule claire de 3 a 6 notes: je traduis ensuite cette couleur en voicing jazz main gauche.'
    : selectedChallenge.targetColor
  const improvScaleLabel = isFreeHarmonyMode ? 'Toutes les notes sont acceptees' : selectedChallenge.scaleLabel
  const improvAllowedNotesLabel = isFreeHarmonyMode ? 'Toutes les notes' : selectedChallenge.noteNames.join(' · ')
  const improvKeyboardHint = isFreeHarmonyMode
    ? `Main droite au-dessus de ${toNoteName(improvSplitNote)} · analyse harmonique libre sans alerte de gamme`
    : `Main droite au-dessus de ${toNoteName(improvSplitNote)} · alerte sonore si note hors mode`
  const defaultImprovFeedbackLabel = isFreeHarmonyMode
    ? `Mode libre actif: joue une phrase main droite au-dessus de ${toNoteName(improvSplitNote)} pour recevoir un accord jazz main gauche.`
    : `Mode actif: ${selectedChallenge.modeName}. Improvise main droite au-dessus de ${toNoteName(selectedChallenge.splitNote)}.`
  const improvChordOptions = isFreeHarmonyMode
    ? getFreeHarmonyChordOptions(improvSplitNote)
    : selectedChallenge.chordOptions
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
  const expectedNotes = displayedStep?.notes ?? []
  const courseDisplayedPressedNotes = sortedNotes(new Set([...pressedNotes, ...demoNotes]))
  const targetLabel = expectedNotes.length > 0 ? expectedNotes.map((note) => toNoteName(note)).join(' + ') : 'En attente'
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
  const normalizedLeftHandVoicing = normalizeVoicingBelowSplit(activeChordSuggestion.leftHandVoicing, improvSplitNote)
  const leftHandFingerMap = getLeftHandFingerMap(normalizedLeftHandVoicing)
  const improvRightHandPressedNotes = pressedNotes.filter((note) => note >= improvSplitNote)
  const improvLeftHandPressedNotes = pressedNotes.filter((note) => note < improvSplitNote)
  const chordVoicingLabel = toNoteNames(normalizedLeftHandVoicing).join(' · ')
  const matchedPitchClassLabel = activeChordSuggestion.matchedPitchClasses.length > 0
    ? activeChordSuggestion.matchedPitchClasses.map((pitchClass) => toPitchClassName(pitchClass)).join(' · ')
    : 'Joue une courte phrase main droite pour recevoir une lecture harmonique.'

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
      ? 'Parcours jazz'
      : 'Cours au piano'
    : isFreeHarmonyMode
      ? 'Laboratoire harmonique libre'
      : 'Laboratoire modal'
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
    setDemoNotes([])
    setActivePromptPosition(null)
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
    clearPressedState()
    setImprovRightHandHistory([])
    setImprovValidNotes(0)
    setImprovWrongNotes(0)
    setImprovCleanPhrases(0)
    setImprovStreak(0)
    setImprovFeedbackLabel(defaultImprovFeedbackLabel)
  }

  useEffect(() => {
    resetCourseSession()
  }, [selectedExerciseId, lessonMode])

  useEffect(() => {
    resetImprovSession()
  }, [defaultImprovFeedbackLabel, selectedChallengeId, improvLabMode])

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
    clearPromptPlayback()
    clearAlertFlash()
    clearPressedState()
    setDemoNotes([])

    if (isCourseBrowser) {
      setLastInputLabel('Selection de cours active')
    } else if (practiceSurface === 'courses') {
      setLastInputLabel('Mode cours actif')
    } else {
      setLastInputLabel(isFreeHarmonyMode ? 'Laboratoire harmonique libre actif' : 'Laboratoire modal actif')
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
      }

      const unchanged = currentEntry
        && currentEntry.bestAccuracy === nextEntry.bestAccuracy
        && currentEntry.bestCompletedRuns === nextEntry.bestCompletedRuns
        && currentEntry.masteryRank === nextEntry.masteryRank
        && currentEntry.masteryLabel === nextEntry.masteryLabel
        && currentEntry.tempoBonus === nextEntry.tempoBonus
        && currentEntry.lastMode === nextEntry.lastMode

      if (unchanged) {
        return currentStore
      }

      return {
        ...currentStore,
        [activePracticeKey]: nextEntry,
      }
    })
  }, [activeAccuracy, activeCompletedRuns, activeMasteryState.label, activeMasteryState.rank, activeModeLabel, activeNoteCount, activePracticeKey, activeTempoBonus])

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
      const releaseMs = Math.min(PROMPT_NOTE_RELEASE_MS, Math.max(70, durationMs - 40))
      const showTimeoutId = window.setTimeout(() => {
        setActivePromptPosition(position)
        setDemoNotes(step.notes)
      }, elapsedMs)
      const hideTimeoutId = window.setTimeout(() => {
        setDemoNotes([])
      }, elapsedMs + durationMs - releaseMs)

      promptTimeoutsRef.current.push(showTimeoutId, hideTimeoutId)

      if (audioContext) {
        step.notes.forEach((note) => {
          schedulePromptNote(audioContext, note, startAt + elapsedMs / 1000, durationMs - 20)
        })
      }

      elapsedMs += durationMs
    })

    const finishTimeoutId = window.setTimeout(() => {
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

    if (!currentStep.notes.includes(event.note)) {
      setMistakes((value) => value + 1)
      return
    }

    const stepMatched = noteSetMatches(nextPressed, currentStep.notes)

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

    if (!targetStep.notes.includes(event.note)) {
      setMistakes((value) => value + 1)
      setResponseStepCursor(0)
      setCallResponseState('idle')
      setLastInputLabel('Phrase ratee. Relance le call and response.')
      return
    }

    const stepMatched = noteSetMatches(nextPressed, targetStep.notes)

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

    if (isFreeHarmonyMode) {
      clearAlertFlash()
      setImprovValidNotes((value) => value + 1)
      setImprovRightHandHistory((history) => [...history, event.note].slice(-RIGHT_HAND_HISTORY_LIMIT))
      setImprovStreak((value) => {
        const nextValue = value + 1

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
      setImprovFeedbackLabel(`${toNoteName(event.note)} sort du mode ${selectedChallenge.modeName}. Reviens sur ${selectedChallenge.noteNames.join(' · ')}.`)
      flashWrongNote(event.note)
      void playAlertTone()
      return
    }

    setImprovValidNotes((value) => value + 1)
    setImprovFeedbackLabel(`${toNoteName(event.note)} fonctionne dans ${selectedChallenge.modeName}. ${selectedChallenge.targetColor}`)
    setImprovRightHandHistory((history) => [...history, event.note].slice(-RIGHT_HAND_HISTORY_LIMIT))
    setImprovStreak((value) => {
      const nextValue = value + 1

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
  }) => {
    return (
      <div className={`keyboard-frame ${options.frameClassName ?? ''}`.trim()}>
        <div className="keyboard" role="presentation">
          {KEYBOARD_LAYOUT.keys.map((key) => {
            const widthPercent = (key.widthUnits / KEYBOARD_LAYOUT.whiteKeyCount) * 100
            const leftPercent = (key.leftUnits / KEYBOARD_LAYOUT.whiteKeyCount) * 100
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
            Parcours jazz structures, laboratoire modal et harmonique, et claviers faits pour guider l action sans noyer l ecran sous le texte.
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
              Laboratoire
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
              <p className="section-kicker">Choisir un parcours</p>
              <h2>Travaille le jazz par phases: concept, application, puis jeu plus reel.</h2>
              <p className="lesson-mission">
                Chaque phase melange comping, improvisation et standards. Tu peux suivre la recommendation du moment ou ouvrir une etape compagne pour lier harmonie et phrase.
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
                <span className="status-label">Laboratoire libre</span>
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
                  <span className="exercise-support">Alterne concepts, standards et etudes pour faire le lien entre vocabulaire et vrai jeu.</span>
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
                          <span className="exercise-focus">{exercise.category}</span>
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
        <main className="practice-shell">
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
                <span className="status-label">Application</span>
                <strong>{selectedExercise.standardTitle ?? 'Travail de concept'}</strong>
                <small>{selectedExercise.standardSection ?? selectedExercise.nextUnlock}</small>
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
                    const beatOffset = getBeatOffsetToStep(selectedExercise.steps, currentStepIndex, stepIndex) - advancedBeatOffset
                    const noteSpan = Math.max(step.beatSpan, 1)
                    const height = Math.max(12, noteSpan * ROLL_NOTE_HEIGHT_PER_BEAT)

                    return step.notes.map((note) => {
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
                          key={`${step.id}-${note}`}
                          className={`roll-note ${visualState} ${keyLayout.isBlack ? 'is-black-lane' : 'is-white-lane'}`}
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
                  })}
                </div>

                {renderKeyboard({
                  activeNotes: courseDisplayedPressedNotes,
                  targetNotes: expectedNotes,
                  upcomingNotes: displayedNextStep?.notes ?? [],
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

          <aside className="panel side-dock">
            <div className="dock-card accent-amber">
              <span className="coach-label">Focus</span>
              <strong>{selectedExercise.listenFor}</strong>
              <p>{selectedExercise.focus}</p>
            </div>

            <div className="dock-card accent-teal">
              <span className="coach-label">Boucle courte</span>
              <ul className="coach-list">
                {selectedExercise.practiceLoop.slice(0, 2).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="dock-card accent-slate">
              <span className="coach-label">Memoire</span>
              <strong>{savedModuleProgress?.masteryLabel ?? 'Nouveau module'}</strong>
              <p>{selectedExercise.nextUnlock}</p>
              <p className="coach-callout">Tempo memorise: {selectedExercise.tempo + (savedModuleProgress?.tempoBonus ?? 0)} BPM</p>
            </div>

            <div className="dock-card accent-slate">
              <span className="coach-label">Entrees MIDI</span>
              {midiState.inputs.length > 0 ? (
                <ul className="input-list">
                  {midiState.inputs.map((inputName) => (
                    <li key={inputName}>{inputName}</li>
                  ))}
                </ul>
              ) : (
                <p>Branche ton piano puis relance la session si rien n apparait.</p>
              )}
            </div>
          </aside>
        </main>
      ) : (
        <main className="practice-shell">
          <section className="panel stage-panel stage-panel--focus">
            <div className="practice-header">
              <div className="practice-header-main">
                <div>
                  <p className="section-kicker">{isFreeHarmonyMode ? 'Laboratoire libre' : 'Laboratoire modal'}</p>
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

            <div className="lab-toolbar">
              <div className="practice-switch" role="tablist" aria-label="Sous-mode du laboratoire">
                <button
                  type="button"
                  className={`mode-button ${improvLabMode === 'modal-training' ? 'is-active' : ''}`}
                  onClick={() => setImprovLabMode('modal-training')}
                >
                  Mode surveille
                </button>
                <button
                  type="button"
                  className={`mode-button ${improvLabMode === 'free-harmony' ? 'is-active' : ''}`}
                  onClick={() => setImprovLabMode('free-harmony')}
                >
                  Mode libre harmonique
                </button>
              </div>

              {!isFreeHarmonyMode && (
                <div className="selector-strip" role="tablist" aria-label="Choix du mode modal">
                  {modeChallenges.map((challenge) => (
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
              )}
            </div>

            <div className="practice-command-bar">
              <div className="play-card play-card--target">
                <span className="expected-label">Lecture</span>
                <strong>{isFreeHarmonyMode ? activeChordSuggestion.label : improvFeedbackLabel}</strong>
                <small>{isFreeHarmonyMode ? (chordVoicingLabel || 'Joue une petite cellule') : improvTargetColor}</small>
              </div>
              <div className="play-card play-card--focus">
                <span className="expected-label">Repere</span>
                <strong>{isFreeHarmonyMode ? improvTargetColor : improvAllowedNotesLabel}</strong>
                <small>{isFreeHarmonyMode ? matchedPitchClassLabel : improvKeyboardHint}</small>
              </div>
            </div>

            <div className="improv-mode-map improv-mode-map--compact">
              {isFreeHarmonyMode
                ? [activeChordSuggestion, ...freeHarmonyAlternatives].map((option) => (
                    <span key={option.label} className="mode-note-chip">{option.label}</span>
                  ))
                : selectedChallenge.noteNames.map((noteName) => (
                    <span key={noteName} className="mode-note-chip">{noteName}</span>
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
            </div>

            <div className="keyboard-stage keyboard-stage--improv keyboard-stage--wide">
              <div className="dual-keyboard-grid dual-keyboard-grid--wide">
                <div className="keyboard-stack-panel">
                  <div className="keyboard-hint keyboard-hint--subtle">
                    <span className="expected-label">Main droite</span>
                    <strong>{isFreeHarmonyMode ? 'Impro libre sans filtre modal' : `Impro dans ${selectedChallenge.modeName}`}</strong>
                  </div>
                  {renderKeyboard({
                    activeNotes: improvRightHandPressedNotes,
                    scalePitchClasses: isFreeHarmonyMode ? undefined : selectedChallenge.notePitchClasses,
                    alertNote: isFreeHarmonyMode ? null : improvAlertNote,
                    frameClassName: 'keyboard-frame--practice',
                  })}
                </div>

                <div className="keyboard-stack-panel">
                  <div className="keyboard-hint keyboard-hint--subtle keyboard-hint--left-hand">
                    <span className="expected-label">Main gauche</span>
                    <strong>{activeChordSuggestion.label} · {chordVoicingLabel || 'en attente'}</strong>
                  </div>
                  {renderKeyboard({
                    activeNotes: improvLeftHandPressedNotes,
                    targetNotes: normalizedLeftHandVoicing,
                    fingerNumbers: leftHandFingerMap,
                    frameClassName: 'keyboard-frame--left-hand',
                  })}
                </div>
              </div>

              <div className="compact-stats-row compact-stats-row--improv">
                <article className="metric-card compact-stat">
                  <span>Streak</span>
                  <strong>{improvStreak}</strong>
                  <small>objectif {IMPRO_STREAK_TARGET}</small>
                </article>
                <article className="metric-card compact-stat">
                  <span>Precision</span>
                  <strong>{improvAccuracy}%</strong>
                  <small>{improvWrongNotes} alerte(s)</small>
                </article>
                <article className="metric-card compact-stat is-highlight">
                  <span>Etat</span>
                  <strong>{improvMasteryState.label}</strong>
                  <small>{isFreeHarmonyMode ? activeChordSuggestion.functionLabel : improvFeedbackLabel}</small>
                </article>
                <article className="metric-card compact-stat">
                  <span>Memoire</span>
                  <strong>{savedImprovProgress?.masteryLabel ?? 'A construire'}</strong>
                  <small>{savedImprovProgress?.bestCompletedRuns ?? 0} phrases propres</small>
                </article>
              </div>
            </div>
          </section>

          <aside className="panel side-dock">
            <div className="dock-card accent-teal">
              <span className="coach-label">Accord principal</span>
              <strong>{activeChordSuggestion.label}</strong>
              <p>{activeChordSuggestion.reason}</p>
            </div>

            {freeHarmonyAlternatives.length > 0 && (
              <div className="dock-card accent-slate">
                <span className="coach-label">Alternatives proches</span>
                <div className="alt-chord-list">
                  {freeHarmonyAlternatives.map((option) => (
                    <div key={option.label} className="alt-chord-item">
                      <strong>{option.label}</strong>
                      <span>{toNoteNames(option.leftHandVoicing).join(' · ')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="dock-card accent-amber">
              <span className="coach-label">Cadre</span>
              <strong>{improvScaleLabel}</strong>
              <p>{improvDescription}</p>
            </div>

            <div className="dock-card accent-slate">
              <span className="coach-label">Entrees MIDI</span>
              {midiState.inputs.length > 0 ? (
                <ul className="input-list">
                  {midiState.inputs.map((inputName) => (
                    <li key={inputName}>{inputName}</li>
                  ))}
                </ul>
              ) : (
                <p>Branche ton piano puis relance si aucune entree n apparait.</p>
              )}
            </div>

            <div className="dock-actions">
              <button type="button" className="ghost-button" onClick={resetImprovSession}>
                Reinitialiser
              </button>
            </div>
          </aside>
        </main>
      )}
    </div>
  )
}