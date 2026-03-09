export type ExerciseCategory = 'gammes' | 'ii-v-i' | 'arpèges' | 'impro'
export type ExerciseDifficulty = 'intermediaire' | 'avance'
export type HandFocus = 'main droite' | 'main gauche' | 'mains ensemble'
export type JazzChordFamily = 'major' | 'minor' | 'dominant' | 'suspended' | 'altered' | 'half-diminished'

export type ExerciseStep = {
  id: string
  notes: number[]
  label: string
  tips: string
  beatSpan: number
  chord?: string
}

export type Exercise = {
  id: string
  title: string
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
