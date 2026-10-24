import { useState } from 'react'
import { DanceSkeleton, mirrorFrame, normalizeBody, TwoDimensionalDepthEstimator } from '@ojustdance/skeleton'
import type { JointPose } from '@ojustdance/skeleton'
import { FIXTURES } from '@ojustdance/skeleton/fixtures'
import type { FixtureName } from '@ojustdance/skeleton/fixtures'
import './SkeletonDebug.css'

const skeleton = new DanceSkeleton()

export function SkeletonDebug() {
  const [fixture, setFixture] = useState<FixtureName>('T-pose')
  const [normalized, setNormalized] = useState(false)
  const [mirrored, setMirrored] = useState(false)
  const [projected, setProjected] = useState(false)
  let frame = FIXTURES[fixture]
  let error: string | null = null
  try {
    if (normalized) frame = normalizeBody(frame).frame
    if (mirrored) frame = mirrorFrame(frame, { axisX: 0, swapSides: true })
  } catch (e) { error = e instanceof Error ? e.message : String(e) }
  const pose = projected ? new TwoDimensionalDepthEstimator().reconstruct({ frame }).pose : skeleton.constructPose(frame)
  const joints = Object.values(pose.joints)
  const points = joints.flatMap((j) => j.position ? [j.position] : [])
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y)
  const minX = Math.min(0, ...xs), maxX = Math.max(0, ...xs)
  const minY = Math.min(0, ...ys), maxY = Math.max(0, ...ys)
  const zoom = Math.min(600 / Math.max(maxX - minX, 0.1), 540 / Math.max(maxY - minY, 0.1))
  const x = (value: number) => 500 + (value - (minX + maxX) / 2) * zoom
  const y = (value: number) => 350 + (value - (minY + maxY) / 2) * zoom
  const color = (name: string) => name.startsWith('left') ? '#72dcff' : name.startsWith('right') ? '#ffc580' : '#c8f542'
  const invalid = joints.filter((j) => !j.valid)
  const marker = (joint: JointPose) => {
    const p = joint.position ?? pose.frame.observations[joint.name]?.position
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null
    const px = x(p.x), py = y(p.y)
    const labelOffset = joint.name.endsWith('HandIndex') ? 22 : joint.name.endsWith('Heel') ? 24 :
      joint.name.endsWith('Toe') ? 40 : -10
    return <g key={joint.name}>
      <title>{`${joint.name}: ${joint.reason ?? 'valid'}; Z ${joint.depth.status}; uncertainty ${joint.depth.uncertainty ?? 'unknown'}`}</title>
      <circle cx={px} cy={py} r={joint.derived ? 5 : 7} fill={joint.valid ? color(joint.name) : '#ff788a'} />
      {!joint.valid && <path d={`M${px - 10},${py - 10}l20,20m-20,0l20,-20`} stroke="#ff788a" strokeWidth="2" />}
      <text x={px + (px < 500 ? -10 : 10)} y={py + labelOffset}
        textAnchor={px < 500 ? 'end' : 'start'} fill={joint.valid ? color(joint.name) : '#ff788a'}>
        {joint.name}{joint.derived ? '*' : ''}
      </text>
    </g>
  }
  return <main className="skeleton-debug">
    <header><a href="/">← Back to game</a><h1>Canonical skeleton</h1>
      <p>Deterministic fixture viewer · XY projection · * derived approximation · hover for depth status</p></header>
    <div className="skeleton-controls">
      <label>Fixture <select value={fixture} onChange={(e) => setFixture(e.target.value as FixtureName)}>
        {Object.keys(FIXTURES).map((name) => <option key={name}>{name}</option>)}
      </select></label>
      <label><input type="checkbox" checked={normalized} onChange={(e) => setNormalized(e.target.checked)} /> Center & torso-normalize</label>
      <label><input type="checkbox" checked={mirrored} onChange={(e) => setMirrored(e.target.checked)} /> Mirror & swap left/right</label>
      <label><input type="checkbox" checked={projected} onChange={(e) => setProjected(e.target.checked)} /> Discard depth</label>
    </div>
    {error && <p role="alert">{error}</p>}
    <svg viewBox="0 0 1000 700" role="img" aria-label={`${fixture} skeleton with joint labels`}>
      <line x1="500" y1="20" x2="500" y2="680" stroke="#273745" />
      {skeleton.validEdges(pose).map((bone) => {
        const a = pose.joints[bone.parent].position!, b = pose.joints[bone.child].position!
        return <line key={bone.name} x1={x(a.x)} y1={y(a.y)} x2={x(b.x)} y2={y(b.y)}
          stroke={color(bone.child)} strokeWidth="4"><title>{`${bone.name}: ${bone.observedLength?.toFixed(3)} ${frame.coordinates.units} (${bone.geometry})`}</title></line>
      })}
      {joints.map(marker)}
    </svg>
    <p>{skeleton.validEdges(pose).length} / {Object.keys(pose.bones).length} valid edges · {frame.coordinates.units} · mirrored: {String(frame.coordinates.mirrored)}</p>
    <aside aria-label="Invalid joints"><h2>Invalid joints</h2>
      {invalid.length ? <ul>{invalid.map((joint) => <li key={joint.name}>{joint.name}: {joint.reason}</li>)}</ul> : <p>All joints valid.</p>}
      <p>Missing joints have no drawable position. Degenerate edges are omitted. Image-relative depth never contributes to bone length.</p>
    </aside>
  </main>
}
