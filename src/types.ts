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
export type ArtistSceneFamily = 'Glasper' | 'Alfa Mist' | 'FKJ' | 'Yussef Dayes' | 'Hiromi/Fusion' | 'Cinematic'
export type ModeRhythmSubdivision = 'quarters' | 'eighths' | 'triplets' | 'sixteenths'

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

export type ModeGuidedChordStep = {
  id: string
  label: string
  leftHandVoicing: number[]
  rightHandVoicing: number[]
  cue: string
}

export type ModeGuidedProgression = {
  id: string
  title: string
  description: string
  artistTag?: ArtistSceneFamily
  formLabel?: string
  energyLabel?: string
  steps: ModeGuidedChordStep[]
}

export type GuidedChordRecipeId =
  | 'minor9Add11'
  | 'sus13'
  | 'major9'
  | 'major9Sharp11'
  | 'neoSoulMinor11'
  | 'glasperMajor9Sharp11'
  | 'fkjSus13'
  | 'clusterMinorMaj9'
  | 'fusionDominantSharp11'
  | 'minor11'
  | 'minorMaj9'
  | 'altDominant'
  | 'dominantSharp11'
  | 'halfDiminished11'
  | 'pedalMinor11'
  | 'pedalMajor9Sharp11'

export type ModeGeneratedColorStep = {
  id: string
  rootName: string
  rootMidi: number
  recipeId: GuidedChordRecipeId
  cue: string
}

export type ModeGeneratedColor = {
  id: string
  title: string
  description: string
  artistTag?: ArtistSceneFamily
  formLabel?: string
  energyLabel?: string
  steps: ModeGeneratedColorStep[]
}

export type ModeRhythmGuide = {
  pulseBpm: number
  subdivision: ModeRhythmSubdivision
  countPattern: string
  placementHint: string
  pocketHint: string
}

export type ModePracticeProfile = {
  minPhraseNotes: number
  maxPhraseNotes: number
  focusPitchClasses: number[]
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
  artistFamilies: ArtistSceneFamily[]
  grooveLabel: string
  grooveHint: string
  transferHint: string
  rhythmGuide: ModeRhythmGuide
  practiceProfile: ModePracticeProfile
  chordOptions: JazzChordOption[]
  guidedProgressions: ModeGuidedProgression[]
  generatedColors: ModeGeneratedColor[]
}
