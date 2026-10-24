export interface CountLabel {
  beatNumber: number
  syllable: string
  text: string
}

export interface TimeSignature {
  beats: number
  beatType: number
}

export interface NoteEvent {
  q: number
  durQ: number
  frequency: number
  isRest: boolean
  measureIndex: number
  velocity: number
}

export interface NoteSelection {
  measureIndex: number
  onsetQ: number
  midi: number | null
}

export interface NoteHead {
  x: number
  y: number
  measureIndex: number
  onsetQ: number
  midi: number
  staffIndex: number
  durationQ: number
}

export interface RestHead {
  x: number
  y: number
  measureIndex: number
  onsetQ: number
}

export interface VisualStep {
  q: number
  x: number
  y: number
  width: number
  height: number
  measureIndex: number
  relQ: number
  timeSignature: TimeSignature
  label: CountLabel
  gridQ: number
  beamGroup?: number
  staffIndex?: number
  durationQ: number
  noteHeads: NoteHead[]
  restHeads: RestHead[]
  hasNotes: boolean
}

export interface StaffLayout {
  staffIndex: number
  measureIndex: number
  x: number
  y: number
  width: number
  height: number
  staffTopY: number
  staffBottomY: number
}

export interface MeasureLayout {
  measureIndex: number
  x: number
  y: number
  width: number
  height: number
  staffTopY: number
  staffBottomY: number
  contentStartX: number
}

export interface MeasureInfo {
  index: number
  number: number
  startQ: number
  durationQ: number
  timeSignature: TimeSignature
  beatUnitQ: number
  compound: boolean
  gridQ: number
}

export interface Beat {
  q: number
  label: string
  accent: boolean
  measureIndex: number
}

export interface ScoreAnalysis {
  steps: VisualStep[]
  notes: NoteEvent[]
  measures: MeasureInfo[]
  layout: MeasureLayout[]
  staffLayouts: StaffLayout[]
  staffSteps: VisualStep[]
  staffCount: number
  beats: Beat[]
  totalQ: number
  initialBpm: number
  title: string
}

export interface PositionDescription {
  measureNumber: number
  measureIndex: number
  countText: string
  beatNumber: number
  beatInMeasure: number
  beatsInMeasure: number
  beatLabels: string[]
}
