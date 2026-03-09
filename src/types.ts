export type ExerciseCategory = 'pocket' | 'color' | 'motif' | 'rhythm' | 'texture' | 'voicings'
export type ExerciseDifficulty = 'debutant' | 'intermediaire' | 'avance'
export type HandFocus = 'main droite' | 'main gauche' | 'mains ensemble'
export type JazzChordFamily = 'major' | 'minor' | 'dominant' | 'suspended' | 'altered' | 'half-diminished'
export type ExerciseLessonKind = 'concept' | 'standard' | 'mini-piece'
export type ExerciseTrack = 'comping' | 'improv' | 'two-hands'
export type ExerciseStandardSection = 'vamp' | 'loop' | 'scene' | 'capsule' | 'build' | 'release'
export type RhythmFeel = 'straight' | 'swing'
export type StepHand = 'left' | 'right' | 'both'
export type StepMatchMode = 'exact' | 'contains'

export type ExerciseEvent = {
  notes: number[]
  hand: StepHand
  offsetBeats: number
  durationBeats: number
  label?: string
  matchMode?: StepMatchMode
}

export type ExerciseStep = {
  id: string
  notes: number[]
  label: string
  tips: string
  beatSpan: number
  chord?: string
  hand?: StepHand
  matchMode?: StepMatchMode
  durationBeats?: number
  offsetBeats?: number
  events?: ExerciseEvent[]
}

export type Exercise = {
  id: string
  title: string
  phase: string
  phaseOrder: number
  order: number
  lessonKind: ExerciseLessonKind
  primaryTrack: ExerciseTrack
  category: ExerciseCategory
  difficulty: ExerciseDifficulty
  handFocus: HandFocus
  module: string
  keyCenter: string
  tempo: number
  description: string
  mission: string
  focus: string
  rangeLabel: string
  whyItMatters: string
  listenFor: string
  microGoal: string
  masteryGoal: string
  practiceLoop: string[]
  checkpoints: string[]
  nextUnlock: string
  tags: string[]
  secondaryTracks?: ExerciseTrack[]
  prerequisiteIds?: string[]
  companionExerciseIds?: string[]
  standardId?: string
  standardTitle?: string
  standardSection?: ExerciseStandardSection
  splitNote?: number
  feel?: RhythmFeel
  steps: ExerciseStep[]
}

export type JazzChordOption = {
  label: string
  functionLabel: string
  leftHandVoicing: number[]
  matchPitchClasses: number[]
  colorPitchClasses: number[]
  reason: string
  family?: JazzChordFamily
  rootPitchClass?: number
}

export type ModeChallenge = {
  id: string
  title: string
  modeName: string
  scaleLabel: string
  difficulty: ExerciseDifficulty
  handFocus: HandFocus
  description: string
  improvPrompt: string
  targetColor: string
  notePitchClasses: number[]
  noteNames: string[]
  splitNote: number
  chordOptions: JazzChordOption[]
}
