// Parent-first order is also the deterministic traversal order. Never infer edges.
const nodes = [
  { name: 'pelvis', parent: null, bone: null },
  { name: 'spine', parent: 'pelvis', bone: 'lowerSpine' },
  { name: 'chest', parent: 'spine', bone: 'upperSpine' },
  { name: 'neck', parent: 'chest', bone: 'neckBase' },
  { name: 'head', parent: 'neck', bone: 'headLink' },
  { name: 'leftShoulder', parent: 'chest', bone: 'leftClavicle' },
  { name: 'leftElbow', parent: 'leftShoulder', bone: 'leftUpperArm' },
  { name: 'leftWrist', parent: 'leftElbow', bone: 'leftForearm' },
  { name: 'leftHandIndex', parent: 'leftWrist', bone: 'leftHand' },
  { name: 'rightShoulder', parent: 'chest', bone: 'rightClavicle' },
  { name: 'rightElbow', parent: 'rightShoulder', bone: 'rightUpperArm' },
  { name: 'rightWrist', parent: 'rightElbow', bone: 'rightForearm' },
  { name: 'rightHandIndex', parent: 'rightWrist', bone: 'rightHand' },
  { name: 'leftHip', parent: 'pelvis', bone: 'leftHipLink' },
  { name: 'leftKnee', parent: 'leftHip', bone: 'leftThigh' },
  { name: 'leftAnkle', parent: 'leftKnee', bone: 'leftShin' },
  { name: 'leftHeel', parent: 'leftAnkle', bone: 'leftHeelLink' },
  { name: 'leftToe', parent: 'leftAnkle', bone: 'leftFoot' },
  { name: 'rightHip', parent: 'pelvis', bone: 'rightHipLink' },
  { name: 'rightKnee', parent: 'rightHip', bone: 'rightThigh' },
  { name: 'rightAnkle', parent: 'rightKnee', bone: 'rightShin' },
  { name: 'rightHeel', parent: 'rightAnkle', bone: 'rightHeelLink' },
  { name: 'rightToe', parent: 'rightAnkle', bone: 'rightFoot' },
] as const

export type JointName = (typeof nodes)[number]['name']
export type BoneName = Exclude<(typeof nodes)[number]['bone'], null>

export interface SkeletonJointDefinition {
  readonly name: JointName
  readonly parent: JointName | null
  readonly bone: BoneName | null
}

export interface SkeletonDefinition {
  readonly schemaVersion: 'dance-skeleton-definition/1'
  readonly root: JointName
  readonly joints: readonly SkeletonJointDefinition[]
}

export const SKELETON_DEFINITION: SkeletonDefinition = Object.freeze({
  schemaVersion: 'dance-skeleton-definition/1',
  root: 'pelvis',
  joints: Object.freeze(nodes.map((node) => Object.freeze({ ...node }))),
})

export const JOINT_NAMES: readonly JointName[] = Object.freeze(nodes.map((n) => n.name))
export const BONE_NAMES: readonly BoneName[] = Object.freeze(
  nodes.flatMap((n) => n.bone === null ? [] : [n.bone]),
)

export function isJointName(value: string): value is JointName {
  return JOINT_NAMES.some((name) => name === value)
}

export function isBoneName(value: string): value is BoneName {
  return BONE_NAMES.some((name) => name === value)
}

export const DERIVED_JOINTS: Readonly<Partial<Record<JointName, readonly [JointName, JointName]>>> =
  Object.freeze({
    pelvis: Object.freeze(['leftHip', 'rightHip'] as const),
    chest: Object.freeze(['leftShoulder', 'rightShoulder'] as const),
    spine: Object.freeze(['pelvis', 'chest'] as const),
    neck: Object.freeze(['chest', 'head'] as const),
  })

export function oppositeJoint(name: JointName): JointName {
  if (name.startsWith('left')) return `right${name.slice(4)}` as JointName
  if (name.startsWith('right')) return `left${name.slice(5)}` as JointName
  return name
}
