/** Premium ambient background: soft blurred blobs behind everything (background only; see docs/DESIGN.md). */
export default function Backdrop() {
  return (
    <div aria-hidden className="backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <span className="blob blob-peach" />
      <span className="blob blob-sage" />
      <span className="blob blob-cream" />
    </div>
  )
}
