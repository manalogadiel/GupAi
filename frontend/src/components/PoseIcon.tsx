import HaircutPreview from './HaircutPreview'
import SideProfile from './SideProfile'

export type Pose = 'front' | 'left' | 'right'
export const POSES: Pose[] = ['front', 'left', 'right']
export const POSE_INFO: Record<Pose, { label: string; hint: string }> = {
  front: { label: 'Harap', hint: 'Diretso sa camera, kita ang noo at tenga' },
  left: { label: 'Kaliwa', hint: 'Iharap ang kaliwang pisngi sa camera' },
  right: { label: 'Kanan', hint: 'Iharap ang kanang pisngi sa camera' },
}

/**
 * The same drawn head as the haircut previews. With the left cheek to the camera the nose points to image-left,
 * which is how SideProfile is drawn; `mirrored` flips it for the selfie-style live preview.
 */
export default function PoseIcon({ pose, size = 64, mirrored = false }: { pose: Pose; size?: number; mirrored?: boolean }) {
  const flip = (pose === 'right') !== mirrored
  if (pose === 'front') return <HaircutPreview sides={null} top={null} size={size} />
  return <span className={flip ? 'inline-block -scale-x-100' : 'inline-block'}><SideProfile sides={null} top={null} size={size} /></span>
}
