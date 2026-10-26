import '@testing-library/jest-dom/vitest'

// ProseMirror/Tiptap precisam de geometria que o jsdom não implementa.
const noRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList
const zeroRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect
if (typeof Range !== 'undefined') {
  Range.prototype.getClientRects ??= noRects
  Range.prototype.getBoundingClientRect ??= zeroRect
}
if (typeof Text !== 'undefined') {
  ;(Text.prototype as unknown as { getClientRects?: () => DOMRectList }).getClientRects ??= noRects
}
