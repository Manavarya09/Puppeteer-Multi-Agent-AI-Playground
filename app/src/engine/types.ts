export type Subspace = 'titan' | 'mimas'

export interface TaskFeatures {
  math: number
  web: number
  code: number
  research: number
  critique: number
  synth: number
  plan: number
  complexity: number   // 0..1
}

export interface CandidateScore {
  agentId: string
  score: number
  prob: number
}

export interface OrchestratorDecision {
  step: number
  candidates: CandidateScore[]
  selected: string
  rationale: string
  ts: number
}

export interface Invocation {
  id: string
  step: number
  agentId: string
  prompt: string
  output: string
  status: 'queued' | 'running' | 'done' | 'error'
  promptTokens: number
  completionTokens: number
  durationMs: number
  confidence: number
  startTs: number
  endTs?: number
  sources?: { title: string; url: string }[]
}

export interface Edge { from: string; to: string; weight: number; lastStep: number }

export interface TaskState {
  id: string
  task: string
  subspace: Subspace
  budget: number
  status: 'idle' | 'running' | 'complete' | 'error' | 'cancelled'
  features: TaskFeatures
  invocations: Invocation[]
  decisions: OrchestratorDecision[]
  edges: Edge[]
  totalTokens: number
  costUsd: number
  finalOutput: string
  finalConfidence: number
  startedAt?: number
  completedAt?: number
}

export type EngineEvent =
  | { type: 'state'; state: TaskState }
  | { type: 'agent_start'; invocation: Invocation }
  | { type: 'agent_token'; invocationId: string; token: string }
  | { type: 'agent_end'; invocation: Invocation }
  | { type: 'decision'; decision: OrchestratorDecision }
  | { type: 'edge'; edge: Edge }
  | { type: 'complete'; state: TaskState }
