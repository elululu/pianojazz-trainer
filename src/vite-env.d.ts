/// <reference types="vite/client" />

interface MIDIAccess {
  inputs: MIDIInputMap
  onstatechange: ((event: MIDIConnectionEvent) => void) | null
}

interface MIDIInputMap extends Map<string, MIDIInput> {}

interface MIDIInput extends MIDIPort {
  name?: string
  onmidimessage: ((event: MIDIMessageEvent) => void) | null
}

interface MIDIPort {
  id: string
  manufacturer?: string
  name?: string
  state: 'connected' | 'disconnected'
  type: 'input' | 'output'
}

interface MIDIMessageEvent extends Event {
  data: Uint8Array
}

interface MIDIConnectionEvent extends Event {}

interface Navigator {
  requestMIDIAccess(options?: { sysex?: boolean }): Promise<MIDIAccess>
}

declare global {
  interface Window {
    desktopBridge?: {
      platform: string
      isElectron: boolean
    }
  }
}

export {}
