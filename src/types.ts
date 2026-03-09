export type ExerciseCategory = 'gammes' | 'ii-v-i' | 'arpèges' | 'impro'

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
  keyCenter: string
  tempo: number
  description: string
  focus: string
  rangeLabel: string
  steps: ExerciseStep[]
}
