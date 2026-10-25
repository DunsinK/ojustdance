import type { SkeletonFrame } from '@ojustdance/skeleton'

export type BodyPart = 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg' | 'torso' | 'travel'
export type Judgment = 'OK' | 'GOOD' | 'PERFECT' | 'MISS' | 'TRACKING'
export interface ReferenceCue {
  id: string
  startSec: number
  endSec: number
  referenceSec: number
  label: string
  parts: BodyPart[]
  image?: string
  source: 'authored' | 'practice-phase'
}
export type PerformanceEvent =
  | { type: 'moveStarted'; id: string; moveId: string }
  | { type: 'moveProgress'; id: string; moveId: string; progress: number; quality: number; trackingValid: boolean }
  | { type: 'moveJudged'; id: string; moveId: string; grade: Judgment; points: number; quality: number; coverage: number; completed: boolean }
  | { type: 'comboChanged'; id: string; count: number; lost: boolean }
  | { type: 'comboMilestone'; id: string; count: number }
  | { type: 'leadChanged'; id: string; playerId: 'you' | 'rival' }
  | { type: 'roundFinished'; id: string; score: number; maxCombo: number; accuracy: number }
export interface PerformanceState {
  score: number
  combo: number
  maxCombo: number
  quality: number
  coverage: number
  accuracy: number
  currentId: string | null
  progress: number
  judged: number
  trackingValid: boolean
  lastJudgment: Extract<PerformanceEvent, { type: 'moveJudged' }> | null
}
export interface PlayerEvidence {
  frame: SkeletonFrame | null
  visible: number
  total: number
  fullBody: boolean
  canJudge: boolean
  parts: BodyPart[]
}
