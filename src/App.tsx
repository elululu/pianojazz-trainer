import { startTransition, useEffect, useRef, useState } from 'react'
import { exercises } from './data/exercises'
import { useMidi, type MidiNoteEvent } from './hooks/useMidi'
import { KEYBOARD_LAYOUT, toNoteName } from './lib/music'

const VISIBLE_HISTORY = 1
const VISIBLE_STEPS = 5
const ROLL_STEP_GAP = 19
const ROLL_TARGET_BOTTOM = -4
const ROLL_LEAD_IN = 18
const ROLL_RELEASE_TRAVEL = 14
const STEP_PREVIEW_MS = 1800
const STEP_ADVANCE_MS = 220

const sortedNotes = (notes: Set<number>) => {
  return [...notes].sort((left, right) => left - right)
}

export default function App() {
  const [selectedExerciseId, setSelectedExerciseId] = useState(exercises[0].id)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [pressedNotes, setPressedNotes] = useState<number[]>([])
  const [lastInputLabel, setLastInputLabel] = useState('Aucune note recue')
  const [noteOnCount, setNoteOnCount] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [completedRuns, setCompletedRuns] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [advanceOffset, setAdvanceOffset] = useState(0)
  const pressedNotesRef = useRef(new Set<number>())
  const stepActivatedAtRef = useRef(Date.now())
  const advanceTimeoutRef = useRef<number | null>(null)
  const isAdvancingRef = useRef(false)

  const selectedExercise = exercises.find((exercise) => exercise.id === selectedExerciseId) ?? exercises[0]
  const currentStep = selectedExercise.steps[currentStepIndex]
  const nextStep = selectedExercise.steps[currentStepIndex + 1]
  const expectedNotes = currentStep?.notes ?? []
  const accuracy = noteOnCount === 0 ? 100 : Math.max(0, Math.round(((noteOnCount - mistakes) / noteOnCount) * 100))
  const progressPercent = Math.round(((currentStepIndex + 1) / selectedExercise.steps.length) * 100)
  const scrollProgress = Math.min((now - stepActivatedAtRef.current) / STEP_PREVIEW_MS, 1)
  const queueLeadInOffset = (1 - scrollProgress) * ROLL_LEAD_IN
  const visibleStartIndex = Math.max(0, currentStepIndex - VISIBLE_HISTORY)
  const visibleEndIndex = Math.min(selectedExercise.steps.length, currentStepIndex + VISIBLE_STEPS + 1)
  const visibleSteps = selectedExercise.steps.slice(visibleStartIndex, visibleEndIndex)

  const resetExercise = () => {
    if (advanceTimeoutRef.current !== null) {
      window.clearTimeout(advanceTimeoutRef.current)
      advanceTimeoutRef.current = null
    }

    isAdvancingRef.current = false
    stepActivatedAtRef.current = Date.now()
    pressedNotesRef.current = new Set<number>()
    setAdvanceOffset(0)
    setPressedNotes([])
    setCurrentStepIndex(0)
    setLastInputLabel('Aucune note recue')
    setNoteOnCount(0)
    setMistakes(0)
    setCompletedRuns(0)
  }

  useEffect(() => {
    resetExercise()
  }, [selectedExerciseId])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now())
    }, 33)

    return () => {
      if (advanceTimeoutRef.current !== null) {
        window.clearTimeout(advanceTimeoutRef.current)
      }

      window.clearInterval(intervalId)
    }
  }, [])

  const advanceExercise = () => {
    if (isAdvancingRef.current) {
      return
    }

    isAdvancingRef.current = true
    setAdvanceOffset(1)

    advanceTimeoutRef.current = window.setTimeout(() => {
      startTransition(() => {
        if (currentStepIndex >= selectedExercise.steps.length - 1) {
          setCompletedRuns((value) => value + 1)
          setCurrentStepIndex(0)
        } else {
          setCurrentStepIndex((value) => value + 1)
        }

        stepActivatedAtRef.current = Date.now()
        setAdvanceOffset(0)
      })

      isAdvancingRef.current = false
      advanceTimeoutRef.current = null
    }, STEP_ADVANCE_MS)
  }

  const handleNoteEvent = (event: MidiNoteEvent) => {
    const nextPressed = new Set(pressedNotesRef.current)

    if (event.type === 'noteon') {
      nextPressed.add(event.note)
    } else {
      nextPressed.delete(event.note)
    }

    pressedNotesRef.current = nextPressed
    setPressedNotes(sortedNotes(nextPressed))
    setLastInputLabel(`${toNoteName(event.note)} via ${event.inputName}`)

    if (event.type !== 'noteon' || !currentStep || isAdvancingRef.current) {
      return
    }

    setNoteOnCount((value) => value + 1)

    if (!currentStep.notes.includes(event.note)) {
      setMistakes((value) => value + 1)
      return
    }

    const stepMatched = currentStep.notes.every((note) => nextPressed.has(note))

    if (stepMatched) {
      advanceExercise()
    }
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

  return (
    <div className="app-shell">
      <header className="hero-panel panel">
        <div>
          <p className="eyebrow">PianoJazz Trainer</p>
          <h1>Exercices de jazz relies a ton piano MIDI</h1>
          <p className="hero-copy">
            Visualise ton clavier, vois les notes defiler, puis joue la bonne touche pour avancer.
            L application est pensee pour les gammes, les II V I, les arpeges et les premieres cellules d impro.
          </p>
        </div>

        <div className="hero-status">
          <div className="status-card">
            <span className="status-label">Plateforme</span>
            <strong>{window.desktopBridge?.isElectron ? 'Electron desktop' : 'Mode navigateur'}</strong>
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
      </header>

      <main className="workspace-grid">
        <section className="panel exercise-panel">
          <div className="section-head">
            <div>
              <p className="section-kicker">Bibliotheque</p>
              <h2>Parcours jazz</h2>
            </div>
            <button className="ghost-button" type="button" onClick={resetExercise}>
              Recommencer
            </button>
          </div>

          <div className="exercise-list">
            {exercises.map((exercise) => {
              const isActive = exercise.id === selectedExerciseId

              return (
                <button
                  key={exercise.id}
                  type="button"
                  className={`exercise-card ${isActive ? 'is-active' : ''}`}
                  onClick={() => setSelectedExerciseId(exercise.id)}
                >
                  <div className="exercise-card-top">
                    <span className="tag">{exercise.category}</span>
                    <span className="tempo">{exercise.tempo} BPM</span>
                  </div>
                  <strong>{exercise.title}</strong>
                  <p>{exercise.description}</p>
                  <span className="exercise-focus">{exercise.focus}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="panel stage-panel">
          <div className="section-head section-head-tight">
            <div>
              <p className="section-kicker">Session active</p>
              <h2>{selectedExercise.title}</h2>
            </div>
            <div className="inline-pills">
              <span className="pill">{selectedExercise.keyCenter}</span>
              <span className="pill">{selectedExercise.rangeLabel}</span>
              <span className="pill">{selectedExercise.tempo} BPM</span>
            </div>
          </div>

          <div className="stats-row">
            <article className="metric-card">
              <span>Progression</span>
              <strong>{progressPercent}%</strong>
              <small>{currentStepIndex + 1} / {selectedExercise.steps.length}</small>
            </article>
            <article className="metric-card">
              <span>Precision</span>
              <strong>{accuracy}%</strong>
              <small>{mistakes} erreur(s)</small>
            </article>
            <article className="metric-card">
              <span>Cycles completes</span>
              <strong>{completedRuns}</strong>
              <small>boucle(s) validee(s)</small>
            </article>
          </div>

          <div className="trainer-surface">
            <div className="keyboard-stage">
              <div className="piano-roll">
                <div className="roll-grid" />
                <div className="strike-line">
                  <span>Impact clavier</span>
                </div>

                {visibleSteps.map((step, stepOffset) => {
                  const stepIndex = visibleStartIndex + stepOffset
                  const relativeIndex = stepIndex - currentStepIndex - advanceOffset
                  const height = Math.max(12, step.beatSpan * 12)

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
                    const visualState = relativeIndex < 0
                      ? 'is-played'
                      : relativeIndex === 0
                        ? 'is-target'
                        : 'is-queued'
                    const bottom = relativeIndex < 0
                      ? ROLL_TARGET_BOTTOM - ROLL_RELEASE_TRAVEL - scrollProgress * 6
                      : ROLL_TARGET_BOTTOM + relativeIndex * ROLL_STEP_GAP + queueLeadInOffset

                    return (
                      <div
                        key={`${step.id}-${note}`}
                        className={`roll-note ${visualState} ${keyLayout.isBlack ? 'is-black-lane' : 'is-white-lane'}`}
                        style={{
                          left: `${noteLeftPercent}%`,
                          width: `${noteWidthPercent}%`,
                          bottom: `${bottom}%`,
                          height: `${height}%`,
                        }}
                      >
                        <span>{toNoteName(note)}</span>
                      </div>
                    )
                  })
                })}
              </div>

              <div className="keyboard-frame">
                <div className="keyboard" role="presentation">
                  {KEYBOARD_LAYOUT.keys.map((key) => {
                    const widthPercent = (key.widthUnits / KEYBOARD_LAYOUT.whiteKeyCount) * 100
                    const leftPercent = (key.leftUnits / KEYBOARD_LAYOUT.whiteKeyCount) * 100
                    const isPressed = pressedNotes.includes(key.note)
                    const isTarget = expectedNotes.includes(key.note)
                    const isUpcoming = nextStep?.notes.includes(key.note) ?? false

                    return (
                      <button
                        key={key.note}
                        type="button"
                        className={[
                          'piano-key',
                          key.isBlack ? 'piano-key--black' : 'piano-key--white',
                          isPressed ? 'is-pressed' : '',
                          isTarget ? 'is-target' : '',
                          isUpcoming ? 'is-upcoming' : '',
                        ].join(' ')}
                        style={{
                          left: `${leftPercent}%`,
                          width: `${widthPercent}%`,
                        }}
                        onContextMenu={(event) => event.preventDefault()}
                        onPointerDown={(event) => {
                          event.preventDefault()
                          triggerVirtualKey(key.note, 'noteon')
                        }}
                        onPointerUp={() => triggerVirtualKey(key.note, 'noteoff')}
                        onPointerLeave={() => {
                          if (pressedNotes.includes(key.note)) {
                            triggerVirtualKey(key.note, 'noteoff')
                          }
                        }}
                        onPointerCancel={() => triggerVirtualKey(key.note, 'noteoff')}
                      >
                        <span>{key.noteName}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="expected-bar">
              <div>
                <span className="expected-label">Note a jouer</span>
                <strong>{expectedNotes.map((note) => toNoteName(note)).join(' + ')}</strong>
              </div>
              <div>
                <span className="expected-label">Contexte</span>
                <strong>{currentStep?.chord ?? currentStep?.label}</strong>
              </div>
              <div>
                <span className="expected-label">Conseil</span>
                <strong>{currentStep?.tips}</strong>
              </div>
            </div>
          </div>
        </section>

        <aside className="panel coach-panel">
          <div className="section-head section-head-tight">
            <div>
              <p className="section-kicker">Coaching</p>
              <h2>Ce que tu travailles</h2>
            </div>
          </div>

          <div className="coach-card accent-amber">
            <span className="coach-label">Focus</span>
            <strong>{selectedExercise.focus}</strong>
            <p>{selectedExercise.description}</p>
          </div>

          <div className="coach-card accent-teal">
            <span className="coach-label">Entrees MIDI</span>
            {midiState.inputs.length > 0 ? (
              <ul className="input-list">
                {midiState.inputs.map((inputName) => (
                  <li key={inputName}>{inputName}</li>
                ))}
              </ul>
            ) : (
              <p>Branche ton piano, puis relance la session si aucune entree n apparait.</p>
            )}
          </div>

          <div className="coach-card accent-rose">
            <span className="coach-label">Routine conseillee</span>
            <p>1. Lance un exercice lentement.</p>
            <p>2. Verifie que la bonne touche s allume quand tu joues sur ton clavier physique.</p>
            <p>3. Quand la boucle est propre, augmente le tempo ou change d exercice.</p>
          </div>

          <div className="coach-card accent-slate">
            <span className="coach-label">Et ensuite</span>
            <p>Ajoute ensuite de nouvelles cellules d impro, des voicings rootless, du walking ou des patterns bebop.</p>
            <p>La structure de l app est deja prete pour enrichir le catalogue d exercices.</p>
          </div>
        </aside>
      </main>
    </div>
  )
}
