import { useEffect, useRef, useState } from 'react'

export type MidiNoteEvent = {
  type: 'noteon' | 'noteoff'
  note: number
  velocity: number
  inputName: string
}

type MidiState = {
  isSupported: boolean
  accessGranted: boolean
  inputs: string[]
  statusMessage: string
}

const parseMidiMessage = (event: MIDIMessageEvent, inputName: string): MidiNoteEvent | null => {
  const data = event.data

  if (!data || data.length === 0) {
    return null
  }

  const [status, note = 0, velocity = 0] = data
  const command = status & 0xf0

  if (command === 0x90 && velocity > 0) {
    return {
      type: 'noteon',
      note,
      velocity,
      inputName,
    }
  }

  if (command === 0x80 || (command === 0x90 && velocity === 0)) {
    return {
      type: 'noteoff',
      note,
      velocity,
      inputName,
    }
  }

  return null
}

export const useMidi = (onNoteEvent: (event: MidiNoteEvent) => void) => {
  const [state, setState] = useState<MidiState>({
    isSupported: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator,
    accessGranted: false,
    inputs: [],
    statusMessage: 'Initialisation MIDI...',
  })
  const callbackRef = useRef(onNoteEvent)

  useEffect(() => {
    callbackRef.current = onNoteEvent
  }, [onNoteEvent])

  useEffect(() => {
    if (!('requestMIDIAccess' in navigator)) {
      setState({
        isSupported: false,
        accessGranted: false,
        inputs: [],
        statusMessage: 'Web MIDI est indisponible dans cet environnement.',
      })
      return
    }

    let alive = true
    let access: MIDIAccess | null = null
    let disposeInputs = () => {}

    const bindInputs = (midiAccess: MIDIAccess) => {
      const cleanup: Array<() => void> = []
      const inputNames: string[] = []

      for (const input of midiAccess.inputs.values()) {
        const inputName = input.name || 'Entree MIDI'
        inputNames.push(inputName)

        const handler = (message: MIDIMessageEvent) => {
          const midiEvent = parseMidiMessage(message, inputName)

          if (midiEvent) {
            callbackRef.current(midiEvent)
          }
        }

        input.onmidimessage = handler
        cleanup.push(() => {
          if (input.onmidimessage === handler) {
            input.onmidimessage = null
          }
        })
      }

      disposeInputs()
      disposeInputs = () => {
        cleanup.forEach((dispose) => dispose())
      }

      if (!alive) {
        return
      }

      setState({
        isSupported: true,
        accessGranted: true,
        inputs: inputNames,
        statusMessage: inputNames.length > 0
          ? `${inputNames.length} entree(s) MIDI active(s)`
          : 'Aucune entree MIDI detectee. Branche le piano puis relance la fenetre.',
      })
    }

    navigator.requestMIDIAccess({ sysex: false })
      .then((midiAccess) => {
        if (!alive) {
          return
        }

        access = midiAccess
        bindInputs(midiAccess)
        midiAccess.onstatechange = () => {
          bindInputs(midiAccess)
        }
      })
      .catch(() => {
        if (!alive) {
          return
        }

        setState({
          isSupported: true,
          accessGranted: false,
          inputs: [],
          statusMessage: 'Acces MIDI refuse ou indisponible.',
        })
      })

    return () => {
      alive = false
      disposeInputs()

      if (access) {
        access.onstatechange = null
      }
    }
  }, [])

  return state
}
